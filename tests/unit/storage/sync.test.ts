import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import { deleteSample, getSample, listPendingDeletes, listSamples, openDb, putSample } from '../../../src/storage/db';
import { parseManifest } from '../../../src/storage/manifest';
import { startAutoSync, syncSamples } from '../../../src/storage/sync';
import { FakeDrive } from '../../helpers/fake-drive';
import { makeSampleRecord } from '../../helpers/samples';

const fresh = () => openDb(`test-${crypto.randomUUID()}`);

describe('syncSamples', () => {
  it('does nothing offline', async () => {
    const db = await fresh();
    await putSample(db, makeSampleRecord(101));
    const drive = new FakeDrive();
    const spy = vi.spyOn(drive, 'ensureSamplesFolder');
    expect(await syncSamples({ db, drive, isOnline: () => false })).toEqual({ uploaded: 0, downloaded: 0, deleted: 0, notDownloaded: 0, skipped: true, aborted: false });
    expect(spy).not.toHaveBeenCalled();
  });

  it('uploads unsynced samples, marks them synced and writes the manifest', async () => {
    const db = await fresh();
    await putSample(db, makeSampleRecord(102));
    const drive = new FakeDrive();
    const report = await syncSamples({ db, drive, isOnline: () => true });
    expect(report.uploaded).toBe(1);
    const s = (await getSample(db, 'sample-102'))!;
    expect(s.synced).toBe(true);
    expect(drive.files.get(s.driveFileId!)?.name).toMatch(/^sample-.*\.wav$/);
    expect(parseManifest(drive.manifestText()!).samples.map((e) => e.sampleId)).toEqual(['sample-102']);
  });

  it('restores samples on a fresh profile with re-extracted features', async () => {
    const drive = new FakeDrive();
    const a = await fresh();
    await putSample(a, makeSampleRecord(103));
    await putSample(a, makeSampleRecord(104));
    await syncSamples({ db: a, drive, isOnline: () => true });
    const b = await fresh();
    const report = await syncSamples({ db: b, drive, isOnline: () => true });
    expect(report.downloaded).toBe(2);
    const restored = await listSamples(b);
    const original = await listSamples(a);
    expect(restored.map((s) => s.id)).toEqual(original.map((s) => s.id));
    expect(restored[0].take.frames.length).toBe(original[0].take.frames.length);
    expect(restored[0].durationSec).toBe(original[0].durationSec);
    expect(restored.every((s) => s.synced)).toBe(true);
  });

  it('keeps both sides when merging', async () => {
    const drive = new FakeDrive();
    const a = await fresh();
    await putSample(a, makeSampleRecord(105));
    await syncSamples({ db: a, drive, isOnline: () => true });
    const b = await fresh();
    await putSample(b, makeSampleRecord(106));
    await syncSamples({ db: b, drive, isOnline: () => true });
    expect((await listSamples(b)).map((s) => s.id).sort()).toEqual(['sample-105', 'sample-106']);
    expect(parseManifest(drive.manifestText()!).samples).toHaveLength(2);
  });

  it('applies queued deletes to Drive and the manifest', async () => {
    const db = await fresh();
    await putSample(db, makeSampleRecord(107));
    const drive = new FakeDrive();
    await syncSamples({ db, drive, isOnline: () => true });
    await deleteSample(db, 'sample-107');
    const report = await syncSamples({ db, drive, isOnline: () => true });
    expect(report.deleted).toBe(1);
    expect(await listPendingDeletes(db)).toEqual([]);
    expect(parseManifest(drive.manifestText()!).samples).toEqual([]);
    expect((await listSamples(db))).toEqual([]);
  });

  it('aborts without overwriting a corrupt remote manifest', async () => {
    const db = await fresh();
    await putSample(db, makeSampleRecord(108));
    const drive = new FakeDrive();
    const garbage = '{"version":1,"samples":[{"sampleId":"x"';
    await drive.uploadFile(drive.folderId, 'manifest.json', 'application/json', garbage);
    await expect(syncSamples({ db, drive, isOnline: () => true })).rejects.toThrow(/manifest/i);
    expect(drive.manifestText()).toBe(garbage);
    expect(drive.uploads).toBe(1);
    expect((await getSample(db, 'sample-108'))!.synced).toBe(false);
  });
});

describe('syncSamples under races', () => {
  it('stops before the next Drive call once shouldContinue turns false', async () => {
    const db = await fresh();
    await putSample(db, makeSampleRecord(120));
    await putSample(db, makeSampleRecord(121));
    const drive = new FakeDrive();
    let go = true;
    drive.onCall = (op) => {
      if (op === 'uploadFile') go = false; // a session starts while the first upload is in flight
    };
    const report = await syncSamples({ db, drive, isOnline: () => true, shouldContinue: () => go });
    expect(report.aborted).toBe(true);
    expect(drive.calls).toEqual(['ensureSamplesFolder', 'listFiles', 'uploadFile']);
    expect(drive.manifestText()).toBeUndefined();
    expect((await listSamples(db)).map((s) => s.synced)).toEqual([true, false]);
  });

  it('keeps a sample deleted while its upload is in flight deleted, on Drive and in the manifest', async () => {
    const db = await fresh();
    await putSample(db, makeSampleRecord(122));
    const drive = new FakeDrive();
    drive.onCall = async (op, name) => {
      if (op === 'uploadFile' && name?.endsWith('.wav')) await deleteSample(db, 'sample-122');
    };
    await syncSamples({ db, drive, isOnline: () => true });
    expect(await getSample(db, 'sample-122')).toBeUndefined();
    expect(drive.wavIds()).toEqual([]);
    expect(parseManifest(drive.manifestText()!).samples).toEqual([]);
    expect(await listPendingDeletes(db)).toEqual([]);
  });

  it('does not restore a sample deleted after the delete step but before downloads', async () => {
    const db = await fresh();
    await putSample(db, makeSampleRecord(123));
    const drive = new FakeDrive();
    await syncSamples({ db, drive, isOnline: () => true });
    const oldFileId = (await getSample(db, 'sample-123'))!.driveFileId!;
    await putSample(db, makeSampleRecord(124));
    drive.onCall = async (op, name) => {
      if (op === 'uploadFile' && name?.endsWith('.wav')) await deleteSample(db, 'sample-123');
    };
    const downloads = vi.spyOn(drive, 'downloadFile');
    await syncSamples({ db, drive, isOnline: () => true });
    expect(downloads).not.toHaveBeenCalledWith(oldFileId);
    expect((await listSamples(db)).map((s) => s.id)).toEqual(['sample-124']);
    expect(parseManifest(drive.manifestText()!).samples.map((e) => e.sampleId)).toEqual(['sample-124']);
  });

  it('uploads samples again when their Drive files are gone', async () => {
    const db = await fresh();
    await putSample(db, makeSampleRecord(125));
    await putSample(db, makeSampleRecord(126));
    const drive = new FakeDrive();
    await syncSamples({ db, drive, isOnline: () => true });
    drive.files.clear(); // folder trashed, or a different Google account
    const report = await syncSamples({ db, drive, isOnline: () => true });
    expect(report.uploaded).toBe(2);
    const local = await listSamples(db);
    expect(local.every((s) => s.synced && drive.files.has(s.driveFileId!))).toBe(true);
    const entries = parseManifest(drive.manifestText()!).samples;
    expect(entries.map((e) => e.sampleId)).toEqual(['sample-125', 'sample-126']);
    expect(entries.every((e) => drive.files.has(e.fileId))).toBe(true);
  });

  it('points the manifest at the new file when one sample file is gone but the manifest is not', async () => {
    const db = await fresh();
    await putSample(db, makeSampleRecord(127));
    await putSample(db, makeSampleRecord(128));
    const drive = new FakeDrive();
    await syncSamples({ db, drive, isOnline: () => true });
    drive.files.delete((await getSample(db, 'sample-127'))!.driveFileId!);
    const report = await syncSamples({ db, drive, isOnline: () => true });
    expect(report.uploaded).toBe(1);
    const entries = parseManifest(drive.manifestText()!).samples;
    expect(entries.map((e) => e.sampleId)).toEqual(['sample-127', 'sample-128']);
    expect(entries.every((e) => drive.files.has(e.fileId))).toBe(true);
    expect(entries[0].fileId).toBe((await getSample(db, 'sample-127'))!.driveFileId);
  });

  it('downloads at most maxLocalSamples and reports the rest', async () => {
    const rec = makeSampleRecord(129);
    const drive = new FakeDrive();
    drive.seedSamples(12, rec.wav, rec);
    const db = await fresh();
    const report = await syncSamples({ db, drive, isOnline: () => true, maxLocalSamples: 10 });
    expect(report.downloaded).toBe(10);
    expect(report.notDownloaded).toBe(2);
    expect(await listSamples(db)).toHaveLength(10);
    expect(parseManifest(drive.manifestText()!).samples).toHaveLength(12);
  });
});

describe('startAutoSync', () => {
  it('drains the queue when the browser comes back online', async () => {
    const target = new EventTarget();
    const run = vi.fn(async () => {});
    const stop = startAutoSync(run, target);
    target.dispatchEvent(new Event('online'));
    expect(run).toHaveBeenCalledOnce();
    stop();
    target.dispatchEvent(new Event('online'));
    expect(run).toHaveBeenCalledOnce();
  });
});
