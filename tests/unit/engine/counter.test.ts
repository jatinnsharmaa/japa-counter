import { beforeAll, describe, expect, it } from 'vitest';
import { calibrate } from '../../../src/engine/calibrate';
import { Counter } from '../../../src/engine/counter';
import { processTake } from '../../../src/engine/takes';
import type { Calibration, Frame, Take } from '../../../src/engine/types';
import { append, floorOf, framesOf, MANTRA, OTHER, Synth } from '../../helpers/synth';

let takes: Take[];
let floor: number;
let cal: Calibration;

beforeAll(() => {
  const s = new Synth(7);
  floor = floorOf(framesOf(s.addNoise(s.silence(1))));
  takes = [];
  for (let i = 0; i < 6; i++) {
    const pcm: number[] = [];
    append(pcm, s.silence(0.6));
    append(pcm, s.chant(MANTRA, s.vary()));
    append(pcm, s.silence(0.8));
    takes.push(processTake(framesOf(s.addNoise(pcm)), floor)!);
  }
  cal = calibrate(takes)!;
});

function count(build: (s: Synth) => number[], seed: number, mutate?: (frames: Frame[]) => Frame[]) {
  const s = new Synth(seed);
  let frames = framesOf(s.addNoise(build(s)));
  if (mutate) frames = mutate(frames);
  const hits: number[] = [];
  const c = new Counter(takes, { thr: cal.base, floor, onCount: (m) => hits.push(m.te) });
  for (const f of frames) c.feed(f);
  return hits.length;
}

describe('Counter', () => {
  it('two back-to-back chants give 2 counts', () => {
    expect(count((s) => append(append(append(append(s.silence(1), s.chant(MANTRA, s.vary())), s.chant(MANTRA, s.vary())), s.silence(1)), []), 101)).toBe(2);
  });

  it('one chant matched by all six templates gives exactly 1 count (overlap rule)', () => {
    expect(count((s) => append(append(s.silence(1), s.chant(MANTRA, s.vary())), s.silence(1)), 102)).toBe(1);
  });

  it('ignores NaN frames', () => {
    const withNaN = (frames: Frame[]) => frames.flatMap((f, i) => (i % 37 === 0 ? [{ v: f.v, db: NaN }, f] : [f]));
    expect(count((s) => append(append(append(s.silence(1), s.chant(MANTRA, s.vary())), s.chant(MANTRA, s.vary())), s.silence(1)), 103, withNaN)).toBe(2);
  });

  it('rejects a match that spans 3 s of silence (voiced ratio < 60%)', () => {
    expect(
      count((s) => {
        const m = s.chant(MANTRA, s.vary());
        const h = Math.floor(m.length / 2);
        return append(append(append(append(s.silence(1), m.slice(0, h)), s.silence(3)), m.slice(h)), s.silence(1));
      }, 104),
    ).toBe(0);
  });

  it('does not count a different phrase', () => {
    expect(count((s) => append(append(append(append(s.silence(1), s.chant(OTHER, s.vary())), s.chant(OTHER, s.vary())), s.chant(OTHER, s.vary())), s.silence(1)), 105)).toBe(0);
  });

  it('does not count silence', () => {
    expect(count((s) => s.silence(10), 106)).toBe(0);
  });

  it('noise floor only moves down', () => {
    const c = new Counter(takes, { thr: cal.base, floor: -60, onCount: () => {} });
    const v = new Float32Array(12);
    c.feed({ v, db: -40 });
    expect(c.floor).toBe(-60);
    c.feed({ v, db: -70 });
    expect(c.floor).toBeCloseTo(-61);
  });

  it('frameIndex is the index of the last fed frame', () => {
    const c = new Counter(takes, { thr: cal.base, floor, onCount: () => {} });
    const v = new Float32Array(12);
    c.feed({ v, db: -60 });
    c.feed({ v, db: -60 });
    expect(c.frameIndex).toBe(1);
  });
});
