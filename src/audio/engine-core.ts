import { Counter } from '../engine/counter';
import { FeatureStream } from '../engine/features';
import { SESSION_QUIET_FRAMES, sessionFloor } from '../engine/floor';
import type { Frame, Take } from '../engine/types';
import type { FromEngine, ToEngine } from './protocol';

type Mode = 'idle' | 'rec' | 'quiet' | 'live';

/** Worker-side engine, free of worker globals so it runs in Node tests. */
export class EngineCore {
  private inRate = 16000;
  private mode: Mode = 'idle';
  private stream: FeatureStream | null = null;
  private recPcm: Float32Array[] = [];
  private quietDbs: number[] = [];
  private counter: Counter | null = null;
  private session: { takes: Take[]; thr: number; sampleFloor: number } | null = null;

  constructor(private readonly post: (msg: FromEngine, transfer?: Transferable[]) => void) {}

  handle(msg: ToEngine): void {
    switch (msg.type) {
      case 'init':
        this.inRate = msg.inRate;
        if (msg.port) msg.port.onmessage = (e: MessageEvent<Float32Array>) => this.audio(e.data);
        break;
      case 'rec-start':
        this.recPcm = [];
        this.mode = 'rec';
        this.stream = new FeatureStream(this.inRate, (f) => this.onFrame(f), (pcm) => this.recPcm.push(pcm.slice()));
        break;
      case 'rec-stop': {
        this.stream?.flush();
        const total = this.recPcm.reduce((n, a) => n + a.length, 0);
        const pcm = new Float32Array(total);
        let o = 0;
        for (const a of this.recPcm) {
          pcm.set(a, o);
          o += a.length;
        }
        this.recPcm = [];
        this.mode = 'idle';
        this.stream = null;
        this.post({ type: 'rec-pcm', pcm }, [pcm.buffer]);
        break;
      }
      case 'session-start':
        this.session = { takes: msg.takes, thr: msg.thr, sampleFloor: msg.sampleFloor };
        this.quietDbs = [];
        this.counter = null;
        this.mode = 'quiet';
        this.stream = new FeatureStream(this.inRate, (f) => this.onFrame(f));
        break;
      case 'session-stop':
        this.mode = 'idle';
        this.stream = null;
        this.counter = null;
        this.session = null;
        break;
    }
  }

  audio(chunk: Float32Array): void {
    if (this.mode === 'idle') return;
    this.stream?.push(chunk);
  }

  private onFrame(f: Frame): void {
    if (this.mode === 'rec') {
      this.post({ type: 'frame', db: f.db });
    } else if (this.mode === 'quiet' && this.session) {
      if (Number.isFinite(f.db)) this.quietDbs.push(f.db);
      if (this.quietDbs.length >= SESSION_QUIET_FRAMES) {
        const floor = sessionFloor(this.quietDbs, this.session.sampleFloor);
        this.counter = new Counter(this.session.takes, { thr: this.session.thr, floor, onCount: (m) => this.post({ type: 'count', te: m.te }) });
        this.mode = 'live';
        this.post({ type: 'session-ready', floor });
      }
    } else if (this.mode === 'live') {
      this.counter?.feed(f);
    }
  }
}
