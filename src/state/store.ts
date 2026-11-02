import { computed, signal, type ReadonlySignal, type Signal } from '@preact/signals';
import { createContext } from 'preact';
import { useContext } from 'preact/hooks';
import { calibrate, flagOutliers, liveThreshold } from '../engine/calibrate';
import type { Calibration } from '../engine/types';
import {
  addHistory, DEFAULT_SETTINGS, deleteSample, getMeta, getSettings, listHistory, listSamples, putSample, saveSettings, setMeta,
  type HistoryEntry, type JapaDB, type SampleRecord, type Settings,
} from '../storage/db';
import { ensureCurrentFeatures, isUsable } from '../storage/samples';

export const MIN_SAMPLES = 3;
export const MAX_SAMPLES = 10;
export const MAX_TARGET = 100_000;
const DEFAULT_SAMPLE_FLOOR = -60;

export function isValidTarget(n: number): boolean {
  return Number.isInteger(n) && n >= 1 && n <= MAX_TARGET;
}

export interface Store {
  readonly db: JapaDB;
  readonly settings: Signal<Settings>;
  readonly samples: Signal<SampleRecord[]>;
  readonly history: Signal<HistoryEntry[]>;
  readonly screen: Signal<'setup' | 'session'>;
  readonly micExplained: Signal<boolean>;
  readonly usableSamples: ReadonlySignal<SampleRecord[]>;
  readonly calibration: ReadonlySignal<Calibration | null>;
  readonly outliers: ReadonlySignal<boolean[]>;
  readonly threshold: ReadonlySignal<number | null>;
  readonly sampleFloor: ReadonlySignal<number>;
  readonly canStart: ReadonlySignal<boolean>;
  load(): Promise<void>;
  updateSettings(patch: Partial<Settings>): Promise<void>;
  addSample(rec: SampleRecord): Promise<void>;
  removeSample(id: string): Promise<void>;
  refreshSamples(): Promise<void>;
  recordSession(entry: Omit<HistoryEntry, 'id'>): Promise<void>;
  markMicExplained(): Promise<void>;
  onLocalChange(listener: () => void): () => void;
}

export function createStore(db: JapaDB): Store {
  const settings = signal<Settings>(DEFAULT_SETTINGS);
  const samples = signal<SampleRecord[]>([]);
  const history = signal<HistoryEntry[]>([]);
  const screen = signal<'setup' | 'session'>('setup');
  const micExplained = signal(false);
  const listeners = new Set<() => void>();

  const usableSamples = computed(() => samples.value.filter(isUsable));
  const calibration = computed(() => (usableSamples.value.length >= MIN_SAMPLES ? calibrate(usableSamples.value.map((s) => s.take)) : null));
  const outliers = computed(() => {
    const flags = calibration.value ? flagOutliers(calibration.value.perAvg) : [];
    const byId = new Map(usableSamples.value.map((s, i) => [s.id, flags[i] ?? false]));
    return samples.value.map((s) => byId.get(s.id) ?? false);
  });
  const threshold = computed(() => (calibration.value ? liveThreshold(calibration.value, settings.value.strictness) : null));
  const sampleFloor = computed(() =>
    usableSamples.value.length ? usableSamples.value.reduce((a, s) => a + s.floor, 0) / usableSamples.value.length : DEFAULT_SAMPLE_FLOOR,
  );
  const canStart = computed(() => threshold.value !== null && isValidTarget(settings.value.target));

  const refreshSamples = async () => {
    samples.value = await listSamples(db);
  };
  const notify = () => listeners.forEach((l) => l());

  return {
    db, settings, samples, history, screen, micExplained, usableSamples, calibration, outliers, threshold, sampleFloor, canStart,
    refreshSamples,
    async load() {
      await ensureCurrentFeatures(db);
      settings.value = await getSettings(db);
      samples.value = await listSamples(db);
      history.value = await listHistory(db);
      micExplained.value = (await getMeta<boolean>(db, 'micExplained')) === true;
    },
    async updateSettings(patch) {
      settings.value = { ...settings.value, ...patch };
      await saveSettings(db, settings.value);
    },
    async addSample(rec) {
      if ((await listSamples(db)).length >= MAX_SAMPLES) throw new Error('Sample limit reached');
      await putSample(db, rec);
      await refreshSamples();
      notify();
    },
    async removeSample(id) {
      await deleteSample(db, id);
      await refreshSamples();
      notify();
    },
    async recordSession(entry) {
      await addHistory(db, entry);
      history.value = await listHistory(db);
    },
    async markMicExplained() {
      micExplained.value = true;
      await setMeta(db, 'micExplained', true);
    },
    onLocalChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export const StoreContext = createContext<Store | null>(null);

export function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error('StoreContext is missing');
  return store;
}
