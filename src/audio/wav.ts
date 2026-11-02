import { SR } from '../engine/constants';

const ERR = 'Not a 16-bit PCM WAV file';

export function encodeWav(pcm: Float32Array, sampleRate: number = SR): ArrayBuffer {
  const buf = new ArrayBuffer(44 + pcm.length * 2);
  const v = new DataView(buf);
  const w = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  w(0, 'RIFF');
  v.setUint32(4, 36 + pcm.length * 2, true);
  w(8, 'WAVE');
  w(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  w(36, 'data');
  v.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i++) {
    const s = Math.max(-1, Math.min(1, pcm[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buf;
}

export function decodeWav(buf: ArrayBuffer): { pcm: Float32Array; sampleRate: number } {
  if (buf.byteLength < 12) throw new Error(ERR);
  const v = new DataView(buf);
  const str = (o: number) => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
  if (str(0) !== 'RIFF' || str(8) !== 'WAVE') throw new Error(ERR);
  let off = 12;
  let channels = 0;
  let sampleRate = 0;
  let bits = 0;
  let format = 0;
  while (off + 8 <= buf.byteLength) {
    const id = str(off);
    const size = v.getUint32(off + 4, true);
    const body = off + 8;
    if (id === 'fmt ') {
      format = v.getUint16(body, true);
      channels = v.getUint16(body + 2, true);
      sampleRate = v.getUint32(body + 4, true);
      bits = v.getUint16(body + 14, true);
    } else if (id === 'data') {
      if (format !== 1 || bits !== 16 || channels < 1) throw new Error(ERR);
      const frames = Math.floor(Math.min(size, buf.byteLength - body) / (2 * channels));
      const pcm = new Float32Array(frames);
      for (let i = 0; i < frames; i++) {
        let s = 0;
        for (let c = 0; c < channels; c++) s += v.getInt16(body + (i * channels + c) * 2, true) / 0x8000;
        pcm[i] = s / channels;
      }
      return { pcm, sampleRate };
    }
    off = body + size + (size & 1);
  }
  throw new Error(ERR);
}
