import { describe, expect, it } from 'vitest';
import { FRAME, HOP, SR } from '../../../src/engine/constants';
import { computeFrame } from '../../../src/engine/dsp';
import { extractFrames, FeatureStream, Resampler } from '../../../src/engine/features';

const tone = (hz: number, rate: number, seconds: number, amp = 0.5) =>
  Float32Array.from({ length: Math.round(rate * seconds) }, (_, i) => amp * Math.sin((2 * Math.PI * hz * i) / rate));
const rms = (a: Float32Array, from = 0, to = a.length) => {
  let s = 0;
  for (let i = from; i < to; i++) s += a[i] * a[i];
  return Math.sqrt(s / (to - from));
};
const resampleAll = (input: Float32Array, rate: number) => {
  const r = new Resampler(rate);
  const a = r.process(input);
  const b = r.flush();
  const out = new Float32Array(a.length + b.length);
  out.set(a);
  out.set(b, a.length);
  return out;
};

describe('Resampler', () => {
  it.each([48000, 44100, 22050])('output length = input × 16000 / %i', (rate) => {
    const out = resampleAll(tone(440, rate, 1), rate);
    expect(Math.abs(out.length - SR)).toBeLessThanOrEqual(1);
  });

  it('passes a 1 kHz tone at 48 kHz through with its level intact', () => {
    const out = resampleAll(tone(1000, 48000, 1), 48000);
    expect(rms(out, 1000, 15000) / (0.5 / Math.SQRT2)).toBeCloseTo(1, 1);
  });

  it('removes a 12 kHz tone (above the 8 kHz output Nyquist) instead of aliasing it', () => {
    const out = resampleAll(tone(12000, 48000, 1), 48000);
    expect(rms(out, 1000, 15000)).toBeLessThan(0.01 * (0.5 / Math.SQRT2));
  });

  it('gives the same output whatever the chunk sizes', () => {
    const input = tone(700, 44100, 0.5);
    const whole = resampleAll(input, 44100);
    const r = new Resampler(44100);
    const parts: number[] = [];
    let i = 0;
    const sizes = [128, 1000, 7, 4096, 333];
    for (let k = 0; i < input.length; k++) {
      const n = sizes[k % sizes.length];
      parts.push(...r.process(input.subarray(i, i + n)));
      i += n;
    }
    parts.push(...r.flush());
    expect(parts.length).toBe(whole.length);
    for (let j = 0; j < whole.length; j++) expect(parts[j]).toBeCloseTo(whole[j], 6);
  });

  it('is an exact pass-through at 16 kHz', () => {
    const input = tone(300, SR, 0.1);
    const r = new Resampler(SR);
    expect(r.passthrough).toBe(true);
    expect(Array.from(r.process(input))).toEqual(Array.from(input));
    expect(r.flush().length).toBe(0);
  });
});

describe('FeatureStream', () => {
  it('emits one frame per 20 ms hop once the first 512 samples have arrived', () => {
    const frames = extractFrames(tone(300, SR, 1));
    expect(frames.length).toBe(Math.floor((SR - FRAME) / HOP) + 1);
  });

  it('frames match computeFrame on the same 16 kHz window', () => {
    const pcm = tone(500, SR, 0.2);
    const frames = extractFrames(pcm);
    const third = computeFrame(pcm.subarray(2 * HOP, 2 * HOP + FRAME));
    expect(Array.from(frames[2].v)).toEqual(Array.from(third.v));
    expect(frames[2].db).toBe(third.db);
  });

  it('reports the 16 kHz PCM it analysed', () => {
    let total = 0;
    const fs = new FeatureStream(48000, () => {}, (pcm) => (total += pcm.length));
    fs.push(tone(300, 48000, 0.5));
    fs.flush();
    expect(Math.abs(total - SR / 2)).toBeLessThanOrEqual(1);
  });
});
