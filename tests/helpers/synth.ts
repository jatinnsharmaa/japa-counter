import { SR } from '../../src/engine/constants';
import { FeatureStream } from '../../src/engine/features';
import type { Frame } from '../../src/engine/types';

/** [duration s, formant 1 Hz, formant 2 Hz, voiced 1 / 0] */
export type Seg = readonly [number, number, number, 0 | 1];

export const MANTRA: readonly Seg[] = [
  [0.55, 600, 1000, 1], [0.22, 300, 900, 1], [0.35, 700, 1800, 1], [0.07, 0, 0, 0], [0.4, 300, 2300, 1],
  [0.06, 0, 0, 0], [0.3, 280, 2400, 1], [0.4, 700, 1200, 1], [0.3, 400, 800, 1], [0.35, 650, 1700, 1],
  [0.07, 0, 0, 0], [0.35, 320, 2200, 1], [0.3, 500, 1000, 1],
];

export const OTHER: readonly Seg[] = [
  [0.4, 350, 2100, 1], [0.3, 650, 1100, 1], [0.07, 0, 0, 0], [0.5, 450, 900, 1], [0.35, 300, 2400, 1],
  [0.4, 700, 1300, 1], [0.3, 380, 1900, 1], [0.45, 560, 850, 1], [0.3, 300, 2300, 1],
];

export interface Voice {
  tempo?: number;
  f0?: number;
  shift?: number;
  amp?: number;
}

/** Formant-synthesised chanting with a seeded Park–Miller RNG (identical sequence to v1 test.js). */
export class Synth {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed;
  }

  rnd(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }

  chant(spec: readonly Seg[], { tempo = 1, f0 = 140, shift = 1, amp = 0.3 }: Voice = {}): number[] {
    const out: number[] = [];
    const ph: number[] = [];
    for (let h = 0; h < 90; h++) ph.push(this.rnd() * 6.28);
    for (const [d, f1, f2, v] of spec) {
      const n = Math.round(d * tempo * (0.9 + 0.2 * this.rnd()) * SR);
      const F1 = f1 * shift;
      const F2 = f2 * shift;
      for (let i = 0; i < n; i++) {
        let s = 0;
        const t = out.length / SR;
        if (v) {
          const f = f0 * (1 + 0.02 * Math.sin(2 * Math.PI * 5 * t));
          for (let h = 1; h * f < 7500; h++) {
            const fh = h * f;
            const g = 1 / (1 + ((fh - F1) / 90) ** 2) + 0.7 / (1 + ((fh - F2) / 130) ** 2) + 0.02;
            s += g * Math.sin(2 * Math.PI * fh * t + ph[h]);
          }
          s *= 0.25;
        } else {
          s = (this.rnd() * 2 - 1) * 0.4;
        }
        const env = Math.min(1, i / 160, (n - i) / 160);
        out.push(s * amp * (0.6 + 0.4 * env));
      }
    }
    return out;
  }

  silence(sec: number): number[] {
    return new Array<number>(Math.round(sec * SR)).fill(0);
  }

  addNoise(a: number[], amp = 0.002): number[] {
    return a.map((x) => x + (this.rnd() * 2 - 1) * amp);
  }

  vary(): Required<Voice> {
    return { tempo: 0.85 + 0.3 * this.rnd(), f0: 125 + 30 * this.rnd(), shift: 0.96 + 0.08 * this.rnd(), amp: 0.15 + 0.3 * this.rnd() };
  }
}

/** Appends src to dst in place (avoids spread-argument limits on long arrays). */
export function append(dst: number[], src: number[]): number[] {
  for (let i = 0; i < src.length; i++) dst.push(src[i]);
  return dst;
}

export function framesOf(pcm: ArrayLike<number>): Frame[] {
  const out: Frame[] = [];
  new FeatureStream(SR, (f) => out.push(f)).push(Float32Array.from(pcm));
  return out;
}

/** Median frame energy, as v1 measured the noise floor. */
export function floorOf(frames: Frame[]): number {
  const s = frames.map((f) => f.db).sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}
