export const SESSION_QUIET_FRAMES = 75; // 1.5 s of quiet measured at session start
export const FLOOR_CAP_DB = 10; // session floor never sits more than 10 dB above the samples' floor

export function median(a: number[]): number {
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
}

export function sessionFloor(quietDbs: number[], sampleFloor: number): number {
  return Math.min(median(quietDbs), sampleFloor + FLOOR_CAP_DB);
}
