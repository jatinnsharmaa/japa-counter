import { FPS, NCEP, VOICED_DB } from './constants';
import type { Frame, Take } from './types';
import { vsub } from './vec';

export const MIN_TAKE_SPAN = 40; // frames between first and last voiced frame (0.8 s)

/** Turns one recorded sample into a trimmed, mean-normalised template. */
export function processTake(frames: Frame[], floor: number): Take | null {
  const thr = floor + VOICED_DB;
  let a = -1;
  let b = -1;
  for (let i = 0; i < frames.length; i++) {
    if (frames[i].db > thr) {
      if (a < 0) a = i;
      b = i;
    }
  }
  if (a < 0 || b - a < MIN_TAKE_SPAN) return null;
  a = Math.max(0, a - 1);
  b = Math.min(frames.length - 1, b + 1);
  const seg = frames.slice(a, b + 1);
  const mean = new Float32Array(NCEP);
  let n = 0;
  for (const f of seg) {
    if (f.db > thr) {
      for (let k = 0; k < NCEP; k++) mean[k] += f.v[k];
      n++;
    }
  }
  for (let k = 0; k < NCEP; k++) mean[k] /= n;
  return { frames: seg.map((f) => vsub(f.v, mean)), mean, dur: seg.length / FPS, start: a, end: b };
}
