import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { DEFAULT_STRICTNESS } from '../engine/calibrate';
import type { Take } from '../engine/types';

export interface SampleRecord {
  id: string;
  createdAt: number;
  wav: ArrayBuffer; // 16 kHz mono 16-bit WAV of the chant phase
  durationSec: number; // trimmed (voiced) duration
  trimStart: number; // sample index into the WAV PCM
  trimEnd: number;
  floor: number; // noise floor (dB) measured during the countdown
  engineVersion: number;
  take: Take;
  driveFileId?: string;
  synced: boolean;
}

export interface Settings {
  mantraDevanagari: string;
  mantraRoman: string;
  target: number;
  strictness: number;
  bell: boolean;
}

export interface HistoryEntry {
  id?: number;
  at: number;
  count: number;
  target: number;
  secs: number;
  avgSecsPerChant: number;
}

export const DEFAULT_SETTINGS: Settings = {
  mantraDevanagari: 'ॐ नमः शिवाय',
  mantraRoman: 'om namah shivaya',
  target: 108,
  strictness: DEFAULT_STRICTNESS,
  bell: true,
};

export const DB_NAME = 'japa-counter';
export const HISTORY_LIMIT = 200;

interface JapaSchema extends DBSchema {
  samples: { key: string; value: SampleRecord };
  settings: { key: string; value: Settings };
  history: { key: number; value: HistoryEntry };
  pendingDeletes: { key: string; value: { driveFileId: string } };
  meta: { key: string; value: unknown };
}

export type JapaDB = IDBPDatabase<JapaSchema>;

export function openDb(name: string = DB_NAME): Promise<JapaDB> {
  return openDB<JapaSchema>(name, 1, {
    upgrade(db) {
      db.createObjectStore('samples', { keyPath: 'id' });
      db.createObjectStore('settings');
      db.createObjectStore('history', { keyPath: 'id', autoIncrement: true });
      db.createObjectStore('pendingDeletes', { keyPath: 'driveFileId' });
      db.createObjectStore('meta');
    },
  });
}

export async function listSamples(db: JapaDB): Promise<SampleRecord[]> {
  return (await db.getAll('samples')).sort((a, b) => a.createdAt - b.createdAt);
}

export function getSample(db: JapaDB, id: string): Promise<SampleRecord | undefined> {
  return db.get('samples', id);
}

export async function putSample(db: JapaDB, rec: SampleRecord): Promise<void> {
  await db.put('samples', rec);
}

export async function deleteSample(db: JapaDB, id: string): Promise<void> {
  const tx = db.transaction(['samples', 'pendingDeletes'], 'readwrite');
  const rec = await tx.objectStore('samples').get(id);
  if (rec?.driveFileId) await tx.objectStore('pendingDeletes').put({ driveFileId: rec.driveFileId });
  await tx.objectStore('samples').delete(id);
  await tx.done;
}

export async function getSettings(db: JapaDB): Promise<Settings> {
  return { ...DEFAULT_SETTINGS, ...(await db.get('settings', 'settings')) };
}

export async function saveSettings(db: JapaDB, s: Settings): Promise<void> {
  await db.put('settings', s, 'settings');
}

export async function addHistory(db: JapaDB, e: Omit<HistoryEntry, 'id'>): Promise<void> {
  await db.add('history', e as HistoryEntry);
}

export async function listHistory(db: JapaDB): Promise<HistoryEntry[]> {
  return (await db.getAll('history')).sort((a, b) => b.at - a.at).slice(0, HISTORY_LIMIT);
}

export async function getMeta<T>(db: JapaDB, key: string): Promise<T | undefined> {
  return (await db.get('meta', key)) as T | undefined;
}

export async function setMeta(db: JapaDB, key: string, value: unknown): Promise<void> {
  await db.put('meta', value, key);
}

export async function listPendingDeletes(db: JapaDB): Promise<string[]> {
  return (await db.getAll('pendingDeletes')).map((p) => p.driveFileId);
}

export async function clearPendingDelete(db: JapaDB, driveFileId: string): Promise<void> {
  await db.delete('pendingDeletes', driveFileId);
}
