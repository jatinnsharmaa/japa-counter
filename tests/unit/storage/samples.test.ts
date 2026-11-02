import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { decodeWav } from '../../../src/audio/wav';
import { FRAME, HOP, SR } from '../../../src/engine/constants';
import { ENGINE_VERSION } from '../../../src/engine/version';
import { getSample, openDb, putSample } from '../../../src/storage/db';
import { buildSampleFromRecording, ensureCurrentFeatures, rebuildFromWav, trimmedWav } from '../../../src/storage/samples';
import { makeSamplePcm, makeSampleRecord } from '../../helpers/samples';

describe('buildSampleFromRecording', () => {
  it('stores the whole chant phase as WAV and the voiced span as trim points', () => {
    const { pcm, floor } = makeSamplePcm(21);
    const rec = buildSampleFromRecording(pcm, floor, 5, 'x')!;
    expect(rec).toMatchObject({ id: 'x', createdAt: 5, floor, engineVersion: ENGINE_VERSION, synced: false });
    expect(decodeWav(rec.wav).pcm.length).toBe(pcm.length);
    expect(rec.trimStart).toBe(rec.take.start * HOP);
    expect(rec.trimEnd).toBe(Math.min(pcm.length, rec.take.end * HOP + FRAME));
    expect(rec.durationSec).toBeCloseTo((rec.trimEnd - rec.trimStart) / SR, 9);
    expect(rec.trimStart).toBeGreaterThan(0.4 * SR); // leading 0.6 s of room noise trimmed
  });

  it('returns null when there is no full chant', () => {
    const { floor } = makeSamplePcm(22);
    expect(buildSampleFromRecording(new Float32Array(SR), floor)).toBeNull();
  });
});

describe('rebuildFromWav', () => {
  it('re-extracts exactly the same features from the stored WAV', () => {
    const rec = makeSampleRecord(23);
    const again = rebuildFromWav(rec)!;
    expect(again.take.frames.length).toBe(rec.take.frames.length);
    expect(Array.from(again.take.frames[10])).toEqual(Array.from(rec.take.frames[10]));
    expect(again.trimStart).toBe(rec.trimStart);
  });
});

describe('ensureCurrentFeatures', () => {
  it('re-extracts samples cached by another engine version and leaves current ones alone', async () => {
    const db = await openDb(`test-${crypto.randomUUID()}`);
    const stale = makeSampleRecord(24);
    await putSample(db, { ...stale, engineVersion: 0, take: { frames: [], mean: new Float32Array(12), dur: 0, start: 0, end: 0 }, synced: true, driveFileId: 'f' });
    await putSample(db, makeSampleRecord(25));
    expect(await ensureCurrentFeatures(db)).toBe(1);
    const fixed = (await getSample(db, stale.id))!;
    expect(fixed.engineVersion).toBe(ENGINE_VERSION);
    expect(fixed.take.frames.length).toBe(stale.take.frames.length);
    expect(fixed).toMatchObject({ synced: true, driveFileId: 'f' });
    expect(await ensureCurrentFeatures(db)).toBe(0);
  });
});

describe('trimmedWav', () => {
  it('encodes only the voiced span', () => {
    const rec = makeSampleRecord(26);
    expect(decodeWav(trimmedWav(rec)).pcm.length).toBe(rec.trimEnd - rec.trimStart);
  });
});
