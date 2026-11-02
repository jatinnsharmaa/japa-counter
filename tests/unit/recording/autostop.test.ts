import { describe, expect, it } from 'vitest';
import { AutoStop, COUNTDOWN_FRAMES, MAX_CHANT_FRAMES, type AutoStopTick } from '../../../src/recording/autostop';

function feed(a: AutoStop, db: number, n: number): AutoStopTick[] {
  return Array.from({ length: n }, () => a.feed(db));
}
function afterCountdown(floor = -60) {
  const a = new AutoStop();
  feed(a, floor, COUNTDOWN_FRAMES);
  return a;
}
const stopIndex = (ticks: AutoStopTick[]) => ticks.findIndex((t) => t.stopped !== null);

describe('AutoStop', () => {
  it('counts down 3-2-1 over 3 s and measures the floor as the median', () => {
    const a = new AutoStop();
    const ticks = [...feed(a, -62, 60), ...feed(a, -58, 90)];
    expect(ticks[0].countdown).toBe(3);
    expect(ticks[60].countdown).toBe(2);
    expect(ticks[110].countdown).toBe(1);
    expect(ticks[148].phase).toBe('countdown');
    expect(ticks[149].phase).toBe('chant');
    expect(a.floor).toBe(-58);
    expect(a.reachedChant).toBe(true);
    expect(a.chantStartSample).toBe(150 * 320);
  });

  it('exposes the countdown floor, unchanged by quieter chant-phase frames', () => {
    const a = new AutoStop();
    feed(a, -62, 60);
    expect(a.countdownFloor).toBeNull();
    feed(a, -58, 90);
    expect(a.countdownFloor).toBe(-58);
    feed(a, -80, 30);
    expect(a.floor).toBeLessThan(-58);
    expect(a.countdownFloor).toBe(-58);
  });

  it('does not stop before any speech is heard', () => {
    const a = afterCountdown();
    expect(feed(a, -60, 300).every((t) => t.stopped === null)).toBe(true);
  });

  it('stops 0.8 s after the chant ends', () => {
    const a = afterCountdown();
    feed(a, -20, 100);
    const ticks = feed(a, -60, 60);
    expect(stopIndex(ticks)).toBe(39);
    expect(ticks[39].stopped).toBe('quiet');
    expect(a.phase).toBe('done');
  });

  it('still stops when a fan or reverb keeps the level above floor + 8 dB (adaptive line)', () => {
    const a = afterCountdown();
    feed(a, -20, 100);
    expect(stopIndex(feed(a, -48, 60))).toBe(39);
  });

  it('a short breath or click does not restart the quiet wait', () => {
    const a = afterCountdown();
    feed(a, -20, 100);
    feed(a, -60, 20);
    feed(a, -20, 3);
    expect(stopIndex(feed(a, -60, 30))).toBe(19);
  });

  it('a longer sound (≥ 5 frames) restarts the quiet wait', () => {
    const a = afterCountdown();
    feed(a, -20, 100);
    feed(a, -60, 30);
    feed(a, -20, 10);
    expect(stopIndex(feed(a, -60, 60))).toBe(39);
  });

  it('needs at least 0.8 s of voice before auto-stopping', () => {
    const a = afterCountdown();
    feed(a, -20, 20);
    expect(feed(a, -60, 100).every((t) => t.stopped === null)).toBe(true);
  });

  it('stops at the 15 s hard limit', () => {
    const a = afterCountdown();
    const ticks = feed(a, -20, MAX_CHANT_FRAMES);
    expect(stopIndex(ticks)).toBe(MAX_CHANT_FRAMES - 1);
    expect(ticks[MAX_CHANT_FRAMES - 1].stopped).toBe('limit');
  });

  it('manual stop ends the take; later frames report done without a stop reason', () => {
    const a = afterCountdown();
    feed(a, -20, 10);
    a.stop();
    expect(a.feed(-60)).toMatchObject({ phase: 'done', stopped: null });
  });

  it('stopping during the countdown never reaches the chant', () => {
    const a = new AutoStop();
    feed(a, -60, 10);
    a.stop();
    expect(a.reachedChant).toBe(false);
  });

  it('the floor only moves down', () => {
    const a = afterCountdown(-60);
    a.feed(-70);
    expect(a.floor).toBeCloseTo(-61);
    a.feed(-30);
    expect(a.floor).toBeCloseTo(-61);
  });

  it('ignores non-finite levels', () => {
    const a = afterCountdown();
    expect(a.feed(NaN)).toMatchObject({ phase: 'chant', stopped: null, level: 0 });
  });

  it('reports a 0..1 level relative to the floor over 40 dB', () => {
    const a = afterCountdown(-60);
    expect(a.feed(-40).level).toBeCloseTo(0.5);
    expect(a.feed(0).level).toBe(1);
  });

  it('a loud transient mid-chant does not end the take', () => {
    const a = afterCountdown(-60);
    const ticks = [...feed(a, -30, 100), ...feed(a, 0, 15), ...feed(a, -30, 100)];
    expect(ticks.every((t) => t.stopped === null)).toBe(true);
    expect(stopIndex(feed(a, -60, 60))).toBe(39);
  });

  it('a loud opening syllable does not end the take', () => {
    const a = afterCountdown(-60);
    const ticks = [...feed(a, -5, 30), ...feed(a, -35, 150)];
    expect(ticks.every((t) => t.stopped === null)).toBe(true);
    expect(stopIndex(feed(a, -60, 60))).toBe(39);
  });

  it('floor drift is bounded', () => {
    const a = afterCountdown(-60);
    feed(a, -120, 60);
    expect(a.floor).toBeGreaterThanOrEqual(-70);
  });

  it('non-finite frames still advance the countdown', () => {
    const a = new AutoStop();
    const ticks = [...feed(a, NaN, 10), ...feed(a, -60, 140)];
    expect(ticks[149].phase).toBe('chant');
    expect(ticks[148].phase).toBe('countdown');
    expect(a.floor).toBe(-60);
  });

  it('non-finite frames in the chant keep the 15 s limit aligned', () => {
    const a = afterCountdown();
    const ticks = feed(a, NaN, MAX_CHANT_FRAMES);
    expect(stopIndex(ticks)).toBe(MAX_CHANT_FRAMES - 1);
  });

  it('a 4-frame loud blip does not reset the quiet wait, 5 frames do', () => {
    const a = afterCountdown();
    feed(a, -20, 100);
    feed(a, -60, 20);
    feed(a, -20, 4);
    expect(stopIndex(feed(a, -60, 60))).toBe(19);

    const b = afterCountdown();
    feed(b, -20, 100);
    feed(b, -60, 20);
    feed(b, -20, 5);
    expect(stopIndex(feed(b, -60, 60))).toBe(39);
  });
});
