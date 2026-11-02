import EngineWorker from './engine.worker.ts?worker';
import workletUrl from './worklet.ts?worker&url';
import type { EngineHandle, FromEngine, OpenEngine } from './protocol';

export const MIC_CONSTRAINTS: MediaStreamConstraints = {
  audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
};

/** Opens the mic once and wires mic → AudioWorklet → engine worker. Reuse the handle for every recording on a screen. */
export const openAudioEngine: OpenEngine = async (): Promise<EngineHandle> => {
  const stream = await navigator.mediaDevices.getUserMedia(MIC_CONSTRAINTS);
  let ctx: AudioContext | null = null;
  let worker: Worker | null = null;
  try {
    ctx = new AudioContext();
    await ctx.resume();
    await ctx.audioWorklet.addModule(workletUrl);
    const source = ctx.createMediaStreamSource(stream);
    const node = new AudioWorkletNode(ctx, 'japa-capture', { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1 });
    const mute = ctx.createGain();
    mute.gain.value = 0;
    source.connect(node);
    node.connect(mute);
    mute.connect(ctx.destination);

    worker = new EngineWorker();
    const channel = new MessageChannel();
    node.port.postMessage({ type: 'port', port: channel.port1 }, [channel.port1]);
    worker.postMessage({ type: 'init', inRate: ctx.sampleRate, port: channel.port2 }, [channel.port2]);

    const listeners = new Set<(msg: FromEngine) => void>();
    const emit = (msg: FromEngine) => [...listeners].forEach((l) => l(msg));
    worker.onmessage = (e: MessageEvent<FromEngine>) => emit(e.data);
    worker.onerror = (e: ErrorEvent) => emit({ type: 'error', message: e.message || 'The audio engine stopped.' });
    worker.onmessageerror = () => emit({ type: 'error', message: 'The audio engine sent an unreadable message.' });

    const openCtx = ctx;
    const openWorker = worker;
    return {
      ctx: openCtx,
      send: (msg, transfer) => openWorker.postMessage(msg, transfer ?? []),
      on: (l) => {
        listeners.add(l);
        return () => listeners.delete(l);
      },
      close: async () => {
        listeners.clear();
        stream.getTracks().forEach((t) => t.stop());
        source.disconnect();
        node.disconnect();
        openWorker.terminate();
        await openCtx.close();
      },
    };
  } catch (err) {
    // Anything that fails after getUserMedia must still release the mic and the audio context.
    worker?.terminate();
    stream.getTracks().forEach((t) => t.stop());
    await ctx?.close().catch(() => {});
    throw err;
  }
};
