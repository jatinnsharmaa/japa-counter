import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { decodeWav, encodeWav } from '../../../src/audio/wav';
import { FRAME, HOP, SR } from '../../../src/engine/constants';
import { ENGINE_VERSION } from '../../../src/engine/version';
import { getSample, openDb, putSample } from '../../../src/storage/db';
import { buildSampleFromRecording, ensureCurrentFeatures, isUsable, rebuildFromWav, trimmedWav } from '../../../src/storage/samples';
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
    again.take.frames.forEach((f, i) => expect(Array.from(f)).toEqual(Array.from(rec.take.frames[i])));
    expect(Array.from(again.take.mean)).toEqual(Array.from(rec.take.mean));
    expect(again.take.start).toBe(rec.take.start);
    expect(again.take.end).toBe(rec.take.end);
    expect(again.trimStart).toBe(rec.trimStart);
  });
});

describe('ensureCurrentFeatures', () => {
  it('re-extracts samples cached by another engine version and leaves current ones alone', async () => {
    const db = await openDb(`test-${crypto.randomUUID()}`);
    const stale = makeSampleRecord(24);
    await putSample(db, { ...stale, engineVersion: 0, take: { frames: [], mean: new Float32Array(12), dur: 0, start: 0, end: 0 }, synced: true, driveFileId: 'f' });
    await putSample(db, makeSampleRecord(25));
    expect(await ensureCurrentFeatures(db)).toEqual({ updated: 1, failed: [] });
    const fixed = (await getSample(db, stale.id))!;
    expect(fixed.engineVersion).toBe(ENGINE_VERSION);
    expect(fixed.take.frames.length).toBe(stale.take.frames.length);
    expect(fixed).toMatchObject({ synced: true, driveFileId: 'f' });
    expect(await ensureCurrentFeatures(db)).toEqual({ updated: 0, failed: [] });
  });

  const emptyTake = { frames: [], mean: new Float32Array(12), dur: 0, start: 0, end: 0 };

  it('flags a stale sample that holds no chant, leaves it on disk, and still rebuilds the others', async () => {
    const db = await openDb(`test-${crypto.randomUUID()}`);
    const good = makeSampleRecord(27);
    const bad = { ...makeSampleRecord(28), wav: encodeWav(new Float32Array(16000)), engineVersion: 0, take: emptyTake };
    await putSample(db, { ...good, engineVersion: 0, take: emptyTake });
    await putSample(db, bad);
    expect(await ensureCurrentFeatures(db)).toEqual({ updated: 1, failed: [bad.id] });
    const left = (await getSample(db, bad.id))!;
    expect(left.engineVersion).toBe(0);
    expect(isUsable(left)).toBe(false);
    expect(isUsable((await getSample(db, good.id))!)).toBe(true);
  });

  it('does not let a corrupt WAV abort re-extraction of later samples', async () => {
    const db = await openDb(`test-${crypto.randomUUID()}`);
    const corrupt = { ...makeSampleRecord(29, 1), wav: new ArrayBuffer(10), engineVersion: 0, take: emptyTake };
    const good = { ...makeSampleRecord(30, 2), engineVersion: 0, take: emptyTake };
    await putSample(db, corrupt);
    await putSample(db, good);
    expect(await ensureCurrentFeatures(db)).toEqual({ updated: 1, failed: [corrupt.id] });
    expect((await getSample(db, corrupt.id))!.engineVersion).toBe(0);
    expect((await getSample(db, good.id))!.engineVersion).toBe(ENGINE_VERSION);
  });
});

describe('isUsable', () => {
  it('is true only for samples of the current engine version', () => {
    const rec = makeSampleRecord(31);
    expect(isUsable(rec)).toBe(true);
    expect(isUsable({ ...rec, engineVersion: 0 })).toBe(false);
  });
});

describe('trimmedWav', () => {
  it('encodes only the voiced span', () => {
    const rec = makeSampleRecord(26);
    expect(decodeWav(trimmedWav(rec)).pcm.length).toBe(rec.trimEnd - rec.trimStart);
  });
});
