import { describe, expect, it } from 'vitest';
import { emptyManifest, entryFromSample, mergeManifests, parseManifest, type ManifestEntry } from '../../../src/storage/manifest';
import { makeSampleRecord } from '../../helpers/samples';

const entry = (sampleId: string, fileId: string, createdAt: number): ManifestEntry => ({
  sampleId, fileId, createdAt, durationSec: 2.6, trimStart: 0, trimEnd: 1, floor: -60, engineVersion: 1,
});

describe('manifest', () => {
  it('builds an entry from a synced sample', () => {
    const s = { ...makeSampleRecord(91), driveFileId: 'F91', synced: true };
    expect(entryFromSample(s)).toEqual({
      sampleId: s.id, fileId: 'F91', createdAt: s.createdAt, durationSec: s.durationSec, trimStart: s.trimStart, trimEnd: s.trimEnd, floor: s.floor, engineVersion: s.engineVersion,
    });
  });

  it('merge keeps entries from both sides, oldest first, without duplicates', () => {
    const a = { version: 1 as const, samples: [entry('s2', 'f2', 2), entry('s1', 'f1', 1)] };
    const b = { version: 1 as const, samples: [entry('s3', 'f3', 3), entry('s1', 'f1', 1)] };
    expect(mergeManifests(a, b).samples.map((e) => e.sampleId)).toEqual(['s1', 's2', 's3']);
  });

  it('merge drops deleted files', () => {
    const a = { version: 1 as const, samples: [entry('s1', 'f1', 1), entry('s2', 'f2', 2)] };
    expect(mergeManifests(a, emptyManifest(), new Set(['f1'])).samples.map((e) => e.sampleId)).toEqual(['s2']);
  });

  it('parses tolerantly', () => {
    expect(parseManifest('not json')).toEqual(emptyManifest());
    expect(parseManifest(JSON.stringify({ version: 1, samples: [entry('s1', 'f1', 1)] })).samples).toHaveLength(1);
  });
});
