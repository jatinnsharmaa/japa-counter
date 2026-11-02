import { describe, expect, it } from 'vitest';
import { bell, chime, type BellContext } from '../../../src/audio/bell';

function fakeCtx() {
  const started: { freq: number; at: number }[] = [];
  const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} });
  const ctx = {
    currentTime: 10,
    destination: {},
    createGain: () => ({ gain: param(), connect() {} }),
    createOscillator: () => {
      const o = { type: 'sine', frequency: param(), connect() {}, start(at: number) { started.push({ freq: o.frequency.value, at }); }, stop() {} };
      return o;
    },
  } as unknown as BellContext;
  return { ctx, started };
}

describe('bell', () => {
  it('plays three sine partials at 1×, 2.76× and 5.4× the base frequency', () => {
    const { ctx, started } = fakeCtx();
    bell(ctx);
    expect(started.map((s) => Math.round(s.freq))).toEqual([528, Math.round(528 * 2.76), Math.round(528 * 5.4)]);
    expect(started.every((s) => s.at === 10)).toBe(true);
  });

  it('chime rings three bells 0.9 s apart at 528, 660 and 792 Hz', () => {
    const { ctx, started } = fakeCtx();
    chime(ctx);
    const fundamentals = started.filter((_, i) => i % 3 === 0);
    expect(fundamentals.map((s) => [s.freq, s.at])).toEqual([[528, 10], [660, 10.9], [792, 11.8]]);
  });
});
