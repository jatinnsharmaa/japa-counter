import { describe, expect, it } from 'vitest';
import { runSyntheticSuite } from './synthetic-suite';

describe('synthetic accuracy harness (v1 reference seeds)', () => {
  it.each([7, 23])('seed %i: 30 of 30, 0 false, every count under 1 s', (seed) => {
    const r = runSyntheticSuite(seed);
    console.log(JSON.stringify(r));
    expect(r.overcount).toBe(0);
    expect(r.falseInDistractor).toBe(0);
    expect(r.counted).toBe(r.expected);
    expect(r.maxLatencySec).toBeLessThan(1);
  }, 180_000);
});
