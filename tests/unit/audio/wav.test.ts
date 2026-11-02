import { describe, expect, it } from 'vitest';
import { decodeWav, encodeWav } from '../../../src/audio/wav';

describe('WAV codec', () => {
  it('writes a 44-byte header for 16 kHz, 16-bit, mono', () => {
    const buf = encodeWav(new Float32Array(100));
    const v = new DataView(buf);
    const str = (o: number) => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
    expect(buf.byteLength).toBe(44 + 200);
    expect(str(0)).toBe('RIFF');
    expect(str(8)).toBe('WAVE');
    expect(v.getUint16(20, true)).toBe(1); // PCM
    expect(v.getUint16(22, true)).toBe(1); // mono
    expect(v.getUint32(24, true)).toBe(16000);
    expect(v.getUint16(34, true)).toBe(16);
    expect(v.getUint32(40, true)).toBe(200);
  });

  it('round-trips samples within one 16-bit step and clamps out-of-range values', () => {
    const pcm = Float32Array.from([0, 0.5, -0.5, 0.123, 1.5, -2]);
    const { pcm: back, sampleRate } = decodeWav(encodeWav(pcm));
    expect(sampleRate).toBe(16000);
    expect(back[1]).toBeCloseTo(0.5, 4);
    expect(back[3]).toBeCloseTo(0.123, 4);
    expect(back[4]).toBeCloseTo(1, 4);
    expect(back[5]).toBeCloseTo(-1, 4);
  });

  it('averages channels of a stereo file', () => {
    const buf = new ArrayBuffer(44 + 8);
    const v = new DataView(buf);
    const w = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
    w(0, 'RIFF'); v.setUint32(4, 36 + 8, true); w(8, 'WAVE'); w(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true); v.setUint32(24, 8000, true);
    v.setUint32(28, 32000, true); v.setUint16(32, 4, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, 8, true);
    v.setInt16(44, 16384, true); v.setInt16(46, 0, true); v.setInt16(48, -16384, true); v.setInt16(50, -16384, true);
    const { pcm, sampleRate } = decodeWav(buf);
    expect(sampleRate).toBe(8000);
    expect(pcm[0]).toBeCloseTo(0.25, 3);
    expect(pcm[1]).toBeCloseTo(-0.5, 3);
  });

  it('rejects files that are not 16-bit PCM WAV', () => {
    expect(() => decodeWav(new ArrayBuffer(10))).toThrow('Not a 16-bit PCM WAV file');
  });
});
