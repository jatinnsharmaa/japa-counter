import { clearPendingDelete, listPendingDeletes, listSamples, markSynced, putSample, type JapaDB } from './db';
import type { DriveApi } from './drive';
import { emptyManifest, entryFromSample, MANIFEST_NAME, mergeManifests, parseManifest, type Manifest } from './manifest';
import { rebuildFromWav } from './samples';

export interface SyncReport {
  uploaded: number;
  downloaded: number;
  deleted: number;
  /** Manifest entries with a Drive file that were not restored because the local cap was reached. */
  notDownloaded: number;
  skipped: boolean;
  /** True when shouldContinue turned false and the sync stopped before its next Drive call. */
  aborted: boolean;
}

export interface SyncDeps {
  db: JapaDB;
  drive: DriveApi;
  isOnline: () => boolean;
  /** Checked before every Drive call; returning false stops the sync there (e.g. a session started). */
  shouldContinue?: () => boolean;
  /** Downloads stop once this many samples are stored locally. */
  maxLocalSamples?: number;
}

class SyncAborted extends Error {}

const fileNameFor = (createdAt: number, id: string) => `sample-${new Date(createdAt).toISOString().replace(/:/g, '-')}-${id.slice(0, 8)}.wav`;

/** True when the text is JSON with a `samples` array, i.e. parseManifest will not silently fall back to empty. */
function isReadableManifest(text: string): boolean {
  try {
    return Array.isArray((JSON.parse(text) as { samples?: unknown } | null)?.samples);
  } catch {
    return false;
  }
}

async function readRemoteManifest(drive: DriveApi, fileId: string): Promise<Manifest> {
  const text = new TextDecoder().decode(await drive.downloadFile(fileId));
  // Never merge over a manifest we cannot read: writing back would drop its remote entries.
  if (!isReadableManifest(text)) throw new Error('Remote manifest.json is unreadable; refusing to overwrite it');
  return parseManifest(text);
}

/** Setup-screen sync: deletes, uploads, manifest merge, downloads. Sessions never call this. */
export async function syncSamples(deps: SyncDeps): Promise<SyncReport> {
  const report: SyncReport = { uploaded: 0, downloaded: 0, deleted: 0, notDownloaded: 0, skipped: false, aborted: false };
  if (!deps.isOnline()) return { ...report, skipped: true };
  try {
    await runSync(deps, report);
    return report;
  } catch (err) {
    if (err instanceof SyncAborted) return { ...report, aborted: true };
    throw err;
  }
}

async function runSync({ db, drive, shouldContinue = () => true, maxLocalSamples = Infinity }: SyncDeps, report: SyncReport): Promise<void> {
  const step = () => {
    if (!shouldContinue()) throw new SyncAborted();
  };

  step();
  const folder = await drive.ensureSamplesFolder();
  step();
  const files = await drive.listFiles(folder);
  const remoteFileIds = new Set(files.map((f) => f.id));
  const manifestFile = files.find((f) => f.name === MANIFEST_NAME);
  if (manifestFile) step();
  const remote = manifestFile ? await readRemoteManifest(drive, manifestFile.id) : emptyManifest();

  const deleted = new Set<string>();
  for (const id of await listPendingDeletes(db)) {
    step();
    await drive.deleteFile(id);
    await clearPendingDelete(db, id);
    deleted.add(id);
  }
  report.deleted = deleted.size;

  // File ids the manifest must drop: deleted ones, and old ids of samples uploaded again below.
  const dropped = new Set(deleted);
  const liveFileIds = new Set(remoteFileIds); // plus files uploaded below
  for (const s of await listSamples(db)) {
    const fileGone = s.synced && !!s.driveFileId && !remoteFileIds.has(s.driveFileId) && !deleted.has(s.driveFileId);
    if (s.synced && !fileGone) continue;
    step();
    const fileId = await drive.uploadFile(folder, fileNameFor(s.createdAt, s.id), 'audio/wav', s.wav);
    if (await markSynced(db, s.id, fileId)) {
      liveFileIds.add(fileId);
      if (s.driveFileId) dropped.add(s.driveFileId);
      report.uploaded++;
    } else {
      // Deleted locally while uploading: markSynced queued the new file for deletion.
      dropped.add(fileId);
      step();
      await drive.deleteFile(fileId);
      await clearPendingDelete(db, fileId);
    }
  }

  const local = await listSamples(db);
  // Deletes queued since the delete step must not be downloaded again or kept in the manifest.
  for (const id of await listPendingDeletes(db)) dropped.add(id);
  const localIds = new Set(local.map((s) => s.id));
  // The remote side wins merge conflicts, except where its file is gone and ours is live (e.g. a re-upload
  // whose run failed before the manifest write): then the dead remote entry is dropped.
  const liveLocalFile = new Map(local.filter((s) => s.synced && s.driveFileId && liveFileIds.has(s.driveFileId)).map((s) => [s.id, s.driveFileId]));
  for (const e of remote.samples) {
    const ours = liveLocalFile.get(e.sampleId);
    if (ours && ours !== e.fileId && !liveFileIds.has(e.fileId)) dropped.add(e.fileId);
  }
  const manifest = mergeManifests(remote, { version: 1, samples: local.filter((s) => s.synced && s.driveFileId).map(entryFromSample) }, dropped);

  let localCount = local.length;
  for (const e of manifest.samples) {
    if (localIds.has(e.sampleId) || !remoteFileIds.has(e.fileId)) continue;
    if (localCount >= maxLocalSamples) {
      report.notDownloaded++;
      continue;
    }
    step();
    const wav = await drive.downloadFile(e.fileId);
    const rec = rebuildFromWav({ id: e.sampleId, createdAt: e.createdAt, wav, floor: e.floor, synced: true, driveFileId: e.fileId });
    if (!rec) continue;
    await putSample(db, rec);
    localCount++;
    report.downloaded++;
  }

  const lateDeletes = new Set(await listPendingDeletes(db));
  const final: Manifest = { version: 1, samples: manifest.samples.filter((e) => !lateDeletes.has(e.fileId)) };
  step();
  await drive.uploadFile(folder, MANIFEST_NAME, 'application/json', JSON.stringify(final), manifestFile?.id);
}

/** Re-runs sync whenever the browser comes back online (upload queue drains). */
export function startAutoSync(run: () => Promise<unknown>, target: EventTarget = window): () => void {
  const onOnline = () => void run();
  target.addEventListener('online', onOnline);
  return () => target.removeEventListener('online', onOnline);
}
