import { buildSampleFromRecording } from '../../src/storage/samples';
import type { SampleRecord } from '../../src/storage/db';
import { append, floorOf, framesOf, MANTRA, Synth } from './synth';

/** A chant-phase recording: 0.6 s room noise, one chant, 0.8 s room noise. */
export function makeSamplePcm(seed: number): { pcm: Float32Array; floor: number } {
  const s = new Synth(seed);
  const floor = floorOf(framesOf(s.addNoise(s.silence(1))));
  const pcm = Float32Array.from(s.addNoise(append(append(s.silence(0.6), s.chant(MANTRA, s.vary())), s.silence(0.8))));
  return { pcm, floor };
}

export function makeSampleRecord(seed: number, createdAt = 1_700_000_000_000 + seed): SampleRecord {
  const { pcm, floor } = makeSamplePcm(seed);
  const rec = buildSampleFromRecording(pcm, floor, createdAt, `sample-${seed}`);
  if (!rec) throw new Error(`seed ${seed} did not produce a sample`);
  return rec;
}
