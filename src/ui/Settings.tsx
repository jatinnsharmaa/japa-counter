import { STRICTNESS_STEPS } from '../engine/calibrate';
import { formatDuration } from '../session/session-logic';
import { useStore } from '../state/store';

const STRICTNESS_LABELS = ['Strictest', 'Very strict', 'Stricter', 'Strict (default)', 'Relaxed', 'Most relaxed'];
const dateFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export function Settings() {
  const store = useStore();
  const s = store.settings.value;
  return (
    <div class="settings">
      <fieldset>
        <legend>Strictness</legend>
        {STRICTNESS_STEPS.map((step, i) => (
          <label key={step} class="radio">
            <input type="radio" name="strictness" checked={s.strictness === step} onChange={() => void store.updateSettings({ strictness: step })} />
            {STRICTNESS_LABELS[i]}
          </label>
        ))}
        <p class="hint">Stricter may miss a chant now and then. Relaxed may count something that isn’t one.</p>
      </fieldset>
      <label class="checkbox">
        <input type="checkbox" checked={s.bell} onChange={(e) => void store.updateSettings({ bell: e.currentTarget.checked })} />
        Soft bell every 108
      </label>
      <h3>History</h3>
      {store.history.value.length === 0 ? (
        <p class="hint">No sessions yet.</p>
      ) : (
        <ul class="history">
          {store.history.value.map((h) => (
            <li key={h.id ?? h.at}>
              {dateFmt.format(h.at)} · {h.count} / {h.target} · {formatDuration(h.secs)} · {h.avgSecsPerChant.toFixed(1)} s per chant
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
