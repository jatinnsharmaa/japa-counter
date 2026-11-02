import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import { isValidTarget } from '../../../src/state/store';
import { getSettings, listPendingDeletes, listSamples } from '../../../src/storage/db';
import { makeSampleRecord } from '../../helpers/samples';
import { makeStore } from '../../helpers/store';

describe('store', () => {
  it('loads defaults and has no calibration below 3 samples', async () => {
    const store = await makeStore([31, 32]);
    expect(store.settings.value.target).toBe(108);
    expect(store.samples.value).toHaveLength(2);
    expect(store.calibration.value).toBeNull();
    expect(store.canStart.value).toBe(false);
  });

  it('calibrates with 3 samples and exposes the live threshold', async () => {
    const store = await makeStore([31, 32, 33]);
    const cal = store.calibration.value!;
    expect(store.threshold.value).toBeCloseTo(cal.base * 1.0);
    await store.updateSettings({ strictness: 0.9 });
    expect(store.threshold.value).toBeCloseTo(cal.base * 0.9);
    expect(store.canStart.value).toBe(true);
    expect(store.outliers.value).toHaveLength(3);
    expect(store.sampleFloor.value).toBeCloseTo(store.samples.value.reduce((a, s) => a + s.floor, 0) / 3);
  });

  it('leaves samples without current-engine features out of calibration', async () => {
    const store = await makeStore([31, 32, 33]);
    await store.addSample({ ...makeSampleRecord(35), engineVersion: 0 });
    expect(store.samples.value).toHaveLength(4);
    expect(store.usableSamples.value).toHaveLength(3);
    expect(store.outliers.value).toHaveLength(4);
    expect(store.outliers.value[3]).toBe(false);
  });

  it('refuses to add an eleventh sample', async () => {
    const store = await makeStore([61, 62, 63, 64, 65, 66, 67, 68, 69, 70]);
    const spy = vi.fn();
    store.onLocalChange(spy);
    await expect(store.addSample(makeSampleRecord(71))).rejects.toThrow('Sample limit reached');
    expect((await listSamples(store.db)).map((s) => s.id)).not.toContain('sample-71');
    expect(store.samples.value).toHaveLength(10);
    expect(spy).not.toHaveBeenCalled();
  });

  it('persists settings', async () => {
    const store = await makeStore();
    await store.updateSettings({ target: 1008 });
    expect((await getSettings(store.db)).target).toBe(1008);
  });

  it('cannot start with an invalid target', async () => {
    const store = await makeStore([31, 32, 33]);
    await store.updateSettings({ target: 0 });
    expect(store.canStart.value).toBe(false);
  });

  it('adds and removes samples, notifying local-change listeners', async () => {
    const store = await makeStore();
    const spy = vi.fn();
    store.onLocalChange(spy);
    await store.addSample(makeSampleRecord(34));
    expect(store.samples.value).toHaveLength(1);
    await store.removeSample('sample-34');
    expect(store.samples.value).toHaveLength(0);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(await listPendingDeletes(store.db)).toEqual([]);
  });

  it('records sessions newest first', async () => {
    const store = await makeStore();
    await store.recordSession({ at: 1, count: 5, target: 108, secs: 15, avgSecsPerChant: 3 });
    await store.recordSession({ at: 2, count: 6, target: 108, secs: 18, avgSecsPerChant: 3 });
    expect(store.history.value.map((h) => h.at)).toEqual([2, 1]);
  });

  it('remembers that the mic was explained', async () => {
    const store = await makeStore();
    expect(store.micExplained.value).toBe(false);
    await store.markMicExplained();
    expect(store.micExplained.value).toBe(true);
  });

  it('validates targets 1..100,000', () => {
    expect([0, 1, 108, 100000, 100001, 1.5, NaN].map(isValidTarget)).toEqual([false, true, true, true, false, false, false]);
  });
});
