import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodeWav } from '../src/audio/wav';
import { append, MANTRA, Synth } from '../tests/helpers/synth';

export const FIXTURE_DIR = join(process.cwd(), 'tests/fixtures/synthetic');

export function writeFixtures(dir: string = FIXTURE_DIR): void {
  mkdirSync(dir, { recursive: true });
  const s = new Synth(7);
  const write = (name: string, pcm: number[]) => writeFileSync(join(dir, name), Buffer.from(encodeWav(Float32Array.from(s.addNoise(pcm)))));
  for (let i = 1; i <= 3; i++) write(`sample-${i}.wav`, append(append(s.silence(0.6), s.chant(MANTRA, s.vary())), s.silence(0.8)));
  write('rec-once.wav', append(append(s.silence(4.5), s.chant(MANTRA, s.vary())), s.silence(10)));
  const stream = s.silence(3);
  for (let i = 0; i < 20; i++) append(stream, s.chant(MANTRA, s.vary()));
  write('stream-20.wav', append(stream, s.silence(5)));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFixtures();
  console.log(`fixtures written to ${FIXTURE_DIR}`);
}
