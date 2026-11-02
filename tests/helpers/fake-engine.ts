import type { EngineHandle, FromEngine, ToEngine } from '../../src/audio/protocol';

export class FakeEngine implements EngineHandle {
  ctx: AudioContext | null = {} as AudioContext;
  sent: ToEngine[] = [];
  closed = false;
  private readonly listeners = new Set<(msg: FromEngine) => void>();

  send(msg: ToEngine): void {
    this.sent.push(msg);
  }

  on(listener: (msg: FromEngine) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async close(): Promise<void> {
    this.closed = true;
  }

  emit(msg: FromEngine): void {
    for (const l of [...this.listeners]) l(msg);
  }

  listenerCount(): number {
    return this.listeners.size;
  }

  sentTypes(): string[] {
    return this.sent.map((m) => m.type);
  }
}
