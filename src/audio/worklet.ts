const CHUNK = 1024;

/** Copies mic input to the engine worker in 1024-sample chunks over a dedicated MessagePort. */
class CaptureProcessor extends AudioWorkletProcessor {
  private out: MessagePort | null = null;
  private buf = new Float32Array(CHUNK);
  private n = 0;

  constructor() {
    super();
    this.port.onmessage = (e: MessageEvent<{ type: string; port: MessagePort }>) => {
      if (e.data?.type === 'port') this.out = e.data.port;
    };
  }

  process(inputs: Float32Array[][]): boolean {
    const ch = inputs[0]?.[0];
    if (ch && this.out) {
      for (let i = 0; i < ch.length; i++) {
        this.buf[this.n++] = ch[i];
        if (this.n === CHUNK) {
          this.out.postMessage(this.buf, [this.buf.buffer]);
          this.buf = new Float32Array(CHUNK);
          this.n = 0;
        }
      }
    }
    return true;
  }
}

registerProcessor('japa-capture', CaptureProcessor);
