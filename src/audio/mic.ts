import EngineWorker from './engine.worker.ts?worker';
import workletUrl from './worklet.ts?worker&url';
import type { EngineHandle, FromEngine, OpenEngine } from './protocol';

export const MIC_CONSTRAINTS: MediaStreamConstraints = {
  audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
};

/** Opens the mic once and wires mic → AudioWorklet → engine worker. Reuse the handle for every recording on a screen. */
export const openAudioEngine: OpenEngine = async (): Promise<EngineHandle> => {
  const stream = await navigator.mediaDevices.getUserMedia(MIC_CONSTRAINTS);
  const ctx = new AudioContext();
  try {
    await ctx.resume();
    await ctx.audioWorklet.addModule(workletUrl);
  } catch (err) {
    stream.getTracks().forEach((t) => t.stop());
    await ctx.close();
    throw err;
  }
  const source = ctx.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(ctx, 'japa-capture', { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1 });
  const mute = ctx.createGain();
  mute.gain.value = 0;
  source.connect(node);
  node.connect(mute);
  mute.connect(ctx.destination);

  const worker = new EngineWorker();
  const channel = new MessageChannel();
  node.port.postMessage({ type: 'port', port: channel.port1 }, [channel.port1]);
  worker.postMessage({ type: 'init', inRate: ctx.sampleRate, port: channel.port2 }, [channel.port2]);

  const listeners = new Set<(msg: FromEngine) => void>();
  worker.onmessage = (e: MessageEvent<FromEngine>) => listeners.forEach((l) => l(e.data));

  return {
    ctx,
    send: (msg, transfer) => worker.postMessage(msg, transfer ?? []),
    on: (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    close: async () => {
      listeners.clear();
      stream.getTracks().forEach((t) => t.stop());
      source.disconnect();
      node.disconnect();
      worker.terminate();
      await ctx.close();
    },
  };
};
