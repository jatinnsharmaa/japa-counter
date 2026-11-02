import { describe, expect, it } from 'vitest';
import { formatDuration, formatSummary, formatTimer, SessionState } from '../../../src/session/session-logic';

function clock() {
  let t = 0;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

describe('SessionState', () => {
  it('ignores counts before begin()', () => {
    const c = clock();
    const s = new SessionState(10, true, c.now);
    expect(s.onCount()).toBeNull();
    expect(s.count).toBe(0);
  });

  it('rings a soft bell every 108 and signals the target', () => {
    const s = new SessionState(216, true, clock().now);
    s.begin();
    const effects = Array.from({ length: 216 }, () => s.onCount());
    expect(effects[107]).toBe('bell');
    expect(effects.filter((e) => e === 'bell')).toHaveLength(1);
    expect(effects[215]).toBe('target');
  });

  it('no soft bells when the setting is off', () => {
    const s = new SessionState(1000, false, clock().now);
    s.begin();
    expect(Array.from({ length: 300 }, () => s.onCount()).every((e) => e === null)).toBe(true);
  });

  it('times from begin() on a monotonic clock and ends once', () => {
    const c = clock();
    const s = new SessionState(2, true, c.now);
    c.advance(5000);
    s.begin();
    c.advance(3000);
    s.onCount();
    c.advance(3000);
    expect(s.onCount()).toBe('target');
    const r = s.end();
    expect(r).toEqual({ count: 2, target: 2, secs: 6, avgSecsPerChant: 3, reached: true });
    c.advance(10000);
    expect(s.elapsedSec()).toBe(6);
    expect(s.onCount()).toBeNull();
    expect(s.end()).toEqual(r);
  });

  it('average is 0 with no counts', () => {
    const s = new SessionState(5, true, clock().now);
    s.begin();
    expect(s.end().avgSecsPerChant).toBe(0);
  });
});

describe('formatting', () => {
  it('formats the timer', () => {
    expect(formatTimer(0)).toBe('0:00');
    expect(formatTimer(1120)).toBe('18:40');
    expect(formatTimer(4324)).toBe('1:12:04');
  });
  it('formats durations and the summary', () => {
    expect(formatDuration(42)).toBe('42s');
    expect(formatDuration(724)).toBe('12m 04s');
    expect(formatDuration(4324)).toBe('1h 12m 04s');
    expect(formatSummary(1008, 4324)).toBe('1,008 chants  ·  1h 12m 04s');
    expect(formatSummary(1, 3)).toBe('1 chant  ·  3s');
  });
});
