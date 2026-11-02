import { calibrate } from '../../src/engine/calibrate';
import { FPS, SR } from '../../src/engine/constants';
import { Counter } from '../../src/engine/counter';
import { processTake } from '../../src/engine/takes';
import type { Take } from '../../src/engine/types';
import { append, floorOf, framesOf, MANTRA, OTHER, Synth, type Seg, type Voice } from '../helpers/synth';

export interface SyntheticResult {
  seed: number;
  expected: number;
  counted: number;
  overcount: number;
  undercount: number;
  falseInDistractor: number;
  maxLatencySec: number;
}

/** Enrol 6 samples; stream 20 chants, 2 s gap, 6 distractor phrases, 1 s gap, 10 chants at 0.75–1.3× pace. */
export function runSyntheticSuite(seed: number): SyntheticResult {
  const s = new Synth(seed);
  const floor = floorOf(framesOf(s.addNoise(s.silence(1))));
  const takes: Take[] = [];
  for (let i = 0; i < 6; i++) {
    const pcm: number[] = [];
    append(pcm, s.silence(0.6));
    append(pcm, s.chant(MANTRA, s.vary()));
    append(pcm, s.silence(0.8));
    const take = processTake(framesOf(s.addNoise(pcm)), floor);
    if (!take) throw new Error(`seed ${seed}: take ${i} rejected`);
    takes.push(take);
  }
  const cal = calibrate(takes);
  if (!cal) throw new Error(`seed ${seed}: calibration failed`);

  const stream: number[] = s.silence(1);
  const marks: { kind: 'M' | 'O'; end: number }[] = [];
  const addReps = (spec: readonly Seg[], n: number, voice: () => Voice) => {
    for (let i = 0; i < n; i++) {
      append(stream, s.chant(spec, voice()));
      marks.push({ kind: spec === MANTRA ? 'M' : 'O', end: stream.length / SR });
    }
  };
  addReps(MANTRA, 20, () => s.vary());
  append(stream, s.silence(2));
  addReps(OTHER, 6, () => s.vary());
  append(stream, s.silence(1));
  addReps(MANTRA, 10, () => ({ ...s.vary(), tempo: 0.75 + 0.55 * s.rnd() }));
  append(stream, s.silence(2));
  const noisy = s.addNoise(stream);

  const counts: { te: number; at: number }[] = [];
  const counter: Counter = new Counter(takes, { thr: cal.base, floor, onCount: (m) => counts.push({ te: m.te, at: counter.frameIndex }) });
  for (const f of framesOf(noisy)) counter.feed(f);

  const expected = 30;
  const otherStart = marks[19].end + 2;
  const otherEnd = marks[25].end;
  const counted = counts.length;
  return {
    seed,
    expected,
    counted,
    overcount: Math.max(0, counted - expected),
    undercount: Math.max(0, expected - counted),
    falseInDistractor: counts.filter((c) => c.te / FPS > otherStart && c.te / FPS <= otherEnd + 0.5).length,
    maxLatencySec: Math.max(0, ...counts.map((c) => (c.at - c.te) / FPS)),
  };
}
