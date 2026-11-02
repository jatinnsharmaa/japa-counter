import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { FIXTURE_DIR, writeFixtures } from '../../scripts/make-fixtures';

export default function globalSetup() {
  const names = ['sample-1.wav', 'sample-2.wav', 'sample-3.wav', 'rec-once.wav', 'stream-20.wav'];
  if (!names.every((n) => existsSync(join(FIXTURE_DIR, n)))) writeFixtures();
}
