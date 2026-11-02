import { describe, expect, it } from 'vitest';
import { FPS, NCEP } from '../../../src/engine/constants';
import { processTake } from '../../../src/engine/takes';
import type { Frame } from '../../../src/engine/types';

const frame = (db: number, fill = 1): Frame => ({ v: new Float32Array(NCEP).fill(fill), db });
const floor = -60;

describe('processTake', () => {
  it('trims to the voiced span plus one frame either side', () => {
    const frames = [...Array(10)].map(() => frame(-60)).concat([...Array(50)].map((_, i) => frame(-20, i)), [...Array(10)].map(() => frame(-60)));
    const take = processTake(frames, floor)!;
    expect(take.start).toBe(9);
    expect(take.end).toBe(60);
    expect(take.frames).toHaveLength(52);
    expect(take.dur).toBeCloseTo(52 / FPS);
  });

  it('subtracts the mean of the voiced frames only', () => {
    const frames = [frame(-60, 100), ...[...Array(45)].map(() => frame(-20, 2)), frame(-60, 100)];
    const take = processTake(frames, floor)!;
    expect(take.mean[0]).toBeCloseTo(2);
    expect(take.frames[1][0]).toBeCloseTo(0);
    expect(take.frames[0][0]).toBeCloseTo(98);
  });

  it('rejects takes with no voice or a voiced span shorter than 40 frames', () => {
    expect(processTake([...Array(100)].map(() => frame(-60)), floor)).toBeNull();
    expect(processTake([...Array(39)].map(() => frame(-20)), floor)).toBeNull();
  });

  it('treats 8 dB above the floor as the voicing line', () => {
    expect(processTake([...Array(50)].map(() => frame(-52)), floor)).toBeNull();
    expect(processTake([...Array(50)].map(() => frame(-51.9)), floor)).not.toBeNull();
  });
});
