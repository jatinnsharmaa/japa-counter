import { describe, expect, it } from 'vitest';
import { Matcher } from '../../../src/engine/matcher';
import { unit, vsub } from '../../../src/engine/vec';

const M = 100;
// A template that sweeps 180° through a plane: every frame is distinct and order matters.
const sweep = (n: number) =>
  Array.from({ length: n }, (_, i) => {
    const th = (Math.PI * i) / (n - 1);
    const v = new Float32Array(12);
    v[0] = Math.cos(th);
    v[1] = Math.sin(th);
    v[2] = 0.2;
    return unit(v);
  });
const away = (n: number) =>
  Array.from({ length: n }, () => {
    const v = new Float32Array(12);
    v[5] = 1;
    return v;
  });
const tpl = sweep(M);
const atSpeed = (f: number) => {
  const N = Math.round(M * f);
  return Array.from({ length: N }, (_, j) => tpl[Math.floor((j * M) / N)]);
};
const pad = (s: Float32Array[]) => [...away(30), ...s, ...away(30)];
function run(stream: Float32Array[]) {
  const m = new Matcher(tpl);
  let best = Infinity;
  const results = [];
  for (let t = 0; t < stream.length; t++) {
    const r = m.step(stream[t], t);
    if (r) {
      results.push(r);
      best = Math.min(best, r.score);
    }
  }
  return { best, results };
}

describe('vec', () => {
  it('unit() normalises and leaves zero vectors at zero', () => {
    const u = unit(Float32Array.from([3, 4]));
    expect(u[0]).toBeCloseTo(0.6);
    expect(u[1]).toBeCloseTo(0.8);
    expect(Array.from(unit(new Float32Array(3)))).toEqual([0, 0, 0]);
  });
  it('vsub() subtracts element-wise', () => {
    expect(Array.from(vsub(Float32Array.from([3, 4]), Float32Array.from([1, 1])))).toEqual([2, 3]);
  });
});

describe('Matcher', () => {
  it('an identical sequence scores ≈ 0', () => {
    expect(run(pad(tpl)).best).toBeLessThan(1e-4);
  });

  it.each([0.6, 1.6])('the sequence at %s× speed still matches', (speed) => {
    expect(run(pad(atSpeed(speed))).best).toBeLessThan(0.05);
  });

  it('the reversed sequence does not match', () => {
    expect(run(pad([...tpl].reverse())).best).toBeGreaterThan(0.32);
  });

  it('enforces 0.5M ≤ N ≤ 2M on every reported match', () => {
    for (const speed of [0.3, 0.4, 0.6, 1, 1.6, 2.5, 3]) {
      for (const r of run(pad(atSpeed(speed))).results) {
        const N = r.te - r.ts + 1;
        expect(N).toBeGreaterThanOrEqual(0.5 * M);
        expect(N).toBeLessThanOrEqual(2 * M);
      }
    }
  });

  it('too fast (0.4×) scores far worse than 0.6×', () => {
    expect(run(pad(atSpeed(0.4))).best).toBeGreaterThan(0.1);
  });

  it('dropUpTo() kills paths that started at or before the given frame', () => {
    const m = new Matcher(tpl);
    const stream = pad(tpl);
    for (let t = 0; t < 30 + M - 1; t++) m.step(stream[t], t);
    m.dropUpTo(30 + M);
    expect(m.step(stream[30 + M - 1], 30 + M - 1)).toBeNull();
  });
});
