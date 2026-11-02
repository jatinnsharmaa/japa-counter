import { NCEP, VOICED_DB } from './constants';
import { Matcher } from './matcher';
import type { Frame, MatchResult, Take } from './types';
import { unit, vsub } from './vec';

export interface CounterOptions {
  thr: number;
  floor: number;
  onCount: (m: MatchResult) => void;
  onScore?: (best: number, thr: number, voiced: boolean) => void;
}

const RING = 4096; // voiced flags for the last ~82 s of frames
const LIVE_MEAN_FRAMES = 150; // running cepstral mean time constant (≈ 3 s)
const VOICED_RATIO_MIN = 0.6;
const OVERLAP_MAX = 0.4;
const DROP_BACK = 0.2;
const CONFIRM_MIN_FRAMES = 8;
const CONFIRM_FRAC = 0.12;

/** Live counter: feeds frames through every template matcher and emits one count per chant. */
export class Counter {
  private readonly matchers: Matcher[];
  private readonly Mavg: number;
  private readonly mean: Float32Array;
  private readonly thr: number;
  private readonly onCount: (m: MatchResult) => void;
  private readonly onScore: ((best: number, thr: number, voiced: boolean) => void) | null;
  private readonly voiced = new Uint8Array(RING);
  private _floor: number;
  private t = 0;
  private last: MatchResult | null = null;

  constructor(takes: Take[], opts: CounterOptions) {
    this.matchers = takes.map((tk) => new Matcher(tk.frames.map(unit)));
    this.Mavg = this.matchers.reduce((a, m) => a + m.M, 0) / this.matchers.length;
    this.mean = new Float32Array(NCEP);
    for (const tk of takes) for (let k = 0; k < NCEP; k++) this.mean[k] += tk.mean[k] / takes.length;
    this.thr = opts.thr;
    this._floor = opts.floor;
    this.onCount = opts.onCount;
    this.onScore = opts.onScore ?? null;
  }

  get floor(): number {
    return this._floor;
  }

  get frameIndex(): number {
    return this.t - 1;
  }

  reset(): void {
    for (const m of this.matchers) m.reset();
    this.last = null;
  }

  feed(fr: Frame): void {
    if (!Number.isFinite(fr.db)) return;
    const t = this.t++;
    const v = fr.v;
    const db = fr.db;
    if (db < this._floor) this._floor = 0.9 * this._floor + 0.1 * db;
    const isV = db > this._floor + VOICED_DB;
    this.voiced[t & (RING - 1)] = isV ? 1 : 0;
    if (isV) for (let k = 0; k < NCEP; k++) this.mean[k] += (v[k] - this.mean[k]) / LIVE_MEAN_FRAMES;
    const x = unit(vsub(v, this.mean));
    let bestNow = Infinity;
    for (const m of this.matchers) {
      const r = m.step(x, t);
      if (r) {
        if (r.score < bestNow) bestNow = r.score;
        if (isV && r.score < this.thr && (!m.cand || r.score < m.cand.score)) m.cand = r;
      }
      if (m.cand && t - m.cand.te >= Math.max(CONFIRM_MIN_FRAMES, Math.round(CONFIRM_FRAC * m.M))) {
        const c = m.cand;
        m.cand = null;
        this.emit(c);
      }
    }
    this.onScore?.(bestNow, this.thr, isV);
  }

  private emit(c: MatchResult): void {
    const n = c.te - c.ts + 1;
    let v = 0;
    for (let f = c.ts; f <= c.te; f++) v += this.voiced[f & (RING - 1)];
    if (v / n < VOICED_RATIO_MIN) return;
    if (this.last) {
      const ov = Math.min(c.te, this.last.te) - Math.max(c.ts, this.last.ts);
      if (c.te <= this.last.te || ov > OVERLAP_MAX * Math.min(n, this.last.te - this.last.ts + 1)) return;
    }
    this.last = c;
    const cut = c.te - Math.round(DROP_BACK * this.Mavg);
    for (const m of this.matchers) {
      m.dropUpTo(cut);
      if (m.cand && m.cand.ts <= cut) m.cand = null;
    }
    this.onCount(c);
  }
}
