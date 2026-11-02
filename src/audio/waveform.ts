/** Max |sample| per bucket, for drawing the review waveform. */
export function waveformPeaks(pcm: Float32Array, buckets: number): number[] {
  const out = new Array<number>(buckets).fill(0);
  if (pcm.length === 0) return out;
  for (let b = 0; b < buckets; b++) {
    const from = Math.floor((b * pcm.length) / buckets);
    const to = Math.max(from + 1, Math.floor(((b + 1) * pcm.length) / buckets));
    let m = 0;
    for (let i = from; i < to && i < pcm.length; i++) m = Math.max(m, Math.abs(pcm[i]));
    out[b] = m;
  }
  return out;
}
