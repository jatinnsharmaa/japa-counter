export const BELL_EVERY = 108;

export type CountEffect = 'bell' | 'target' | null;

export interface SessionResult {
  count: number;
  target: number;
  secs: number;
  avgSecsPerChant: number;
  reached: boolean;
}

/** Count, target and timing for one session. Time comes from a monotonic clock (performance.now). */
export class SessionState {
  count = 0;
  private startedAt: number | null = null;
  private endedAt: number | null = null;
  private result: SessionResult | null = null;

  constructor(
    readonly target: number,
    readonly bellEnabled: boolean,
    private readonly now: () => number,
  ) {}

  get started(): boolean {
    return this.startedAt !== null;
  }

  get ended(): boolean {
    return this.result !== null;
  }

  begin(): void {
    if (this.startedAt === null) this.startedAt = this.now();
  }

  onCount(): CountEffect {
    if (this.ended || this.startedAt === null) return null;
    this.count++;
    if (this.count >= this.target) return 'target';
    if (this.bellEnabled && this.count % BELL_EVERY === 0) return 'bell';
    return null;
  }

  elapsedSec(): number {
    if (this.startedAt === null) return 0;
    return ((this.endedAt ?? this.now()) - this.startedAt) / 1000;
  }

  end(): SessionResult {
    if (this.result) return this.result;
    this.endedAt = this.now();
    const secs = this.elapsedSec();
    this.result = {
      count: this.count,
      target: this.target,
      secs,
      avgSecsPerChant: this.count ? secs / this.count : 0,
      reached: this.count >= this.target,
    };
    return this.result;
  }
}

const pad = (n: number) => String(n).padStart(2, '0');

export function formatTimer(secs: number): string {
  const s = Math.floor(secs);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

export function formatDuration(secs: number): string {
  const s = Math.floor(secs);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${pad(m)}m ${pad(s % 60)}s`;
  if (m > 0) return `${m}m ${pad(s % 60)}s`;
  return `${s}s`;
}

export function formatSummary(count: number, secs: number): string {
  return `${count.toLocaleString('en-US')} ${count === 1 ? 'chant' : 'chants'}  ·  ${formatDuration(secs)}`;
}
