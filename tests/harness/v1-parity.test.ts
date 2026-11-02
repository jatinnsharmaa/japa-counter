import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { calibrate } from '../../src/engine/calibrate';
import { Counter } from '../../src/engine/counter';
import { processTake } from '../../src/engine/takes';
import type { Frame, MatchResult, Take } from '../../src/engine/types';
import { append, floorOf, framesOf, MANTRA, Synth } from '../helpers/synth';

interface V1Engine {
  FeatureStream: new (rate: number, onFrame: (f: Frame) => void) => { push(a: Float32Array): void };
  processTake(frames: Frame[], floor: number): { frames: Float32Array[]; mean: Float32Array; dur: number } | null;
  calibrate(takes: unknown[]): { base: number; mean: number; max: number } | null;
  Counter: new (takes: unknown[], opts: { thr: number; floor: number; onCount: (m: MatchResult) => void }) => { feed(f: Frame): void };
}

const src = readFileSync(new URL('../helpers/v1/core.js', import.meta.url), 'utf8');
const v1 = new Function(`${src}\nreturn { FeatureStream, processTake, calibrate, Counter };`)() as V1Engine;

const v1Frames = (pcm: number[]) => {
  const out: Frame[] = [];
  new v1.FeatureStream(16000, (f) => out.push(f)).push(Float32Array.from(pcm));
  return out;
};

describe('v1 parity at 16 kHz', () => {
  const s = new Synth(7);
  const floor = floorOf(framesOf(s.addNoise(s.silence(1))));
  const recordings: number[][] = [];
  for (let i = 0; i < 4; i++) recordings.push(s.addNoise(append(append(append([], s.silence(0.6)), s.chant(MANTRA, s.vary())), s.silence(0.8))));
  const stream: number[] = s.silence(1);
  for (let i = 0; i < 3; i++) append(stream, s.chant(MANTRA, s.vary()));
  append(stream, s.silence(1));
  const noisyStream = s.addNoise(stream);

  it('frames are identical', () => {
    const a = framesOf(recordings[0]);
    const b = v1Frames(recordings[0]);
    expect(a.length).toBe(b.length);
    for (let i = 0; i < a.length; i++) {
      expect(a[i].db).toBeCloseTo(b[i].db, 6);
      for (let k = 0; k < 12; k++) expect(a[i].v[k]).toBeCloseTo(b[i].v[k], 6);
    }
  });

  it('takes, calibration and counts are identical', () => {
    const ours = recordings.map((r) => processTake(framesOf(r), floor)!) as Take[];
    const theirs = recordings.map((r) => v1.processTake(v1Frames(r), floor)!);
    ours.forEach((t, i) => {
      expect(t.frames.length).toBe(theirs[i].frames.length);
      expect(t.dur).toBeCloseTo(theirs[i].dur, 9);
    });
    const ca = calibrate(ours)!;
    const cb = v1.calibrate(theirs)!;
    expect(ca.base).toBeCloseTo(cb.base, 9);
    expect(ca.mean).toBeCloseTo(cb.mean, 9);
    expect(ca.max).toBeCloseTo(cb.max, 9);

    const a: number[] = [];
    const b: number[] = [];
    const ourCounter = new Counter(ours, { thr: ca.base, floor, onCount: (m) => a.push(m.te) });
    const theirCounter = new v1.Counter(theirs, { thr: cb.base, floor, onCount: (m) => b.push(m.te) });
    for (const f of framesOf(noisyStream)) ourCounter.feed(f);
    for (const f of v1Frames(noisyStream)) theirCounter.feed(f);
    expect(a).toEqual(b);
    expect(a.length).toBe(3);
  });
}, 60_000);
