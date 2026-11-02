import { HOP, VOICED_DB } from '../engine/constants';
import { median } from '../engine/floor';

export const COUNTDOWN_FRAMES = 150; // 3 s at 50 frames/s; the noise floor is measured here
export const FRAMES_PER_COUNT = 50; // one countdown digit per second
export const END_QUIET_FRAMES = 40; // 0.8 s near the floor ends the take
export const MIN_SPEECH_FRAMES = 40; // 0.8 s of voiced frames before auto-stop may fire
export const MAX_CHANT_FRAMES = 750; // 15 s hard limit
export const BLIP_FRAMES = 5; // louder runs shorter than 0.1 s don't reset the quiet run
export const SPEECH_DROP_DB = 25; // quiet line = max(floor + 8 dB, speech peak − 25 dB)
export const LEVEL_RANGE_DB = 40; // level meter spans floor .. floor + 40 dB

export type RecPhase = 'countdown' | 'chant' | 'done';
export type StopReason = 'quiet' | 'limit';

export interface AutoStopTick {
  phase: RecPhase;
  countdown: number; // 3, 2, 1 during the countdown; 0 afterwards
  level: number; // 0..1
  stopped: StopReason | null; // set only on the frame that ended the take
}

/** Drives one take: countdown → chant → done, from per-frame energy (dB). */
export class AutoStop {
  readonly chantStartSample = COUNTDOWN_FRAMES * HOP;
  private readonly countdownDbs: number[] = [];
  private _floor: number | null = null;
  private _phase: RecPhase = 'countdown';
  private _reachedChant = false;
  private chantFrames = 0;
  private voiced = 0;
  private quietRun = 0;
  private loudRun = 0;
  private peak = -Infinity;
  private smooth: number | null = null;

  get floor(): number | null {
    return this._floor;
  }

  get phase(): RecPhase {
    return this._phase;
  }

  get reachedChant(): boolean {
    return this._reachedChant;
  }

  feed(db: number): AutoStopTick {
    if (this._phase === 'done') return this.tick(null, 0);
    if (!Number.isFinite(db)) return this.tick(null, 0);
    if (this._phase === 'countdown') {
      this.countdownDbs.push(db);
      if (this.countdownDbs.length >= COUNTDOWN_FRAMES) {
        this._floor = median(this.countdownDbs);
        this._phase = 'chant';
        this._reachedChant = true;
      }
      return this.tick(null, this.levelOf(db));
    }
    let floor = this._floor as number;
    if (db < floor) floor = this._floor = 0.9 * floor + 0.1 * db;
    this.chantFrames++;
    this.smooth = this.smooth === null ? db : 0.8 * this.smooth + 0.2 * db;
    if (db > floor + VOICED_DB) {
      this.voiced++;
      this.peak = Math.max(this.peak, this.smooth);
    }
    const quietLine = Math.max(floor + VOICED_DB, this.peak - SPEECH_DROP_DB);
    if (db < quietLine) {
      this.quietRun++;
      this.loudRun = 0;
    } else {
      this.loudRun++;
      if (this.loudRun >= BLIP_FRAMES) this.quietRun = 0;
    }
    let stopped: StopReason | null = null;
    if (this.voiced >= MIN_SPEECH_FRAMES && this.quietRun >= END_QUIET_FRAMES) stopped = 'quiet';
    else if (this.chantFrames >= MAX_CHANT_FRAMES) stopped = 'limit';
    if (stopped) this._phase = 'done';
    return this.tick(stopped, this.levelOf(db));
  }

  /** Manual stop (the always-visible Stop button). */
  stop(): void {
    this._phase = 'done';
  }

  private levelOf(db: number): number {
    const ref = this._floor ?? (this.countdownDbs.length ? median(this.countdownDbs) : db);
    return Math.max(0, Math.min(1, (db - ref) / LEVEL_RANGE_DB));
  }

  private tick(stopped: StopReason | null, level: number): AutoStopTick {
    const countdown = this._phase === 'countdown' ? 3 - Math.floor(this.countdownDbs.length / FRAMES_PER_COUNT) : 0;
    return { phase: this._phase, countdown, level, stopped };
  }
}
