import { describe, expect, it } from 'vitest';
import { median, sessionFloor } from '../../../src/engine/floor';

describe('median', () => {
  it('takes the upper middle element like v1', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(3);
  });
});

describe('sessionFloor', () => {
  it('is the median of the quiet frames', () => {
    expect(sessionFloor([-62, -60, -61], -60)).toBe(-61);
  });
  it('is capped at the sample floor + 10 dB', () => {
    expect(sessionFloor([-30, -30, -30], -60)).toBe(-50);
  });
});
