import { describe, expect, it } from 'vitest';
import { FRAME, MEL_HI_HZ, MEL_LO_HZ, NCEP, NFFT, NMEL, SR } from '../../../src/engine/constants';
import { computeFrame, melEdgeBins, melFilters, powerSpectrum } from '../../../src/engine/dsp';

const sine = (hz: number, amp = 0.5, n = FRAME) =>
  Float32Array.from({ length: n }, (_, i) => amp * Math.sin((2 * Math.PI * hz * i) / SR));

describe('powerSpectrum', () => {
  it('a 1 kHz sine peaks at bin 32', () => {
    const p = powerSpectrum(sine(1000));
    let best = 0;
    for (let k = 1; k < p.length; k++) if (p[k] > p[best]) best = k;
    expect(best).toBe(32);
    expect(p.length).toBe(NFFT / 2 + 1);
  });
});

describe('mel filterbank', () => {
  it('has 40 filters whose edges span 60 to 7,600 Hz', () => {
    expect(melFilters).toHaveLength(NMEL);
    expect(melEdgeBins).toHaveLength(NMEL + 2);
    expect(melEdgeBins[0]).toBe(Math.floor(((NFFT + 1) * MEL_LO_HZ) / SR));
    expect(melEdgeBins[NMEL + 1]).toBe(Math.floor(((NFFT + 1) * MEL_HI_HZ) / SR));
  });

  it('weights are in [0, 1] and overlapping filters sum to 1 between the first and last centre', () => {
    const sum = new Float64Array(NFFT / 2 + 1);
    for (const f of melFilters) {
      f.weights.forEach((w, j) => {
        expect(w).toBeGreaterThanOrEqual(0);
        expect(w).toBeLessThanOrEqual(1);
        sum[f.start + j] += w;
      });
    }
    for (let k = melEdgeBins[1]; k <= melEdgeBins[NMEL]; k++) expect(sum[k]).toBeCloseTo(1, 9);
  });
});

describe('computeFrame', () => {
  it('MFCC of silence is finite', () => {
    const f = computeFrame(new Float32Array(FRAME));
    expect(f.v).toHaveLength(NCEP);
    expect(Array.from(f.v).every(Number.isFinite)).toBe(true);
    expect(Number.isFinite(f.db)).toBe(true);
  });

  it('reports frame energy in dB', () => {
    // mean square of a sine with amplitude 0.5 is 0.125 → −9.03 dB
    expect(computeFrame(sine(1000, 0.5)).db).toBeCloseTo(-9.03, 1);
  });

  it('cepstral coefficients ignore loudness because c0 is dropped', () => {
    const loud = computeFrame(sine(440, 0.5));
    const soft = computeFrame(sine(440, 0.05));
    for (let k = 0; k < NCEP; k++) expect(soft.v[k]).toBeCloseTo(loud.v[k], 3);
  });
});
