import { beforeAll, describe, expect, it } from 'vitest';
import { calibrate, flagOutliers, liveThreshold, STRICTNESS_STEPS, THRESHOLD_MAX, THRESHOLD_MIN } from '../../../src/engine/calibrate';
import { processTake } from '../../../src/engine/takes';
import type { Take } from '../../../src/engine/types';
import { append, floorOf, framesOf, MANTRA, OTHER, Synth } from '../../helpers/synth';

let takes: Take[];
let other: Take;

beforeAll(() => {
  const s = new Synth(7);
  const floor = floorOf(framesOf(s.addNoise(s.silence(1))));
  const record = (spec = MANTRA) => {
    const pcm: number[] = [];
    append(pcm, s.silence(0.6));
    append(pcm, s.chant(spec, s.vary()));
    append(pcm, s.silence(0.8));
    return processTake(framesOf(s.addNoise(pcm)), floor)!;
  };
  takes = [record(), record(), record(), record()];
  other = record(OTHER);
});

describe('calibrate', () => {
  it('needs at least two takes', () => {
    expect(calibrate([])).toBeNull();
    expect(calibrate(takes.slice(0, 1))).toBeNull();
  });

  it('clamps the base threshold into [0.26, 0.32]', () => {
    const cal = calibrate(takes)!;
    expect(cal.base).toBeGreaterThanOrEqual(THRESHOLD_MIN);
    expect(cal.base).toBeLessThanOrEqual(THRESHOLD_MAX);
    expect(cal.base).toBeCloseTo(Math.min(THRESHOLD_MAX, Math.max(THRESHOLD_MIN, 1.3 * cal.max, 2.2 * cal.mean)), 12);
  });

  it('gives one average pairwise score per take', () => {
    const cal = calibrate(takes)!;
    expect(cal.perAvg).toHaveLength(takes.length);
    expect(cal.perAvg.every((x) => Number.isFinite(x) && x > 0)).toBe(true);
  });

  it('a different phrase scores worse than the mantra takes against each other', () => {
    const cal = calibrate([...takes, other])!;
    const odd = cal.perAvg[cal.perAvg.length - 1];
    expect(odd).toBeGreaterThan(Math.max(...cal.perAvg.slice(0, -1)));
    expect(flagOutliers(cal.perAvg)[takes.length]).toBe(true);
  });
});

describe('flagOutliers', () => {
  it('flags takes whose average is more than 1.5× the median', () => {
    expect(flagOutliers([0.1, 0.11, 0.12, 0.2])).toEqual([false, false, false, true]);
  });
  it('flags nothing with fewer than 3 takes', () => {
    expect(flagOutliers([0.1, 0.5])).toEqual([false, false]);
  });
});

describe('liveThreshold', () => {
  it('multiplies the base by the strictness step', () => {
    expect(STRICTNESS_STEPS).toEqual([0.85, 0.9, 0.95, 1.0, 1.05, 1.1]);
    expect(liveThreshold({ base: 0.3, mean: 0, sd: 0, max: 0, perAvg: [] }, 0.9)).toBeCloseTo(0.27);
  });
});
