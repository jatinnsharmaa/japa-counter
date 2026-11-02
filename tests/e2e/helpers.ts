import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { FIXTURE_DIR } from '../../scripts/make-fixtures';

export function fakeMic(file: string) {
  return {
    launchOptions: {
      args: [
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
        `--use-file-for-fake-audio-capture=${join(FIXTURE_DIR, file)}%noloop`,
        '--autoplay-policy=no-user-gesture-required',
      ],
    },
  };
}

/** Puts fixture WAVs into the app's IndexedDB using the app's own modules, then reloads. */
export async function seedSamples(page: Page, files: string[]): Promise<void> {
  const wavs = files.map((f) => Array.from(readFileSync(join(FIXTURE_DIR, f))));
  await page.evaluate(async (wavs) => {
    const load = (p: string) => import(/* @vite-ignore */ p);
    const { openDb, putSample } = await load('/src/storage/db.ts');
    const { buildSampleFromRecording } = await load('/src/storage/samples.ts');
    const { decodeWav } = await load('/src/audio/wav.ts');
    const { extractFrames } = await load('/src/engine/features.ts');
    const { median } = await load('/src/engine/floor.ts');
    const db = await openDb();
    let i = 0;
    for (const bytes of wavs) {
      const { pcm } = decodeWav(new Uint8Array(bytes).buffer);
      const floor = median(extractFrames(pcm).slice(0, 25).map((f: { db: number }) => f.db));
      const rec = buildSampleFromRecording(pcm, floor, Date.now() + i++);
      if (!rec) throw new Error('fixture did not produce a sample');
      await putSample(db, rec);
    }
    db.close();
  }, wavs);
  await page.reload();
}
