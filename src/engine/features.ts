import { FRAME, HOP, SR } from './constants';
import { computeFrame } from './dsp';
import type { Frame } from './types';

const KERNEL_RES = 256; // kernel table samples per input sample

/**
 * Streaming windowed-sinc (Blackman) resampler. Zero-phase: output n sits at input position n × ratio.
 * Cutoff is 92% of the lower Nyquist, so content above 8 kHz is removed before decimating to 16 kHz.
 */
export class Resampler {
  readonly passthrough: boolean;
  private readonly ratio: number;
  private readonly half: number;
  private readonly table: Float64Array;
  private buf = new Float32Array(0);
  private bufStart = 0; // absolute input index of buf[0]
  private totalIn = 0;
  private n = 0; // next output index

  constructor(inRate: number, outRate: number = SR) {
    this.ratio = inRate / outRate;
    this.passthrough = this.ratio === 1;
    const cutoff = 0.5 * Math.min(1, 1 / this.ratio) * 0.92; // cycles per input sample
    this.half = Math.ceil(12 / (2 * cutoff));
    this.table = new Float64Array(this.half * KERNEL_RES + 2);
    for (let i = 0; i < this.table.length; i++) {
      const t = i / KERNEL_RES;
      if (t >= this.half) continue;
      const x = 2 * cutoff * t;
      const sinc = x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x);
      const w = 0.42 + 0.5 * Math.cos((Math.PI * t) / this.half) + 0.08 * Math.cos((2 * Math.PI * t) / this.half);
      this.table[i] = 2 * cutoff * sinc * w;
    }
  }

  process(input: Float32Array): Float32Array {
    if (this.passthrough) return input.slice();
    const merged = new Float32Array(this.buf.length + input.length);
    merged.set(this.buf);
    merged.set(input, this.buf.length);
    this.buf = merged;
    this.totalIn += input.length;
    return this.drain(false);
  }

  /** Emits the remaining outputs, treating input after the end as silence. */
  flush(): Float32Array {
    return this.passthrough ? new Float32Array(0) : this.drain(true);
  }

  private kernel(t: number): number {
    const a = Math.abs(t) * KERNEL_RES;
    const i = Math.floor(a);
    if (i + 1 >= this.table.length) return 0;
    const f = a - i;
    return this.table[i] * (1 - f) + this.table[i + 1] * f;
  }

  private drain(final: boolean): Float32Array {
    const out: number[] = [];
    const end = this.bufStart + this.buf.length;
    for (;;) {
      const p = this.n * this.ratio;
      const c = Math.floor(p);
      if (final ? p >= this.totalIn : c + this.half >= end) break;
      let s = 0;
      for (let k = c - this.half + 1; k <= c + this.half; k++) {
        const idx = k - this.bufStart;
        if (idx >= 0 && idx < this.buf.length) s += this.buf[idx] * this.kernel(p - k);
      }
      out.push(s);
      this.n++;
    }
    const drop = Math.floor(this.n * this.ratio) - this.half - this.bufStart;
    if (drop > 0) {
      this.buf = this.buf.slice(drop);
      this.bufStart += drop;
    }
    return Float32Array.from(out);
  }
}

/** Resamples any input rate to 16 kHz and emits one feature frame every 20 ms. */
export class FeatureStream {
  private readonly resampler: Resampler;
  private readonly buf = new Float32Array(FRAME);
  private n = 0;

  constructor(
    inRate: number,
    private readonly onFrame: (f: Frame) => void,
    private readonly onPcm?: (pcm16k: Float32Array) => void,
  ) {
    this.resampler = new Resampler(inRate);
  }

  push(input: Float32Array): void {
    this.consume(this.resampler.process(input));
  }

  flush(): void {
    this.consume(this.resampler.flush());
  }

  private consume(pcm: Float32Array): void {
    if (pcm.length === 0) return;
    this.onPcm?.(pcm);
    for (let i = 0; i < pcm.length; i++) {
      this.buf[this.n++] = pcm[i];
      if (this.n === FRAME) {
        this.onFrame(computeFrame(this.buf));
        this.buf.copyWithin(0, HOP, FRAME);
        this.n = FRAME - HOP;
      }
    }
  }
}

export function extractFrames(pcm16k: Float32Array): Frame[] {
  const out: Frame[] = [];
  new FeatureStream(SR, (f) => out.push(f)).push(pcm16k);
  return out;
}
