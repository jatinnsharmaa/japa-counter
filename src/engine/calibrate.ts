import { Matcher } from './matcher';
import type { Calibration, Take } from './types';
import { unit } from './vec';

export const THRESHOLD_MIN = 0.26;
export const THRESHOLD_MAX = 0.32;
export const STRICTNESS_STEPS = [0.85, 0.9, 0.95, 1.0, 1.05, 1.1] as const;
export const DEFAULT_STRICTNESS = 1.0;
export const OUTLIER_RATIO = 1.5;

export function bestScore(tpl: Float32Array[], frames: Float32Array[]): number {
  const m = new Matcher(tpl);
  let best = Infinity;
  for (let t = 0; t < frames.length; t++) {
    const r = m.step(frames[t], t);
    if (r && r.score < best) best = r.score;
  }
  return best;
}

/** Scores every sample against every other to set the match limit. */
export function calibrate(takes: Take[]): Calibration | null {
  const n = takes.length;
  if (n < 2) return null;
  const U = takes.map((tk) => tk.frames.map(unit));
  const per: number[][] = U.map(() => []);
  const all: number[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const s = bestScore(U[i], U[j]);
      if (Number.isFinite(s)) {
        all.push(s);
        per[i].push(s);
        per[j].push(s);
      }
    }
  }
  if (!all.length) return null;
  const mean = all.reduce((a, b) => a + b, 0) / all.length;
  const sd = Math.sqrt(all.reduce((acc, b) => acc + (b - mean) ** 2, 0) / all.length);
  const max = Math.max(...all);
  const perAvg = per.map((p) => (p.length ? p.reduce((a, b) => a + b, 0) / p.length : Infinity));
  return { base: Math.min(THRESHOLD_MAX, Math.max(THRESHOLD_MIN, max * 1.3, mean * 2.2)), mean, sd, max, perAvg };
}

/** F6: a sample "sounds different" when its average pairwise score is over 1.5× the median. */
export function flagOutliers(perAvg: number[]): boolean[] {
  if (perAvg.length < 3) return perAvg.map(() => false);
  const sorted = [...perAvg].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  return perAvg.map((x) => x > OUTLIER_RATIO * median);
}

export function liveThreshold(cal: Calibration, strictness: number): number {
  return cal.base * strictness;
}
