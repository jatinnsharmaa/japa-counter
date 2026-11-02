import type { Take } from '../engine/types';

export type ToEngine =
  | { type: 'init'; inRate: number; port?: MessagePort }
  | { type: 'rec-start' }
  | { type: 'rec-stop' }
  | { type: 'session-start'; takes: Take[]; thr: number; sampleFloor: number }
  | { type: 'session-stop' };

export type FromEngine =
  | { type: 'frame'; db: number }
  | { type: 'rec-pcm'; pcm: Float32Array }
  | { type: 'session-ready'; floor: number }
  | { type: 'count'; te: number };

export interface EngineHandle {
  readonly ctx: AudioContext | null;
  send(msg: ToEngine, transfer?: Transferable[]): void;
  on(listener: (msg: FromEngine) => void): () => void;
  close(): Promise<void>;
}

export type OpenEngine = () => Promise<EngineHandle>;
