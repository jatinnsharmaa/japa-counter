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
    expect(await syncSamples({ db, drive, isOnline: () => false })).toEqual({ uploaded: 0, downloaded: 0, deleted: 0, skipped: true });
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
