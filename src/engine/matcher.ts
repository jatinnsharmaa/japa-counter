import type { MatchResult } from './types';

export const HOLD_PENALTY = 0.03;

/**
 * Streaming subsequence DTW: finds the template anywhere inside a continuous stream (open start, open end).
 * Steps: advance (2c), hold (c + p), skip one template frame (3c + p). Score = D / (N + M), 0.5M ≤ N ≤ 2M.
 */
export class Matcher {
  readonly M: number;
  cand: MatchResult | null = null;
  private readonly T: Float32Array[];
  private D: Float64Array;
  private S: Int32Array;
  private nD: Float64Array;
  private nS: Int32Array;

  constructor(template: Float32Array[]) {
    this.T = template;
    const M = (this.M = template.length);
    this.D = new Float64Array(M).fill(Infinity);
    this.S = new Int32Array(M).fill(-1);
    this.nD = new Float64Array(M);
    this.nS = new Int32Array(M);
  }

  reset(): void {
    this.D.fill(Infinity);
    this.cand = null;
  }

  step(x: Float32Array, t: number): MatchResult | null {
    const T = this.T;
    const M = this.M;
    const D = this.D;
    const S = this.S;
    const nD = this.nD;
    const nS = this.nS;
    for (let i = 0; i < M; i++) {
      const ti = T[i];
      let d = 0;
      for (let k = 0; k < x.length; k++) d += ti[k] * x[k];
      const c = d >= 1 ? 0 : 1 - d;
      let best: number;
      let bs: number;
      if (i === 0) {
        best = 2 * c;
        bs = t;
        const h = D[0] + c + HOLD_PENALTY;
        if (h < best) {
          best = h;
          bs = S[0];
        }
      } else {
        best = D[i - 1] + 2 * c;
        bs = S[i - 1];
        const h = D[i] + c + HOLD_PENALTY;
        if (h < best) {
          best = h;
          bs = S[i];
        }
        if (i >= 2) {
          const s2 = D[i - 2] + 3 * c + HOLD_PENALTY;
          if (s2 < best) {
            best = s2;
            bs = S[i - 2];
          }
        }
      }
      nD[i] = best;
      nS[i] = bs;
    }
    this.D = nD;
    this.nD = D;
    this.S = nS;
    this.nS = S;
    const e = this.D[M - 1];
    if (!Number.isFinite(e)) return null;
    const ts = this.S[M - 1];
    const N = t - ts + 1;
    if (N < 0.5 * M || N > 2 * M) return null;
    return { score: e / (N + M), ts, te: t };
  }

  dropUpTo(f: number): void {
    for (let i = 0; i < this.M; i++) if (this.S[i] <= f) this.D[i] = Infinity;
  }
}
