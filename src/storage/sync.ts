import { clearPendingDelete, listPendingDeletes, listSamples, putSample, type JapaDB } from './db';
import type { DriveApi } from './drive';
import { emptyManifest, entryFromSample, MANIFEST_NAME, mergeManifests, parseManifest, type Manifest } from './manifest';
import { rebuildFromWav } from './samples';

export interface SyncReport {
  uploaded: number;
  downloaded: number;
  deleted: number;
  skipped: boolean;
}

export interface SyncDeps {
  db: JapaDB;
  drive: DriveApi;
  isOnline: () => boolean;
}

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
export async function syncSamples({ db, drive, isOnline }: SyncDeps): Promise<SyncReport> {
  const report: SyncReport = { uploaded: 0, downloaded: 0, deleted: 0, skipped: false };
  if (!isOnline()) return { ...report, skipped: true };

  const folder = await drive.ensureSamplesFolder();
  const files = await drive.listFiles(folder);
  const manifestFile = files.find((f) => f.name === MANIFEST_NAME);
  const remote = manifestFile ? await readRemoteManifest(drive, manifestFile.id) : emptyManifest();

  const deleted = new Set<string>();
  for (const id of await listPendingDeletes(db)) {
    await drive.deleteFile(id);
    await clearPendingDelete(db, id);
    deleted.add(id);
  }
  report.deleted = deleted.size;

  for (const s of await listSamples(db)) {
    if (s.synced) continue;
    const driveFileId = await drive.uploadFile(folder, fileNameFor(s.createdAt, s.id), 'audio/wav', s.wav);
    await putSample(db, { ...s, driveFileId, synced: true });
    report.uploaded++;
  }

  const local = await listSamples(db);
  const localIds = new Set(local.map((s) => s.id));
  const manifest = mergeManifests(remote, { version: 1, samples: local.filter((s) => s.synced && s.driveFileId).map(entryFromSample) }, deleted);

  const remoteIds = new Set(files.map((f) => f.id));
  for (const e of manifest.samples) {
    if (localIds.has(e.sampleId) || !remoteIds.has(e.fileId)) continue;
    const wav = await drive.downloadFile(e.fileId);
    const rec = rebuildFromWav({ id: e.sampleId, createdAt: e.createdAt, wav, floor: e.floor, synced: true, driveFileId: e.fileId });
    if (!rec) continue;
    await putSample(db, rec);
    report.downloaded++;
  }

  await drive.uploadFile(folder, MANIFEST_NAME, 'application/json', JSON.stringify(manifest), manifestFile?.id);
  return report;
}

/** Re-runs sync whenever the browser comes back online (upload queue drains). */
export function startAutoSync(run: () => Promise<unknown>, target: EventTarget = window): () => void {
  const onOnline = () => void run();
  target.addEventListener('online', onOnline);
  return () => target.removeEventListener('online', onOnline);
}
