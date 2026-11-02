import { FRAME, MEL_HI_HZ, MEL_LO_HZ, NCEP, NFFT, NMEL, PRE_EMPHASIS, SR } from './constants';
import type { Frame } from './types';

const HALF = NFFT / 2;

const cosT = new Float64Array(HALF);
const sinT = new Float64Array(HALF);
for (let k = 0; k < HALF; k++) {
  cosT[k] = Math.cos((2 * Math.PI * k) / NFFT);
  sinT[k] = Math.sin((2 * Math.PI * k) / NFFT);
}

const BITS = Math.log2(NFFT);
const rev = new Uint16Array(NFFT);
for (let i = 0; i < NFFT; i++) {
  let r = 0;
  for (let b = 0; b < BITS; b++) r |= ((i >> b) & 1) << (BITS - 1 - b);
  rev[i] = r;
}

const hamming = new Float64Array(FRAME);
for (let i = 0; i < FRAME; i++) hamming[i] = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (FRAME - 1));

const hzToMel = (f: number) => 2595 * Math.log10(1 + f / 700);
const melToHz = (m: number) => 700 * (Math.pow(10, m / 2595) - 1);

export interface MelFilter {
  start: number; // first FFT bin
  weights: number[]; // triangular weights for bins start, start + 1, …
}

/** FFT bin of each of the NMEL + 2 mel edge points. */
export const melEdgeBins: number[] = (() => {
  const lo = hzToMel(MEL_LO_HZ);
  const hi = hzToMel(MEL_HI_HZ);
  const pts: number[] = [];
  for (let i = 0; i < NMEL + 2; i++) pts.push(Math.floor(((NFFT + 1) * melToHz(lo + ((hi - lo) * i) / (NMEL + 1))) / SR));
  return pts;
})();

export const melFilters: MelFilter[] = (() => {
  const filters: MelFilter[] = [];
  for (let m = 1; m <= NMEL; m++) {
    const a = melEdgeBins[m - 1];
    const b = melEdgeBins[m];
    const c = melEdgeBins[m + 1];
    const weights: number[] = [];
    for (let k = a; k <= c; k++) {
      const v = k < b ? (k - a) / Math.max(1, b - a) : (c - k) / Math.max(1, c - b);
      weights.push(Math.max(0, v));
    }
    filters.push({ start: a, weights });
  }
  return filters;
})();

const dct: Float64Array[] = [];
for (let k = 1; k <= NCEP; k++) {
  const row = new Float64Array(NMEL);
  for (let n = 0; n < NMEL; n++) row[n] = Math.cos((Math.PI * k * (n + 0.5)) / NMEL);
  dct.push(row);
}

const re = new Float64Array(NFFT);
const im = new Float64Array(NFFT);
const logm = new Float64Array(NMEL);

/** In-place radix-2 FFT of re/im; the caller has already written the input in bit-reversed order. */
function fftInPlace(): void {
  for (let size = 2; size <= NFFT; size <<= 1) {
    const h = size >> 1;
    const step = NFFT / size;
    for (let i = 0; i < NFFT; i += size) {
      for (let j = 0; j < h; j++) {
        const k = j * step;
        const a = i + j;
        const b = a + h;
        const tr = re[b] * cosT[k] + im[b] * sinT[k];
        const ti = -re[b] * sinT[k] + im[b] * cosT[k];
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
      }
    }
  }
}

/** |X(k)|² for k = 0..NFFT/2 of a raw NFFT-sample block (no window, no pre-emphasis). */
export function powerSpectrum(x: ArrayLike<number>): Float64Array {
  im.fill(0);
  for (let i = 0; i < NFFT; i++) re[rev[i]] = x[i];
  fftInPlace();
  const out = new Float64Array(HALF + 1);
  for (let k = 0; k <= HALF; k++) out[k] = re[k] * re[k] + im[k] * im[k];
  return out;
}

/** MFCC (c1..c12) and energy in dB of one FRAME-sample block at 16 kHz. */
export function computeFrame(x: ArrayLike<number>): Frame {
  let e = 0;
  for (let i = 0; i < FRAME; i++) e += x[i] * x[i];
  const db = 10 * Math.log10(e / FRAME + 1e-12);
  im.fill(0);
  let prev = x[0];
  for (let i = 0; i < FRAME; i++) {
    const s = x[i] - PRE_EMPHASIS * prev;
    prev = x[i];
    re[rev[i]] = s * hamming[i];
  }
  fftInPlace();
  for (let m = 0; m < NMEL; m++) {
    const f = melFilters[m];
    let s = 0;
    for (let j = 0; j < f.weights.length; j++) {
      const k = f.start + j;
      if (k > HALF) break;
      s += f.weights[j] * (re[k] * re[k] + im[k] * im[k]);
    }
    logm[m] = Math.log(s + 1e-10);
  }
  const v = new Float32Array(NCEP);
  for (let k = 0; k < NCEP; k++) {
    let s = 0;
    const row = dct[k];
    for (let n = 0; n < NMEL; n++) s += row[n] * logm[n];
    v[k] = s;
  }
  return { v, db };
}
