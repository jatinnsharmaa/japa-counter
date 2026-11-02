import { useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { EngineHandle, FromEngine, OpenEngine } from '../audio/protocol';
import { decodeWav } from '../audio/wav';
import { waveformPeaks } from '../audio/waveform';
import { AutoStop } from '../recording/autostop';
import { MAX_SAMPLES, useStore } from '../state/store';
import type { SampleRecord } from '../storage/db';
import { buildSampleFromRecording, trimmedWav } from '../storage/samples';
import { useClipPlayer } from './useClipPlayer';

type View =
  | { kind: 'idle'; message?: string }
  | { kind: 'explain' }
  | { kind: 'countdown'; n: number }
  | { kind: 'chant' }
  | { kind: 'finishing'; chant: boolean }
  | { kind: 'review'; sample: SampleRecord }
  | { kind: 'failed' }
  | { kind: 'error'; message: string };

function micErrorMessage(err: unknown): string {
  const name = err instanceof DOMException || err instanceof Error ? err.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Microphone blocked. Allow it from the address bar, then try again.';
  if (name === 'NotFoundError') return 'No microphone found.';
  return 'Couldn’t open the microphone.';
}

function LevelLine({ level }: { level: number }) {
  return (
    <div class="level" role="meter" aria-label="Microphone level" aria-valuemin={0} aria-valuemax={1} aria-valuenow={level}>
      <span style={{ transform: `scaleX(${level})` }} />
    </div>
  );
}

function Review({ sample, onKeep, onRedo }: { sample: SampleRecord; onKeep: () => void; onRedo: () => void }) {
  const wav = useMemo(() => trimmedWav(sample), [sample]);
  const peaks = useMemo(() => waveformPeaks(decodeWav(wav).pcm, 120), [wav]);
  const max = Math.max(1e-6, ...peaks);
  const clip = useClipPlayer(wav);
  return (
    <div class="review">
      <svg class="waveform" aria-label="Waveform" role="img" viewBox="0 0 120 40" preserveAspectRatio="none">
        {peaks.map((p, i) => {
          const h = Math.max(0.5, (p / max) * 38);
          return <rect key={i} x={i + 0.15} y={20 - h / 2} width={0.7} height={h} />;
        })}
      </svg>
      <div class="row">
        <button type="button" onClick={clip.toggle}>{clip.playing ? 'Pause' : 'Play'}</button>
        <button type="button" onClick={onKeep}>Keep</button>
        <button type="button" onClick={onRedo}>Redo</button>
      </div>
    </div>
  );
}

export function Recorder({ openEngine }: { openEngine: OpenEngine }) {
  const store = useStore();
  const [view, setView] = useState<View>({ kind: 'idle' });
  const [level, setLevel] = useState(0);
  const engineRef = useRef<EngineHandle | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);
  const autoRef = useRef<AutoStop | null>(null);
  const stoppingRef = useRef(false);
  const openingRef = useRef<Promise<EngineHandle> | null>(null);
  const unmountedRef = useRef(false);

  // Layout-effect cleanup: Preact 11 defers passive-effect cleanups on unmount until after paint,
  // and the microphone should be released immediately when Setup goes away.
  useLayoutEffect(
    () => () => {
      unmountedRef.current = true;
      unsubRef.current?.();
      void engineRef.current?.close();
      engineRef.current = null;
    },
    [],
  );

  const requestStop = () => {
    const auto = autoRef.current;
    if (!auto || stoppingRef.current) return;
    stoppingRef.current = true;
    const chant = auto.reachedChant;
    auto.stop();
    setView({ kind: 'finishing', chant });
    engineRef.current?.send({ type: 'rec-stop' });
  };

  /** The engine failed: release it so the next Record opens the mic afresh. */
  const dropEngine = () => {
    unsubRef.current?.();
    unsubRef.current = null;
    void engineRef.current?.close();
    engineRef.current = null;
    openingRef.current = null;
    autoRef.current = null;
    stoppingRef.current = false;
  };

  const onMessage = (msg: FromEngine) => {
    if (msg.type === 'error') {
      dropEngine();
      setView({ kind: 'error', message: 'Couldn’t open the microphone.' });
      return;
    }
    const auto = autoRef.current;
    if (!auto) return;
    if (msg.type === 'frame') {
      if (stoppingRef.current) return;
      const tick = auto.feed(msg.db);
      setLevel(tick.level);
      if (tick.phase === 'countdown') setView((v) => (v.kind === 'countdown' && v.n === tick.countdown ? v : { kind: 'countdown', n: tick.countdown }));
      else if (tick.phase === 'chant') setView((v) => (v.kind === 'chant' ? v : { kind: 'chant' }));
      if (tick.stopped) requestStop();
    } else if (msg.type === 'rec-pcm') {
      autoRef.current = null;
      stoppingRef.current = false;
      if (!auto.reachedChant || auto.countdownFloor === null) {
        setView({ kind: 'idle' });
        return;
      }
      const rec = buildSampleFromRecording(msg.pcm.subarray(auto.chantStartSample), auto.countdownFloor);
      setView(rec ? { kind: 'review', sample: rec } : { kind: 'failed' });
    }
  };

  const begin = async () => {
    try {
      if (!engineRef.current) {
        if (openingRef.current) return; // a take is already waiting for the mic
        const opening = openEngine();
        openingRef.current = opening;
        let engine: EngineHandle;
        try {
          engine = await opening;
        } catch (err) {
          openingRef.current = null;
          throw err;
        }
        if (unmountedRef.current) {
          void engine.close();
          return;
        }
        engineRef.current = engine;
        unsubRef.current = engine.on(onMessage);
      }
      autoRef.current = new AutoStop();
      stoppingRef.current = false;
      setLevel(0);
      setView({ kind: 'countdown', n: 3 });
      engineRef.current.send({ type: 'rec-start' });
    } catch (err) {
      setView({ kind: 'error', message: micErrorMessage(err) });
    }
  };

  const atCap = store.samples.value.length >= MAX_SAMPLES;
  const onRecord = () => (store.micExplained.value ? void begin() : setView({ kind: 'explain' }));
  const onContinue = async () => {
    await store.markMicExplained();
    await begin();
  };
  const onKeep = async (sample: SampleRecord) => {
    await store.addSample(sample);
    setView({ kind: 'idle', message: `Sample ${store.samples.value.length} saved.` });
  };

  switch (view.kind) {
    case 'explain':
      return (
        <div class="recorder">
          <p>Your browser will ask to use the microphone</p>
          <button type="button" onClick={() => void onContinue()}>Continue</button>
        </div>
      );
    case 'countdown':
      return (
        <div class="recorder" aria-live="polite">
          <p>Stay quiet…</p>
          <p class="countdown">{view.n}</p>
          <LevelLine level={level} />
          <button type="button" onClick={requestStop}>Stop</button>
        </div>
      );
    case 'chant':
    case 'finishing':
      return (
        <div class="recorder" aria-live="polite">
          <p>{view.kind === 'finishing' && !view.chant ? 'Stay quiet…' : 'Chant once now.'}</p>
          <LevelLine level={level} />
          <button type="button" onClick={requestStop} disabled={view.kind === 'finishing'}>Stop</button>
        </div>
      );
    case 'review':
      return <Review sample={view.sample} onKeep={() => void onKeep(view.sample)} onRedo={() => void begin()} />;
    case 'failed':
      return (
        <div class="recorder">
          <p>Didn’t catch a full chant. Try again, a little closer to the mic.</p>
          <button type="button" onClick={() => void begin()}>Redo</button>
        </div>
      );
    default:
      return (
        <div class="recorder">
          <button type="button" onClick={onRecord} disabled={atCap}>Record a sample</button>
          <p class="hint">
            {atCap
              ? '10 samples is the most the counter uses. Delete one to record another.'
              : 'You’ll chant the mantra once. Recording stops when you go quiet.'}
          </p>
          {view.kind === 'idle' && view.message && <p class="hint" role="status">{view.message}</p>}
          {view.kind === 'error' && <p class="hint" role="alert">{view.message}</p>}
        </div>
      );
  }
}
