import { decodeWav, encodeWav } from '../audio/wav';
import { FRAME, HOP, SR } from '../engine/constants';
import { extractFrames } from '../engine/features';
import { processTake } from '../engine/takes';
import { ENGINE_VERSION } from '../engine/version';
import { listSamples, putSample, type JapaDB, type SampleRecord } from './db';

type Base = Pick<SampleRecord, 'id' | 'createdAt' | 'wav' | 'floor' | 'synced' | 'driveFileId'>;

/** Features always come from the 16-bit WAV so re-extraction (F16) reproduces them exactly. */
export function rebuildFromWav(base: Base): SampleRecord | null {
  const { pcm, sampleRate } = decodeWav(base.wav);
  if (sampleRate !== SR) throw new Error(`Expected a ${SR} Hz sample, got ${sampleRate} Hz`);
  const take = processTake(extractFrames(pcm), base.floor);
  if (!take) return null;
  const trimStart = take.start * HOP;
  const trimEnd = Math.min(pcm.length, take.end * HOP + FRAME);
  return {
    id: base.id,
    createdAt: base.createdAt,
    wav: base.wav,
    floor: base.floor,
    synced: base.synced,
    ...(base.driveFileId ? { driveFileId: base.driveFileId } : {}),
    durationSec: (trimEnd - trimStart) / SR,
    trimStart,
    trimEnd,
    engineVersion: ENGINE_VERSION,
    take,
  };
}

export function buildSampleFromRecording(pcm16k: Float32Array, floor: number, now = Date.now(), id: string = crypto.randomUUID()): SampleRecord | null {
  return rebuildFromWav({ id, createdAt: now, wav: encodeWav(pcm16k, SR), floor, synced: false });
}

export function isUsable(s: SampleRecord): boolean {
  return s.engineVersion === ENGINE_VERSION;
}

/**
 * Re-extracts features for samples cached by another engine version. Each sample is rebuilt
 * independently: one that cannot be rebuilt (no chant found, corrupt or non-16 kHz WAV) is left
 * on disk unchanged, so it stays unusable, and its id is reported in `failed`.
 */
export async function ensureCurrentFeatures(db: JapaDB): Promise<{ updated: number; failed: string[] }> {
  let updated = 0;
  const failed: string[] = [];
  for (const s of await listSamples(db)) {
    if (isUsable(s)) continue;
    try {
      const rebuilt = rebuildFromWav(s);
      if (!rebuilt) {
        failed.push(s.id);
        continue;
      }
      await putSample(db, rebuilt);
      updated++;
    } catch {
      failed.push(s.id);
    }
  }
  return { updated, failed };
}

export function trimmedWav(s: SampleRecord): ArrayBuffer {
  const { pcm } = decodeWav(s.wav);
  return encodeWav(pcm.subarray(s.trimStart, s.trimEnd), SR);
}
