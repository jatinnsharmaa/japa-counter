import { describe, expect, it } from 'vitest';
import { waveformPeaks } from '../../../src/audio/waveform';

describe('waveformPeaks', () => {
  it('returns the max absolute value per bucket', () => {
    expect(waveformPeaks(Float32Array.from([0.1, -0.5, 0.2, 0.3]), 2)).toEqual([0.5, 0.3].map((x) => Math.fround(x)));
  });
  it('returns zeros for empty input', () => {
    expect(waveformPeaks(new Float32Array(0), 3)).toEqual([0, 0, 0]);
  });
});
