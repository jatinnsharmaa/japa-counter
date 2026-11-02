import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import {
  addHistory, clearPendingDelete, DEFAULT_SETTINGS, deleteSample, getMeta, getSettings, listHistory,
  listPendingDeletes, listSamples, openDb, putSample, saveSettings, setMeta,
} from '../../../src/storage/db';
import { makeSampleRecord } from '../../helpers/samples';

const fresh = () => openDb(`test-${crypto.randomUUID()}`);

describe('db', () => {
  it('saves, loads and deletes samples (oldest first), keeping typed arrays', async () => {
    const db = await fresh();
    const a = makeSampleRecord(11, 2);
    const b = makeSampleRecord(12, 1);
    await putSample(db, a);
    await putSample(db, b);
    const all = await listSamples(db);
    expect(all.map((s) => s.id)).toEqual([b.id, a.id]);
    expect(all[0].take.frames[0]).toBeInstanceOf(Float32Array);
    expect(all[0].wav.byteLength).toBe(b.wav.byteLength);
    await deleteSample(db, a.id);
    expect((await listSamples(db)).map((s) => s.id)).toEqual([b.id]);
  });

  it('queues a Drive delete when a synced sample is deleted', async () => {
    const db = await fresh();
    await putSample(db, { ...makeSampleRecord(13), driveFileId: 'file-13', synced: true });
    await deleteSample(db, 'sample-13');
    expect(await listPendingDeletes(db)).toEqual(['file-13']);
    await clearPendingDelete(db, 'file-13');
    expect(await listPendingDeletes(db)).toEqual([]);
  });

  it('returns default settings, then saved ones', async () => {
    const db = await fresh();
    expect(await getSettings(db)).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS).toEqual({
      mantraDevanagari: 'ॐ नमः शिवाय',
      mantraRoman: 'om namah shivaya',
      target: 108,
      strictness: 1,
      bell: true,
    });
    await saveSettings(db, { ...DEFAULT_SETTINGS, target: 1008 });
    expect((await getSettings(db)).target).toBe(1008);
  });

  it('lists history newest first, capped at 200', async () => {
    const db = await fresh();
    for (let i = 0; i < 205; i++) await addHistory(db, { at: i, count: 1, target: 1, secs: 1, avgSecsPerChant: 1 });
    const h = await listHistory(db);
    expect(h).toHaveLength(200);
    expect(h[0].at).toBe(204);
  });

  it('stores meta values', async () => {
    const db = await fresh();
    expect(await getMeta(db, 'micExplained')).toBeUndefined();
    await setMeta(db, 'micExplained', true);
    expect(await getMeta<boolean>(db, 'micExplained')).toBe(true);
  });
});
