import type { SampleRecord } from './db';

export const MANIFEST_NAME = 'manifest.json';

export interface ManifestEntry {
  sampleId: string;
  fileId: string;
  createdAt: number;
  durationSec: number;
  trimStart: number;
  trimEnd: number;
  floor: number;
  engineVersion: number;
}

export interface Manifest {
  version: 1;
  samples: ManifestEntry[];
}

export function emptyManifest(): Manifest {
  return { version: 1, samples: [] };
}

export function entryFromSample(s: SampleRecord): ManifestEntry {
  if (!s.driveFileId) throw new Error(`Sample ${s.id} has no Drive file`);
  return {
    sampleId: s.id, fileId: s.driveFileId, createdAt: s.createdAt, durationSec: s.durationSec,
    trimStart: s.trimStart, trimEnd: s.trimEnd, floor: s.floor, engineVersion: s.engineVersion,
  };
}

/** Union by sampleId (first side wins on conflict), minus deleted files, oldest first. */
export function mergeManifests(a: Manifest, b: Manifest, deletedFileIds: ReadonlySet<string> = new Set()): Manifest {
  const byId = new Map<string, ManifestEntry>();
  for (const e of [...a.samples, ...b.samples]) if (!byId.has(e.sampleId) && !deletedFileIds.has(e.fileId)) byId.set(e.sampleId, e);
  return { version: 1, samples: [...byId.values()].sort((x, y) => x.createdAt - y.createdAt) };
}

const NUMERIC_FIELDS = ['createdAt', 'durationSec', 'trimStart', 'trimEnd', 'floor', 'engineVersion'] as const;

function isValidEntry(e: unknown): e is ManifestEntry {
  if (typeof e !== 'object' || e === null) return false;
  const r = e as Record<string, unknown>;
  return typeof r.sampleId === 'string' && typeof r.fileId === 'string' && NUMERIC_FIELDS.every((k) => Number.isFinite(r[k]));
}

/** Keeps only well-formed entries; an unreadable manifest parses as empty. */
export function parseManifest(text: string): Manifest {
  try {
    const m = JSON.parse(text) as { samples?: unknown } | null;
    return Array.isArray(m?.samples) ? { version: 1, samples: m.samples.filter(isValidEntry) } : emptyManifest();
  } catch {
    return emptyManifest();
  }
}
