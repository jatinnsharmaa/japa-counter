const SR = 16000, FRAME = 512, HOP = 320, NFFT = 512, NMEL = 40, NCEP = 12;
const FPS = SR / HOP; // 50 frames per second

const DSP = (() => {
  const half = NFFT / 2;
  const cosT = new Float64Array(half), sinT = new Float64Array(half);
  for (let k = 0; k < half; k++) { cosT[k] = Math.cos(2 * Math.PI * k / NFFT); sinT[k] = Math.sin(2 * Math.PI * k / NFFT); }
  const bits = Math.log2(NFFT);
  const rev = new Uint16Array(NFFT);
  for (let i = 0; i < NFFT; i++) { let r = 0; for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b); rev[i] = r; }
  const win = new Float64Array(FRAME);
  for (let i = 0; i < FRAME; i++) win[i] = 0.54 - 0.46 * Math.cos(2 * Math.PI * i / (FRAME - 1));
  const mel = f => 2595 * Math.log10(1 + f / 700), imel = m => 700 * (Math.pow(10, m / 2595) - 1);
  const lo = mel(60), hi = mel(7600), pts = [];
  for (let i = 0; i < NMEL + 2; i++) pts.push(Math.floor((NFFT + 1) * imel(lo + (hi - lo) * i / (NMEL + 1)) / SR));
  const filters = [];
  for (let m = 1; m <= NMEL; m++) {
    const a = pts[m - 1], b = pts[m], c = pts[m + 1], w = [];
    for (let k = a; k <= c; k++) {
      const v = k < b ? (k - a) / Math.max(1, b - a) : (c - k) / Math.max(1, c - b);
      w.push(Math.max(0, v));
    }
    filters.push({ a, w });
  }
  const dct = [];
  for (let k = 1; k <= NCEP; k++) {
    const row = new Float64Array(NMEL);
    for (let n = 0; n < NMEL; n++) row[n] = Math.cos(Math.PI * k * (n + 0.5) / NMEL);
    dct.push(row);
  }
  const re = new Float64Array(NFFT), im = new Float64Array(NFFT), logm = new Float64Array(NMEL);

  function frame(x) {
    let e = 0;
    for (let i = 0; i < FRAME; i++) e += x[i] * x[i];
    const db = 10 * Math.log10(e / FRAME + 1e-12);
    im.fill(0);
    let prev = x[0];
    for (let i = 0; i < FRAME; i++) { const s = x[i] - 0.97 * prev; prev = x[i]; re[rev[i]] = s * win[i]; }
    for (let size = 2; size <= NFFT; size <<= 1) {
      const h = size >> 1, step = NFFT / size;
      for (let i = 0; i < NFFT; i += size) for (let j = 0; j < h; j++) {
        const k = j * step, a = i + j, b = a + h;
        const tr = re[b] * cosT[k] + im[b] * sinT[k], ti = -re[b] * sinT[k] + im[b] * cosT[k];
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
      }
    }
    for (let m = 0; m < NMEL; m++) {
      const f = filters[m]; let s = 0;
      for (let j = 0; j < f.w.length; j++) { const k = f.a + j; if (k > half) break; s += f.w[j] * (re[k] * re[k] + im[k] * im[k]); }
      logm[m] = Math.log(s + 1e-10);
    }
    const v = new Float32Array(NCEP);
    for (let k = 0; k < NCEP; k++) { let s = 0; const row = dct[k]; for (let n = 0; n < NMEL; n++) s += row[n] * logm[n]; v[k] = s; }
    return { v, db };
  }
  return { frame };
})();

// Downsamples any input rate to 16 kHz and emits one feature frame every 20 ms.
class FeatureStream {
  constructor(inRate, onFrame) {
    this.r = inRate / SR; this.acc = 0; this.cnt = 0; this.pos = 0;
    this.buf = new Float32Array(SR); this.n = 0; this.onFrame = onFrame;
  }
  push(input) {
    for (let i = 0; i < input.length; i++) {
      this.acc += input[i]; this.cnt++; this.pos += 1;
      if (this.pos >= this.r) {
        this.buf[this.n++] = this.acc / this.cnt; this.acc = 0; this.cnt = 0; this.pos -= this.r;
        if (this.n >= FRAME) {
          this.onFrame(DSP.frame(this.buf.subarray(0, FRAME)));
          this.buf.copyWithin(0, HOP, this.n); this.n -= HOP;
        }
      }
    }
  }
}

function vsub(v, m) { const o = new Float32Array(v.length); for (let i = 0; i < v.length; i++) o[i] = v[i] - m[i]; return o; }
function unit(v) {
  let s = 0; for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  s = Math.sqrt(s) || 1; const o = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) o[i] = v[i] / s; return o;
}

// Streaming subsequence DTW: finds the template anywhere inside a continuous stream.
class Matcher {
  constructor(tpl) {
    this.T = tpl; const M = this.M = tpl.length;
    this.D = new Float64Array(M).fill(Infinity); this.S = new Int32Array(M).fill(-1);
    this.nD = new Float64Array(M); this.nS = new Int32Array(M); this.cand = null;
  }
  reset() { this.D.fill(Infinity); this.cand = null; }
  step(x, t) {
    const T = this.T, M = this.M, D = this.D, S = this.S, nD = this.nD, nS = this.nS, PEN = 0.03;
    for (let i = 0; i < M; i++) {
      const ti = T[i]; let d = 0;
      for (let k = 0; k < x.length; k++) d += ti[k] * x[k];
      const c = d >= 1 ? 0 : 1 - d;
      let best, bs;
      if (i === 0) {
        best = 2 * c; bs = t;
        const h = D[0] + c + PEN; if (h < best) { best = h; bs = S[0]; }
      } else {
        best = D[i - 1] + 2 * c; bs = S[i - 1];
        const h = D[i] + c + PEN; if (h < best) { best = h; bs = S[i]; }
        if (i >= 2) { const s2 = D[i - 2] + 3 * c + PEN; if (s2 < best) { best = s2; bs = S[i - 2]; } }
      }
      nD[i] = best; nS[i] = bs;
    }
    this.D = nD; this.nD = D; this.S = nS; this.nS = S;
    const e = this.D[M - 1];
    if (!isFinite(e)) return null;
    const ts = this.S[M - 1], N = t - ts + 1;
    if (N < 0.5 * M || N > 2 * M) return null;
    return { score: e / (N + M), ts, te: t };
  }
  dropUpTo(f) { const D = this.D, S = this.S; for (let i = 0; i < this.M; i++) if (S[i] <= f) D[i] = Infinity; }
}

// Turns one recorded sample (frames of {v, db}) into a trimmed, mean-normalised template.
function processTake(frames, floor) {
  const thr = floor + 8; let a = -1, b = -1;
  for (let i = 0; i < frames.length; i++) if (frames[i].db > thr) { if (a < 0) a = i; b = i; }
  if (a < 0 || b - a < 40) return null;
  a = Math.max(0, a - 1); b = Math.min(frames.length - 1, b + 1);
  const seg = frames.slice(a, b + 1), mean = new Float32Array(NCEP); let n = 0;
  for (const f of seg) if (f.db > thr) { for (let k = 0; k < NCEP; k++) mean[k] += f.v[k]; n++; }
  for (let k = 0; k < NCEP; k++) mean[k] /= n;
  return { frames: seg.map(f => vsub(f.v, mean)), mean, dur: seg.length / FPS };
}

function bestScore(tpl, frames) {
  const m = new Matcher(tpl); let best = Infinity;
  for (let t = 0; t < frames.length; t++) { const r = m.step(frames[t], t); if (r && r.score < best) best = r.score; }
  return best;
}

// Compares every sample against every other to set the match limit.
function calibrate(takes) {
  const n = takes.length; if (n < 2) return null;
  const U = takes.map(tk => tk.frames.map(unit));
  const per = U.map(() => []), all = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    if (i === j) continue;
    const s = bestScore(U[i], U[j]);
    if (isFinite(s)) { all.push(s); per[i].push(s); per[j].push(s); }
  }
  if (!all.length) return null;
  const mean = all.reduce((a, b) => a + b, 0) / all.length;
  const sd = Math.sqrt(all.reduce((acc, b) => acc + (b - mean) ** 2, 0) / all.length);
  const max = Math.max(...all);
  const perAvg = per.map(p => p.length ? p.reduce((a, b) => a + b, 0) / p.length : Infinity);
  return { base: Math.min(0.32, Math.max(0.26, max * 1.3, mean * 2.2)), mean, sd, max, perAvg };
}

// Live counter: feeds frames through every template matcher and emits one count per chant.
class Counter {
  constructor(takes, opts) {
    this.matchers = takes.map(tk => new Matcher(tk.frames.map(unit)));
    this.Mavg = this.matchers.reduce((a, m) => a + m.M, 0) / this.matchers.length;
    this.mean = new Float32Array(NCEP);
    for (const tk of takes) for (let k = 0; k < NCEP; k++) this.mean[k] += tk.mean[k] / takes.length;
    this.thr = opts.thr; this.floor = opts.floor;
    this.onCount = opts.onCount; this.onScore = opts.onScore || null;
    this.t = 0; this.voiced = new Uint8Array(4096); this.last = null;
  }
  reset() { for (const m of this.matchers) m.reset(); this.last = null; }
  feed(fr) {
    if (!isFinite(fr.db)) return;
    const t = this.t++, v = fr.v, db = fr.db;
    if (db < this.floor) this.floor = 0.9 * this.floor + 0.1 * db;
    const isV = db > this.floor + 8;
    this.voiced[t & 4095] = isV ? 1 : 0;
    if (isV) for (let k = 0; k < NCEP; k++) this.mean[k] += (v[k] - this.mean[k]) / 150;
    const x = unit(vsub(v, this.mean));
    let bestNow = Infinity;
    for (const m of this.matchers) {
      const r = m.step(x, t);
      if (r) {
        if (r.score < bestNow) bestNow = r.score;
        if (isV && r.score < this.thr && (!m.cand || r.score < m.cand.score)) m.cand = r;
      }
      if (m.cand && t - m.cand.te >= Math.max(8, Math.round(0.12 * m.M))) {
        const c = m.cand; m.cand = null; this.emit(c);
      }
    }
    if (this.onScore) this.onScore(bestNow, this.thr, isV);
  }
  emit(c) {
    const n = c.te - c.ts + 1; let v = 0;
    for (let f = c.ts; f <= c.te; f++) v += this.voiced[f & 4095];
    if (v / n < 0.6) return;
    if (this.last) {
      const ov = Math.min(c.te, this.last.te) - Math.max(c.ts, this.last.ts);
      if (c.te <= this.last.te || ov > 0.4 * Math.min(n, this.last.te - this.last.ts + 1)) return;
    }
    this.last = c;
    const cut = c.te - Math.round(0.2 * this.Mavg);
    for (const m of this.matchers) { m.dropUpTo(cut); if (m.cand && m.cand.ts <= cut) m.cand = null; }
    this.onCount(c);
  }
}
