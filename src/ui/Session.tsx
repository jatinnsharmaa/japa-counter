import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { bell, chime } from '../audio/bell';
import type { EngineHandle, OpenEngine } from '../audio/protocol';
import { formatSummary, formatTimer, SessionState, type SessionResult } from '../session/session-logic';
import { useStore } from '../state/store';

type Phase = 'quiet' | 'live' | 'done';
const CHIME_TAIL_MS = 4500; // keep the audio context alive while the chime rings

export function Session({ openEngine, onExit }: { openEngine: OpenEngine; onExit: () => void }) {
  const store = useStore();
  const settings = store.settings.value;
  const rootRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<SessionState | null>(null);
  stateRef.current ??= new SessionState(settings.target, settings.bell, () => performance.now());
  const phaseRef = useRef<Phase>('quiet');
  const [phase, setPhaseState] = useState<Phase>('quiet');
  const [count, setCount] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [bump, setBump] = useState(0);
  const [chimed, setChimed] = useState(false);
  const [result, setResult] = useState<SessionResult | null>(null);
  const [failed, setFailed] = useState(false);

  const setPhase = (p: Phase) => {
    phaseRef.current = p;
    setPhaseState(p);
  };

  // Layout effect: Preact 11 defers passive-effect cleanups on unmount until after paint,
  // and the microphone must be released as soon as the session screen goes away.
  useLayoutEffect(() => {
    const st = stateRef.current as SessionState;
    let engine: EngineHandle | null = null;
    let unsub = () => {};
    let wake: WakeLockSentinel | null = null;
    let timer = 0;
    let cancelled = false;

    const releaseWake = () => {
      const w = wake;
      wake = null;
      void w?.release().catch(() => {});
    };

    const acquireWake = async () => {
      try {
        const w = (await navigator.wakeLock?.request('screen')) ?? null;
        if (cancelled || st.ended) void w?.release().catch(() => {});
        else {
          releaseWake();
          wake = w;
        }
      } catch {
        /* wake lock is optional */
      }
    };

    const end = () => {
      if (st.ended) return;
      window.clearInterval(timer);
      const r = st.end();
      setResult(r);
      setElapsed(r.secs);
      setPhase('done');
      const e = engine;
      e?.send({ type: 'session-stop' });
      window.setTimeout(() => void e?.close(), CHIME_TAIL_MS);
      releaseWake();
      if (r.count > 0) {
        void store.recordSession({ at: Date.now(), count: r.count, target: r.target, secs: r.secs, avgSecsPerChant: r.avgSecsPerChant }).catch(() => {});
      }
    };

    const onKey = (e: KeyboardEvent) => {
      if (phaseRef.current === 'done') {
        if (e.repeat) return;
        if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
        onExit();
      } else if (e.key === 'Escape') {
        end();
      }
    };
    const onFullscreen = () => {
      if (!document.fullscreenElement && phaseRef.current !== 'done') end();
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible' && phaseRef.current !== 'done') void acquireWake();
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('fullscreenchange', onFullscreen);
    document.addEventListener('visibilitychange', onVisible);

    void (async () => {
      // Fullscreen needs the Start click's user activation, so request it first and don't wait on it.
      try {
        void Promise.resolve(rootRef.current?.requestFullscreen?.()).catch(() => {});
      } catch {
        /* fullscreen is optional */
      }
      void acquireWake();
      let e: EngineHandle;
      try {
        e = await openEngine();
      } catch {
        if (!cancelled) {
          setFailed(true);
          end();
        }
        return;
      }
      if (cancelled) {
        void e.close();
        return;
      }
      engine = e;
      unsub = e.on((msg) => {
        if (msg.type === 'session-ready') {
          st.begin();
          setPhase('live');
          timer = window.setInterval(() => setElapsed(st.elapsedSec()), 500);
        } else if (msg.type === 'count') {
          const fx = st.onCount();
          if (fx === null && (st.ended || !st.started)) return;
          setCount(st.count);
          setBump((b) => b + 1);
          if (fx === 'bell' && e.ctx) bell(e.ctx);
          if (fx === 'target') {
            if (e.ctx) chime(e.ctx);
            setChimed(true);
            end();
          }
        }
      });
      e.send({
        type: 'session-start',
        takes: store.usableSamples.value.map((s) => s.take),
        thr: store.threshold.value ?? 0,
        sampleFloor: store.sampleFloor.value,
      });
    })();

    return () => {
      cancelled = true;
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('fullscreenchange', onFullscreen);
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(timer);
      unsub();
      if (!st.ended) {
        engine?.send({ type: 'session-stop' });
        void engine?.close();
      }
      releaseWake();
    };
  }, []);

  return (
    <div
      ref={rootRef}
      class="session"
      data-testid="session"
      data-phase={phase}
      data-count={count}
      data-chimed={chimed ? 'true' : 'false'}
      onClick={() => phaseRef.current === 'done' && onExit()}
    >
      {phase === 'quiet' ? (
        <p class="session-quiet">Stay quiet</p>
      ) : failed ? (
        <div />
      ) : (
        <div class="mantra">
          <p class="mantra-dev" lang="sa">{settings.mantraDevanagari}</p>
          <p class="mantra-roman">{settings.mantraRoman}</p>
        </div>
      )}
      <div class="session-meta">
        {phase === 'done' && result ? (
          <p class="summary" data-testid="summary">{failed ? 'Microphone unavailable. Press any key to go back.' : formatSummary(result.count, result.secs)}</p>
        ) : phase === 'live' ? (
          <>
            <p class={bump > 0 ? 'count bump' : 'count'} key={bump}>{count} / {settings.target}</p>
            <p class="timer">{formatTimer(elapsed)}</p>
          </>
        ) : null}
      </div>
    </div>
  );
}
