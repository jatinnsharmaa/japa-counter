import { useState } from 'preact/hooks';
import { isValidTarget, MIN_SAMPLES, useStore } from '../state/store';
import { Settings } from './Settings';

const PRESETS = [108, 1008];

function hintFor(n: number): string | null {
  if (n < MIN_SAMPLES) return 'Record at least 3 samples to start. 6 to 8 work best.';
  if (n < 6) return 'Ready to start. 6 to 8 samples work best.';
  return null;
}

export function Setup() {
  const store = useStore();
  const s = store.settings.value;
  const [targetText, setTargetText] = useState(String(s.target));
  const [showSettings, setShowSettings] = useState(false);
  const hint = hintFor(store.samples.value.length);

  const setTarget = (text: string) => {
    setTargetText(text);
    void store.updateSettings({ target: Number(text) }); // '' → 0, which isValidTarget rejects
  };

  return (
    <main class="setup">
      <section aria-labelledby="mantra-h">
        <h2 id="mantra-h">Mantra</h2>
        <label class="sr-only" for="mantra-dev">Mantra (Devanagari)</label>
        <textarea id="mantra-dev" class="mantra-input" lang="sa" rows={2} value={s.mantraDevanagari}
          onChange={(e) => void store.updateSettings({ mantraDevanagari: e.currentTarget.value })} />
        <label class="sr-only" for="mantra-roman">Mantra (roman)</label>
        <input id="mantra-roman" class="mantra-roman-input" value={s.mantraRoman}
          onChange={(e) => void store.updateSettings({ mantraRoman: e.currentTarget.value })} />
      </section>

      <section aria-labelledby="samples-h">
        <h2 id="samples-h">Voice samples</h2>
        {hint && <p class="hint">{hint}</p>}
      </section>

      <section>
        <h2>Target</h2>
        <div class="target-row">
          <input id="target" aria-label="Target" type="number" inputMode="numeric" min={1} max={100000} step={1}
            value={targetText} aria-invalid={!isValidTarget(Number(targetText))}
            onInput={(e) => setTarget(e.currentTarget.value)} />
          {PRESETS.map((p) => (
            <button key={p} type="button" class="preset" aria-pressed={s.target === p} onClick={() => setTarget(String(p))}>{p}</button>
          ))}
        </div>
      </section>

      <button type="button" class="start" disabled={!store.canStart.value} onClick={() => (store.screen.value = 'session')}>Start</button>

      <button type="button" class="link" aria-expanded={showSettings} onClick={() => setShowSettings(!showSettings)}>Settings</button>
      {showSettings && <Settings />}
    </main>
  );
}
