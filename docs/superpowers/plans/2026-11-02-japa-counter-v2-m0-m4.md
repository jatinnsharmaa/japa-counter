# Japa Counter v2 (M0–M4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the v1 japa-counter prototype as a static TypeScript web app (milestones M0–M4 of `docs/DESIGN.md`): engine port with tests, AudioWorklet + worker audio path, the new recording flow, the minimal session screen, and Google Drive storage of sample WAVs.

**Architecture:** Pure-TS engine (`src/engine`) that runs unchanged in Node (tests) and in a Web Worker (app). An AudioWorklet streams mic PCM to the worker over a MessagePort; the worker resamples to 16 kHz, extracts MFCC frames, and either collects a recording or runs the counter. The UI is Preact + signals over an IndexedDB store; Drive sync runs only on the setup screen.

**Tech Stack:** TypeScript (strict), Vite, Preact + @preact/signals, idb, Vitest (+ happy-dom, @testing-library/preact, fake-indexeddb), Playwright (Chrome fake mic), Google Identity Services + Drive REST v3, vite-plugin-pwa.

## Global Constraints

- Spec: `docs/DESIGN.md`. Every row marked **Locked** there is binding.
- TypeScript `strict: true`. Build with Vite. UI in Preact + `@preact/signals`. Local store IndexedDB via `idb`.
- `src/engine/*` is pure TypeScript with **zero runtime dependencies and no DOM APIs**; it must run in Node.
- Engine constants: SR 16000, FRAME 512 (32 ms), HOP 320 (20 ms), NFFT 512, NMEL 40 filters 60–7,600 Hz, NCEP 12 (coefficients 1–12, c0 dropped), pre-emphasis 0.97, Hamming window, FPS 50.
- At 16 kHz input the ported engine must produce the same frames, takes, calibration and counts as v1 Appendix A (proved by the parity test in Task 7).
- Mic constraints for recording and sessions, exactly: `{ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 } }`.
- Audio never leaves the browser except to the user's own Google Drive. No analytics. No third-party runtime scripts except Google Identity Services (`https://accounts.google.com/gsi/client`). Fonts are self-hosted via `@fontsource/*` (no Google Fonts CSS link).
- Sessions never touch the network.
- Stored audio format: WAV, 16 kHz, 16-bit, mono.
- Default mantra: line 1 `ॐ नमः शिवाय`, line 2 `om namah shivaya`.
- Target: integer 1 to 100,000; presets 108 and 1008; default 108.
- Strictness steps: 0.85, 0.90, 0.95, 1.00, 1.05, 1.10; default 1.00. Live threshold = calibration base × strictness.
- Minimum 3 samples to start; recommend 6 to 8; cap 10.
- Soft bell every 108 chants (setting, default on). Three-bell chime at target; session ends by itself.
- Visual tokens: session background `#000000`; mantra `#E6DCCB`; count `#6F675C`; timer `#4A443C`; setup background light `#F5F4F2` / dark `#0A0A0A`; body font Hanken Grotesk (system-ui fallback); mantra font Tiro Devanagari Sanskrit (Noto Serif Devanagari fallback).
- UI copy, verbatim: `You’ll chant the mantra once. Recording stops when you go quiet.` · `Your browser will ask to use the microphone` · `Stay quiet…` (recording) · `Chant once now.` · `Keep` · `Redo` · `Stay quiet` (session start) · summary `1,008 chants  ·  1h 12m 04s` (two spaces either side of the middle dot).
- Removed from v1 and must not appear: mala bead ring, glow effects, round labels, cards, shadows, coloured accents, all-caps section labels, any on-screen End button in the session (Esc ends), manual +1/−1.
- Session screen: pure black, no motion except a ~600 ms count fade (off under `prefers-reduced-motion`), fullscreen + screen wake lock on Start, cursor hidden.
- TDD: write the failing test, run it and see it fail, implement, run and see it pass, commit. Browser-only glue (worklet, worker entry, mic, main.tsx) is exempt from unit tests and is covered by the Playwright tests in Task 15.
- Commits: conventional prefixes (`feat:`, `test:`, `chore:`, `fix:`, `docs:`). **Never add a `Co-Authored-By` line or any AI attribution to commit messages.**
- Work on the existing branch `feat/v2-m0-m4`. Do not push, do not create PRs.

## File Structure

```
package.json  tsconfig.json  vite.config.ts  eslint.config.js  playwright.config.ts  index.html  .nvmrc  README.md
.github/workflows/ci.yml
src/
  main.tsx
  engine/   constants.ts types.ts version.ts dsp.ts features.ts vec.ts matcher.ts takes.ts calibrate.ts floor.ts counter.ts
  audio/    wav.ts waveform.ts bell.ts protocol.ts engine-core.ts engine.worker.ts worklet.ts worklet-env.d.ts mic.ts
  recording/autostop.ts
  session/  session-logic.ts
  storage/  db.ts samples.ts drive.ts manifest.ts sync.ts auth.ts
  state/    store.ts drive-controller.ts
  ui/       App.tsx Setup.tsx Settings.tsx Recorder.tsx SampleRow.tsx Session.tsx DriveSection.tsx useClipPlayer.ts styles.css
scripts/make-fixtures.ts
tests/
  setup.ts
  helpers/  synth.ts v1/core.js fake-engine.ts samples.ts store.ts fake-drive.ts
  unit/     engine/* audio/* recording/* session/* storage/* state/* ui/*
  harness/  synthetic-suite.ts synthetic.test.ts synthetic-extra.test.ts v1-parity.test.ts
  e2e/      global-setup.ts helpers.ts recording.spec.ts session.spec.ts
  fixtures/synthetic/   (generated, git-ignored)
```

---

## M0 — Scaffold

### Task 1: Project scaffold (Vite + TS + Preact + Vitest + Playwright + ESLint + CI)

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `eslint.config.js`, `playwright.config.ts`, `index.html`, `.nvmrc`, `.github/workflows/ci.yml`, `src/main.tsx`, `src/ui/App.tsx`, `src/engine/version.ts`
- Test: `tests/unit/engine/version.test.ts`
- Modify: `.gitignore` (add `tests/fixtures/synthetic/`, `dev-dist/`)

**Interfaces:**
- Produces: `ENGINE_VERSION: number` from `src/engine/version.ts`; npm scripts `dev`, `build`, `typecheck`, `lint`, `test`, `test:harness`, `test:e2e`, `fixtures`.

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "japa-counter",
  "private": true,
  "version": "2.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "test": "vitest run tests/unit",
    "test:harness": "vitest run tests/harness",
    "test:e2e": "playwright test",
    "fixtures": "tsx scripts/make-fixtures.ts"
  }
}
```

- [ ] **Step 2: Install dependencies**

```bash
npm install preact @preact/signals idb @fontsource/hanken-grotesk @fontsource/tiro-devanagari-sanskrit
npm install -D vite @preact/preset-vite typescript vitest happy-dom @testing-library/preact fake-indexeddb @playwright/test eslint @eslint/js typescript-eslint globals tsx @types/node
npx playwright install chromium
```

If `@fontsource/tiro-devanagari-sanskrit` does not exist on npm (`npm view @fontsource/tiro-devanagari-sanskrit`), install `@fontsource/noto-serif-devanagari` instead and report it as a concern.

- [ ] **Step 3: Write config files**

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "jsxImportSource": "preact",
    "strict": true,
    "noEmit": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "types": ["vite/client", "node"]
  },
  "include": ["src", "tests", "scripts", "vite.config.ts", "playwright.config.ts"],
  "exclude": ["tests/helpers/v1"]
}
```

`vite.config.ts`:

```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig({
  plugins: [preact()],
  server: { port: 5173, strictPort: true },
  worker: { format: 'es' },
  test: {
    include: ['tests/unit/**/*.test.{ts,tsx}', 'tests/harness/**/*.test.ts'],
    environment: 'node',
    testTimeout: 20_000,
  },
});
```

`eslint.config.js`:

```js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist', 'dev-dist', 'coverage', 'playwright-report', 'test-results', 'tests/helpers/v1/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { languageOptions: { globals: { ...globals.browser, ...globals.node } } },
);
```

`playwright.config.ts` (the global setup and specs arrive in Task 15):

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 180_000,
  workers: 1,
  use: { baseURL: 'http://localhost:5173', browserName: 'chromium' },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
```

`index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="color-scheme" content="light dark" />
    <title>Japa Counter</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`.nvmrc`: `22`

- [ ] **Step 4: Write the failing test**

`tests/unit/engine/version.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ENGINE_VERSION } from '../../../src/engine/version';

describe('ENGINE_VERSION', () => {
  it('is a positive integer that cached features are tagged with', () => {
    expect(Number.isInteger(ENGINE_VERSION)).toBe(true);
    expect(ENGINE_VERSION).toBe(1);
  });
});
```

- [ ] **Step 5: Run it to see it fail**

Run: `npm test`
Expected: FAIL — cannot resolve `src/engine/version`.

- [ ] **Step 6: Implement**

`src/engine/version.ts`:

```ts
/** Bump whenever feature extraction changes; cached features with another version are re-extracted from stored WAVs (F16). */
export const ENGINE_VERSION = 1;
```

`src/ui/App.tsx`:

```tsx
export function App() {
  return <main class="setup"><h1>Japa Counter</h1></main>;
}
```

`src/main.tsx`:

```tsx
import { render } from 'preact';
import { App } from './ui/App';

render(<App />, document.getElementById('app')!);
```

`.github/workflows/ci.yml`:

```yaml
name: CI
on:
  push:
  pull_request:
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test
      - run: npm run test:harness --if-present -- --passWithNoTests
      - run: npm run build
```

Append to `.gitignore`:

```
tests/fixtures/synthetic/
dev-dist/
```

- [ ] **Step 7: Verify everything is green**

Run: `npm test && npm run lint && npm run typecheck && npm run build`
Expected: 1 test passes; lint, typecheck and build succeed.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: scaffold Vite + Preact + Vitest + Playwright project with CI"
```

---

## M1 — Engine port

### Task 2: Engine constants, types and DSP (FFT, mel filterbank, MFCC frame)

**Files:**
- Create: `src/engine/constants.ts`, `src/engine/types.ts`, `src/engine/dsp.ts`
- Test: `tests/unit/engine/dsp.test.ts`

**Interfaces:**
- Produces:
  - `constants.ts`: `SR, FRAME, HOP, NFFT, NMEL, NCEP, FPS, MEL_LO_HZ, MEL_HI_HZ, PRE_EMPHASIS, VOICED_DB`
  - `types.ts`: `interface Frame { v: Float32Array; db: number }`, `interface Take { frames: Float32Array[]; mean: Float32Array; dur: number; start: number; end: number }`, `interface MatchResult { score: number; ts: number; te: number }`, `interface Calibration { base: number; mean: number; sd: number; max: number; perAvg: number[] }`
  - `dsp.ts`: `computeFrame(x: ArrayLike<number>): Frame`, `powerSpectrum(x: ArrayLike<number>): Float64Array`, `melEdgeBins: number[]`, `melFilters: MelFilter[]`, `interface MelFilter { start: number; weights: number[] }`

- [ ] **Step 1: Write constants and types (no logic)**

`src/engine/constants.ts`:

```ts
export const SR = 16000;
export const FRAME = 512; // 32 ms
export const HOP = 320; // 20 ms
export const NFFT = 512;
export const NMEL = 40;
export const NCEP = 12; // coefficients 1..12; c0 dropped so loudness does not matter
export const FPS = SR / HOP; // 50 frames per second
export const MEL_LO_HZ = 60;
export const MEL_HI_HZ = 7600;
export const PRE_EMPHASIS = 0.97;
export const VOICED_DB = 8; // a frame is voiced when its energy is more than 8 dB above the noise floor
```

`src/engine/types.ts`:

```ts
/** One 20 ms analysis frame: 12 cepstral coefficients and frame energy in dB. */
export interface Frame {
  v: Float32Array;
  db: number;
}

/** A recorded sample turned into a template: trimmed, mean-normalised frames. */
export interface Take {
  frames: Float32Array[];
  mean: Float32Array;
  dur: number; // seconds
  start: number; // first kept frame index in the source frames
  end: number; // last kept frame index in the source frames (inclusive)
}

export interface MatchResult {
  score: number;
  ts: number; // start frame of the match in the live stream
  te: number; // end frame of the match in the live stream
}

export interface Calibration {
  base: number;
  mean: number;
  sd: number;
  max: number;
  perAvg: number[];
}
```

- [ ] **Step 2: Write the failing tests**

`tests/unit/engine/dsp.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { FRAME, MEL_HI_HZ, MEL_LO_HZ, NCEP, NFFT, NMEL, SR } from '../../../src/engine/constants';
import { computeFrame, melEdgeBins, melFilters, powerSpectrum } from '../../../src/engine/dsp';

const sine = (hz: number, amp = 0.5, n = FRAME) =>
  Float32Array.from({ length: n }, (_, i) => amp * Math.sin((2 * Math.PI * hz * i) / SR));

describe('powerSpectrum', () => {
  it('a 1 kHz sine peaks at bin 32', () => {
    const p = powerSpectrum(sine(1000));
    let best = 0;
    for (let k = 1; k < p.length; k++) if (p[k] > p[best]) best = k;
    expect(best).toBe(32);
    expect(p.length).toBe(NFFT / 2 + 1);
  });
});

describe('mel filterbank', () => {
  it('has 40 filters whose edges span 60 to 7,600 Hz', () => {
    expect(melFilters).toHaveLength(NMEL);
    expect(melEdgeBins).toHaveLength(NMEL + 2);
    expect(melEdgeBins[0]).toBe(Math.floor(((NFFT + 1) * MEL_LO_HZ) / SR));
    expect(melEdgeBins[NMEL + 1]).toBe(Math.floor(((NFFT + 1) * MEL_HI_HZ) / SR));
  });

  it('weights are in [0, 1] and overlapping filters sum to 1 between the first and last centre', () => {
    const sum = new Float64Array(NFFT / 2 + 1);
    for (const f of melFilters) {
      f.weights.forEach((w, j) => {
        expect(w).toBeGreaterThanOrEqual(0);
        expect(w).toBeLessThanOrEqual(1);
        sum[f.start + j] += w;
      });
    }
    for (let k = melEdgeBins[1]; k <= melEdgeBins[NMEL]; k++) expect(sum[k]).toBeCloseTo(1, 9);
  });
});

describe('computeFrame', () => {
  it('MFCC of silence is finite', () => {
    const f = computeFrame(new Float32Array(FRAME));
    expect(f.v).toHaveLength(NCEP);
    expect(Array.from(f.v).every(Number.isFinite)).toBe(true);
    expect(Number.isFinite(f.db)).toBe(true);
  });

  it('reports frame energy in dB', () => {
    // mean square of a sine with amplitude 0.5 is 0.125 → −9.03 dB
    expect(computeFrame(sine(1000, 0.5)).db).toBeCloseTo(-9.03, 1);
  });

  it('cepstral coefficients ignore loudness because c0 is dropped', () => {
    const loud = computeFrame(sine(440, 0.5));
    const soft = computeFrame(sine(440, 0.05));
    for (let k = 0; k < NCEP; k++) expect(soft.v[k]).toBeCloseTo(loud.v[k], 3);
  });
});
```

- [ ] **Step 3: Run to see them fail**

Run: `npx vitest run tests/unit/engine/dsp.test.ts`
Expected: FAIL — cannot resolve `src/engine/dsp`.

- [ ] **Step 4: Implement `src/engine/dsp.ts` (port of v1 `DSP`)**

```ts
import { FRAME, MEL_HI_HZ, MEL_LO_HZ, NCEP, NFFT, NMEL, PRE_EMPHASIS, SR } from './constants';
import type { Frame } from './types';

const HALF = NFFT / 2;

const cosT = new Float64Array(HALF);
const sinT = new Float64Array(HALF);
for (let k = 0; k < HALF; k++) {
  cosT[k] = Math.cos((2 * Math.PI * k) / NFFT);
  sinT[k] = Math.sin((2 * Math.PI * k) / NFFT);
}

const BITS = Math.log2(NFFT);
const rev = new Uint16Array(NFFT);
for (let i = 0; i < NFFT; i++) {
  let r = 0;
  for (let b = 0; b < BITS; b++) r |= ((i >> b) & 1) << (BITS - 1 - b);
  rev[i] = r;
}

const hamming = new Float64Array(FRAME);
for (let i = 0; i < FRAME; i++) hamming[i] = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (FRAME - 1));

const hzToMel = (f: number) => 2595 * Math.log10(1 + f / 700);
const melToHz = (m: number) => 700 * (Math.pow(10, m / 2595) - 1);

export interface MelFilter {
  start: number; // first FFT bin
  weights: number[]; // triangular weights for bins start, start + 1, …
}

/** FFT bin of each of the NMEL + 2 mel edge points. */
export const melEdgeBins: number[] = (() => {
  const lo = hzToMel(MEL_LO_HZ);
  const hi = hzToMel(MEL_HI_HZ);
  const pts: number[] = [];
  for (let i = 0; i < NMEL + 2; i++) pts.push(Math.floor(((NFFT + 1) * melToHz(lo + ((hi - lo) * i) / (NMEL + 1))) / SR));
  return pts;
})();

export const melFilters: MelFilter[] = (() => {
  const filters: MelFilter[] = [];
  for (let m = 1; m <= NMEL; m++) {
    const a = melEdgeBins[m - 1];
    const b = melEdgeBins[m];
    const c = melEdgeBins[m + 1];
    const weights: number[] = [];
    for (let k = a; k <= c; k++) {
      const v = k < b ? (k - a) / Math.max(1, b - a) : (c - k) / Math.max(1, c - b);
      weights.push(Math.max(0, v));
    }
    filters.push({ start: a, weights });
  }
  return filters;
})();

const dct: Float64Array[] = [];
for (let k = 1; k <= NCEP; k++) {
  const row = new Float64Array(NMEL);
  for (let n = 0; n < NMEL; n++) row[n] = Math.cos((Math.PI * k * (n + 0.5)) / NMEL);
  dct.push(row);
}

const re = new Float64Array(NFFT);
const im = new Float64Array(NFFT);
const logm = new Float64Array(NMEL);

/** In-place radix-2 FFT of re/im; the caller has already written the input in bit-reversed order. */
function fftInPlace(): void {
  for (let size = 2; size <= NFFT; size <<= 1) {
    const h = size >> 1;
    const step = NFFT / size;
    for (let i = 0; i < NFFT; i += size) {
      for (let j = 0; j < h; j++) {
        const k = j * step;
        const a = i + j;
        const b = a + h;
        const tr = re[b] * cosT[k] + im[b] * sinT[k];
        const ti = -re[b] * sinT[k] + im[b] * cosT[k];
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
      }
    }
  }
}

/** |X(k)|² for k = 0..NFFT/2 of a raw NFFT-sample block (no window, no pre-emphasis). */
export function powerSpectrum(x: ArrayLike<number>): Float64Array {
  im.fill(0);
  for (let i = 0; i < NFFT; i++) re[rev[i]] = x[i];
  fftInPlace();
  const out = new Float64Array(HALF + 1);
  for (let k = 0; k <= HALF; k++) out[k] = re[k] * re[k] + im[k] * im[k];
  return out;
}

/** MFCC (c1..c12) and energy in dB of one FRAME-sample block at 16 kHz. */
export function computeFrame(x: ArrayLike<number>): Frame {
  let e = 0;
  for (let i = 0; i < FRAME; i++) e += x[i] * x[i];
  const db = 10 * Math.log10(e / FRAME + 1e-12);
  im.fill(0);
  let prev = x[0];
  for (let i = 0; i < FRAME; i++) {
    const s = x[i] - PRE_EMPHASIS * prev;
    prev = x[i];
    re[rev[i]] = s * hamming[i];
  }
  fftInPlace();
  for (let m = 0; m < NMEL; m++) {
    const f = melFilters[m];
    let s = 0;
    for (let j = 0; j < f.weights.length; j++) {
      const k = f.start + j;
      if (k > HALF) break;
      s += f.weights[j] * (re[k] * re[k] + im[k] * im[k]);
    }
    logm[m] = Math.log(s + 1e-10);
  }
  const v = new Float32Array(NCEP);
  for (let k = 0; k < NCEP; k++) {
    let s = 0;
    const row = dct[k];
    for (let n = 0; n < NMEL; n++) s += row[n] * logm[n];
    v[k] = s;
  }
  return { v, db };
}
```

- [ ] **Step 5: Run to see them pass**

Run: `npx vitest run tests/unit/engine/dsp.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add src/engine tests/unit/engine/dsp.test.ts
git commit -m "feat(engine): port DSP (FFT, mel filterbank, MFCC frame)"
```

### Task 3: Windowed-sinc resampler and streaming feature extraction

**Files:**
- Create: `src/engine/features.ts`
- Test: `tests/unit/engine/features.test.ts`

**Interfaces:**
- Consumes: `computeFrame` (Task 2), constants.
- Produces:
  - `class Resampler { constructor(inRate: number, outRate?: number); readonly passthrough: boolean; process(input: Float32Array): Float32Array; flush(): Float32Array }`
  - `class FeatureStream { constructor(inRate: number, onFrame: (f: Frame) => void, onPcm?: (pcm16k: Float32Array) => void); push(input: Float32Array): void; flush(): void }`
  - `extractFrames(pcm16k: Float32Array): Frame[]`

Why: v1 used box-average decimation, which aliases. The spec asks for a proper low-pass. At 16 kHz input the resampler is a pass-through, so v1 behaviour is unchanged there.

- [ ] **Step 1: Write the failing tests**

`tests/unit/engine/features.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { FRAME, HOP, SR } from '../../../src/engine/constants';
import { computeFrame } from '../../../src/engine/dsp';
import { extractFrames, FeatureStream, Resampler } from '../../../src/engine/features';

const tone = (hz: number, rate: number, seconds: number, amp = 0.5) =>
  Float32Array.from({ length: Math.round(rate * seconds) }, (_, i) => amp * Math.sin((2 * Math.PI * hz * i) / rate));
const rms = (a: Float32Array, from = 0, to = a.length) => {
  let s = 0;
  for (let i = from; i < to; i++) s += a[i] * a[i];
  return Math.sqrt(s / (to - from));
};
const resampleAll = (input: Float32Array, rate: number) => {
  const r = new Resampler(rate);
  const a = r.process(input);
  const b = r.flush();
  const out = new Float32Array(a.length + b.length);
  out.set(a);
  out.set(b, a.length);
  return out;
};

describe('Resampler', () => {
  it.each([48000, 44100, 22050])('output length = input × 16000 / %i', (rate) => {
    const out = resampleAll(tone(440, rate, 1), rate);
    expect(Math.abs(out.length - SR)).toBeLessThanOrEqual(1);
  });

  it('passes a 1 kHz tone at 48 kHz through with its level intact', () => {
    const out = resampleAll(tone(1000, 48000, 1), 48000);
    expect(rms(out, 1000, 15000) / (0.5 / Math.SQRT2)).toBeCloseTo(1, 1);
  });

  it('removes a 12 kHz tone (above the 8 kHz output Nyquist) instead of aliasing it', () => {
    const out = resampleAll(tone(12000, 48000, 1), 48000);
    expect(rms(out, 1000, 15000)).toBeLessThan(0.01 * (0.5 / Math.SQRT2));
  });

  it('gives the same output whatever the chunk sizes', () => {
    const input = tone(700, 44100, 0.5);
    const whole = resampleAll(input, 44100);
    const r = new Resampler(44100);
    const parts: number[] = [];
    let i = 0;
    const sizes = [128, 1000, 7, 4096, 333];
    for (let k = 0; i < input.length; k++) {
      const n = sizes[k % sizes.length];
      parts.push(...r.process(input.subarray(i, i + n)));
      i += n;
    }
    parts.push(...r.flush());
    expect(parts.length).toBe(whole.length);
    for (let j = 0; j < whole.length; j++) expect(parts[j]).toBeCloseTo(whole[j], 6);
  });

  it('is an exact pass-through at 16 kHz', () => {
    const input = tone(300, SR, 0.1);
    const r = new Resampler(SR);
    expect(r.passthrough).toBe(true);
    expect(Array.from(r.process(input))).toEqual(Array.from(input));
    expect(r.flush().length).toBe(0);
  });
});

describe('FeatureStream', () => {
  it('emits one frame per 20 ms hop once the first 512 samples have arrived', () => {
    const frames = extractFrames(tone(300, SR, 1));
    expect(frames.length).toBe(Math.floor((SR - FRAME) / HOP) + 1);
  });

  it('frames match computeFrame on the same 16 kHz window', () => {
    const pcm = tone(500, SR, 0.2);
    const frames = extractFrames(pcm);
    const third = computeFrame(pcm.subarray(2 * HOP, 2 * HOP + FRAME));
    expect(Array.from(frames[2].v)).toEqual(Array.from(third.v));
    expect(frames[2].db).toBe(third.db);
  });

  it('reports the 16 kHz PCM it analysed', () => {
    let total = 0;
    const fs = new FeatureStream(48000, () => {}, (pcm) => (total += pcm.length));
    fs.push(tone(300, 48000, 0.5));
    fs.flush();
    expect(Math.abs(total - SR / 2)).toBeLessThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run tests/unit/engine/features.test.ts`
Expected: FAIL — cannot resolve `src/engine/features`.

- [ ] **Step 3: Implement `src/engine/features.ts`**

```ts
import { FRAME, HOP, SR } from './constants';
import { computeFrame } from './dsp';
import type { Frame } from './types';

const KERNEL_RES = 256; // kernel table samples per input sample

/**
 * Streaming windowed-sinc (Blackman) resampler. Zero-phase: output n sits at input position n × ratio.
 * Cutoff is 92% of the lower Nyquist, so content above 8 kHz is removed before decimating to 16 kHz.
 */
export class Resampler {
  readonly passthrough: boolean;
  private readonly ratio: number;
  private readonly half: number;
  private readonly table: Float64Array;
  private buf = new Float32Array(0);
  private bufStart = 0; // absolute input index of buf[0]
  private totalIn = 0;
  private n = 0; // next output index

  constructor(inRate: number, outRate: number = SR) {
    this.ratio = inRate / outRate;
    this.passthrough = this.ratio === 1;
    const cutoff = 0.5 * Math.min(1, 1 / this.ratio) * 0.92; // cycles per input sample
    this.half = Math.ceil(12 / (2 * cutoff));
    this.table = new Float64Array(this.half * KERNEL_RES + 2);
    for (let i = 0; i < this.table.length; i++) {
      const t = i / KERNEL_RES;
      if (t >= this.half) continue;
      const x = 2 * cutoff * t;
      const sinc = x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x);
      const w = 0.42 + 0.5 * Math.cos((Math.PI * t) / this.half) + 0.08 * Math.cos((2 * Math.PI * t) / this.half);
      this.table[i] = 2 * cutoff * sinc * w;
    }
  }

  process(input: Float32Array): Float32Array {
    if (this.passthrough) return input.slice();
    const merged = new Float32Array(this.buf.length + input.length);
    merged.set(this.buf);
    merged.set(input, this.buf.length);
    this.buf = merged;
    this.totalIn += input.length;
    return this.drain(false);
  }

  /** Emits the remaining outputs, treating input after the end as silence. */
  flush(): Float32Array {
    return this.passthrough ? new Float32Array(0) : this.drain(true);
  }

  private kernel(t: number): number {
    const a = Math.abs(t) * KERNEL_RES;
    const i = Math.floor(a);
    if (i + 1 >= this.table.length) return 0;
    const f = a - i;
    return this.table[i] * (1 - f) + this.table[i + 1] * f;
  }

  private drain(final: boolean): Float32Array {
    const out: number[] = [];
    const end = this.bufStart + this.buf.length;
    for (;;) {
      const p = this.n * this.ratio;
      const c = Math.floor(p);
      if (final ? p >= this.totalIn : c + this.half >= end) break;
      let s = 0;
      for (let k = c - this.half + 1; k <= c + this.half; k++) {
        const idx = k - this.bufStart;
        if (idx >= 0 && idx < this.buf.length) s += this.buf[idx] * this.kernel(p - k);
      }
      out.push(s);
      this.n++;
    }
    const drop = Math.floor(this.n * this.ratio) - this.half - this.bufStart;
    if (drop > 0) {
      this.buf = this.buf.slice(drop);
      this.bufStart += drop;
    }
    return Float32Array.from(out);
  }
}

/** Resamples any input rate to 16 kHz and emits one feature frame every 20 ms. */
export class FeatureStream {
  private readonly resampler: Resampler;
  private readonly buf = new Float32Array(FRAME);
  private n = 0;

  constructor(
    inRate: number,
    private readonly onFrame: (f: Frame) => void,
    private readonly onPcm?: (pcm16k: Float32Array) => void,
  ) {
    this.resampler = new Resampler(inRate);
  }

  push(input: Float32Array): void {
    this.consume(this.resampler.process(input));
  }

  flush(): void {
    this.consume(this.resampler.flush());
  }

  private consume(pcm: Float32Array): void {
    if (pcm.length === 0) return;
    this.onPcm?.(pcm);
    for (let i = 0; i < pcm.length; i++) {
      this.buf[this.n++] = pcm[i];
      if (this.n === FRAME) {
        this.onFrame(computeFrame(this.buf));
        this.buf.copyWithin(0, HOP, FRAME);
        this.n = FRAME - HOP;
      }
    }
  }
}

export function extractFrames(pcm16k: Float32Array): Frame[] {
  const out: Frame[] = [];
  new FeatureStream(SR, (f) => out.push(f)).push(pcm16k);
  return out;
}
```

- [ ] **Step 4: Run to see them pass**

Run: `npx vitest run tests/unit/engine/features.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add src/engine/features.ts tests/unit/engine/features.test.ts
git commit -m "feat(engine): windowed-sinc resampler and streaming feature extraction"
```

### Task 4: Vector helpers and streaming subsequence DTW matcher

**Files:**
- Create: `src/engine/vec.ts`, `src/engine/matcher.ts`
- Test: `tests/unit/engine/matcher.test.ts`

**Interfaces:**
- Consumes: `MatchResult` (Task 2).
- Produces: `vsub(v: Float32Array, m: Float32Array): Float32Array`, `unit(v: Float32Array): Float32Array`, `HOLD_PENALTY = 0.03`, `class Matcher { readonly M: number; cand: MatchResult | null; constructor(template: Float32Array[]); reset(): void; step(x: Float32Array, t: number): MatchResult | null; dropUpTo(f: number): void }` — template frames and `x` must be unit vectors.

- [ ] **Step 1: Write the failing tests**

`tests/unit/engine/matcher.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { Matcher } from '../../../src/engine/matcher';
import { unit, vsub } from '../../../src/engine/vec';

const M = 100;
// A template that sweeps 180° through a plane: every frame is distinct and order matters.
const sweep = (n: number) =>
  Array.from({ length: n }, (_, i) => {
    const th = (Math.PI * i) / (n - 1);
    const v = new Float32Array(12);
    v[0] = Math.cos(th);
    v[1] = Math.sin(th);
    v[2] = 0.2;
    return unit(v);
  });
const away = (n: number) =>
  Array.from({ length: n }, () => {
    const v = new Float32Array(12);
    v[5] = 1;
    return v;
  });
const tpl = sweep(M);
const atSpeed = (f: number) => {
  const N = Math.round(M * f);
  return Array.from({ length: N }, (_, j) => tpl[Math.floor((j * M) / N)]);
};
const pad = (s: Float32Array[]) => [...away(30), ...s, ...away(30)];
function run(stream: Float32Array[]) {
  const m = new Matcher(tpl);
  let best = Infinity;
  const results = [];
  for (let t = 0; t < stream.length; t++) {
    const r = m.step(stream[t], t);
    if (r) {
      results.push(r);
      best = Math.min(best, r.score);
    }
  }
  return { best, results };
}

describe('vec', () => {
  it('unit() normalises and leaves zero vectors at zero', () => {
    const u = unit(Float32Array.from([3, 4]));
    expect(u[0]).toBeCloseTo(0.6);
    expect(u[1]).toBeCloseTo(0.8);
    expect(Array.from(unit(new Float32Array(3)))).toEqual([0, 0, 0]);
  });
  it('vsub() subtracts element-wise', () => {
    expect(Array.from(vsub(Float32Array.from([3, 4]), Float32Array.from([1, 1])))).toEqual([2, 3]);
  });
});

describe('Matcher', () => {
  it('an identical sequence scores ≈ 0', () => {
    expect(run(pad(tpl)).best).toBeLessThan(1e-4);
  });

  it.each([0.6, 1.6])('the sequence at %s× speed still matches', (speed) => {
    expect(run(pad(atSpeed(speed))).best).toBeLessThan(0.05);
  });

  it('the reversed sequence does not match', () => {
    expect(run(pad([...tpl].reverse())).best).toBeGreaterThan(0.32);
  });

  it('enforces 0.5M ≤ N ≤ 2M on every reported match', () => {
    for (const speed of [0.3, 0.4, 0.6, 1, 1.6, 2.5, 3]) {
      for (const r of run(pad(atSpeed(speed))).results) {
        const N = r.te - r.ts + 1;
        expect(N).toBeGreaterThanOrEqual(0.5 * M);
        expect(N).toBeLessThanOrEqual(2 * M);
      }
    }
  });

  it('too fast (0.4×) scores far worse than 0.6×', () => {
    expect(run(pad(atSpeed(0.4))).best).toBeGreaterThan(0.1);
  });

  it('dropUpTo() kills paths that started at or before the given frame', () => {
    const m = new Matcher(tpl);
    const stream = pad(tpl);
    for (let t = 0; t < 30 + M - 1; t++) m.step(stream[t], t);
    m.dropUpTo(30 + M);
    expect(m.step(stream[30 + M - 1], 30 + M - 1)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run tests/unit/engine/matcher.test.ts`
Expected: FAIL — cannot resolve `src/engine/matcher`.

- [ ] **Step 3: Implement**

`src/engine/vec.ts`:

```ts
export function vsub(v: Float32Array, m: Float32Array): Float32Array {
  const o = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) o[i] = v[i] - m[i];
  return o;
}

export function unit(v: Float32Array): Float32Array {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  s = Math.sqrt(s) || 1;
  const o = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) o[i] = v[i] / s;
  return o;
}
```

`src/engine/matcher.ts` (port of v1 `Matcher`):

```ts
import type { MatchResult } from './types';

export const HOLD_PENALTY = 0.03;

/**
 * Streaming subsequence DTW: finds the template anywhere inside a continuous stream (open start, open end).
 * Steps: advance (2c), hold (c + p), skip one template frame (3c + p). Score = D / (N + M), 0.5M ≤ N ≤ 2M.
 */
export class Matcher {
  readonly M: number;
  cand: MatchResult | null = null;
  private readonly T: Float32Array[];
  private D: Float64Array;
  private S: Int32Array;
  private nD: Float64Array;
  private nS: Int32Array;

  constructor(template: Float32Array[]) {
    this.T = template;
    const M = (this.M = template.length);
    this.D = new Float64Array(M).fill(Infinity);
    this.S = new Int32Array(M).fill(-1);
    this.nD = new Float64Array(M);
    this.nS = new Int32Array(M);
  }

  reset(): void {
    this.D.fill(Infinity);
    this.cand = null;
  }

  step(x: Float32Array, t: number): MatchResult | null {
    const T = this.T;
    const M = this.M;
    const D = this.D;
    const S = this.S;
    const nD = this.nD;
    const nS = this.nS;
    for (let i = 0; i < M; i++) {
      const ti = T[i];
      let d = 0;
      for (let k = 0; k < x.length; k++) d += ti[k] * x[k];
      const c = d >= 1 ? 0 : 1 - d;
      let best: number;
      let bs: number;
      if (i === 0) {
        best = 2 * c;
        bs = t;
        const h = D[0] + c + HOLD_PENALTY;
        if (h < best) {
          best = h;
          bs = S[0];
        }
      } else {
        best = D[i - 1] + 2 * c;
        bs = S[i - 1];
        const h = D[i] + c + HOLD_PENALTY;
        if (h < best) {
          best = h;
          bs = S[i];
        }
        if (i >= 2) {
          const s2 = D[i - 2] + 3 * c + HOLD_PENALTY;
          if (s2 < best) {
            best = s2;
            bs = S[i - 2];
          }
        }
      }
      nD[i] = best;
      nS[i] = bs;
    }
    this.D = nD;
    this.nD = D;
    this.S = nS;
    this.nS = S;
    const e = this.D[M - 1];
    if (!Number.isFinite(e)) return null;
    const ts = this.S[M - 1];
    const N = t - ts + 1;
    if (N < 0.5 * M || N > 2 * M) return null;
    return { score: e / (N + M), ts, te: t };
  }

  dropUpTo(f: number): void {
    for (let i = 0; i < this.M; i++) if (this.S[i] <= f) this.D[i] = Infinity;
  }
}
```

- [ ] **Step 4: Run to see them pass**

Run: `npx vitest run tests/unit/engine/matcher.test.ts`
Expected: PASS. If the `dropUpTo` test fails, check the test's arithmetic before the code: after dropping all paths, the next step can only start a fresh path at template frame 0, which cannot reach the end in one step.

- [ ] **Step 5: Commit**

```bash
git add src/engine/vec.ts src/engine/matcher.ts tests/unit/engine/matcher.test.ts
git commit -m "feat(engine): port streaming subsequence DTW matcher"
```

### Task 5: Synthetic voice helper, take processing and calibration

**Files:**
- Create: `tests/helpers/synth.ts`, `src/engine/takes.ts`, `src/engine/calibrate.ts`
- Test: `tests/unit/engine/takes.test.ts`, `tests/unit/engine/calibrate.test.ts`

**Interfaces:**
- Consumes: `FeatureStream`, `extractFrames` (Task 3), `Matcher`, `unit`, `vsub` (Task 4).
- Produces:
  - `tests/helpers/synth.ts`: `type Seg`, `MANTRA`, `OTHER`, `interface Voice { tempo?: number; f0?: number; shift?: number; amp?: number }`, `class Synth { constructor(seed: number); rnd(): number; chant(spec: readonly Seg[], voice?: Voice): number[]; silence(sec: number): number[]; addNoise(a: number[], amp?: number): number[]; vary(): Required<Voice> }`, `append(dst: number[], src: number[]): number[]`, `framesOf(pcm: ArrayLike<number>): Frame[]`, `floorOf(frames: Frame[]): number`
  - `takes.ts`: `MIN_TAKE_SPAN = 40`, `processTake(frames: Frame[], floor: number): Take | null`
  - `calibrate.ts`: `THRESHOLD_MIN = 0.26`, `THRESHOLD_MAX = 0.32`, `STRICTNESS_STEPS = [0.85, 0.9, 0.95, 1.0, 1.05, 1.1] as const`, `DEFAULT_STRICTNESS = 1.0`, `OUTLIER_RATIO = 1.5`, `bestScore(tpl: Float32Array[], frames: Float32Array[]): number`, `calibrate(takes: Take[]): Calibration | null`, `flagOutliers(perAvg: number[]): boolean[]`, `liveThreshold(cal: Calibration, strictness: number): number`

- [ ] **Step 1: Write the synth helper (test infrastructure, port of Appendix D)**

The random-number call order must match v1 exactly so the harness in Task 7 reproduces v1 results. Do not reorder calls.

`tests/helpers/synth.ts`:

```ts
import { SR } from '../../src/engine/constants';
import { FeatureStream } from '../../src/engine/features';
import type { Frame } from '../../src/engine/types';

/** [duration s, formant 1 Hz, formant 2 Hz, voiced 1 / 0] */
export type Seg = readonly [number, number, number, 0 | 1];

export const MANTRA: readonly Seg[] = [
  [0.55, 600, 1000, 1], [0.22, 300, 900, 1], [0.35, 700, 1800, 1], [0.07, 0, 0, 0], [0.4, 300, 2300, 1],
  [0.06, 0, 0, 0], [0.3, 280, 2400, 1], [0.4, 700, 1200, 1], [0.3, 400, 800, 1], [0.35, 650, 1700, 1],
  [0.07, 0, 0, 0], [0.35, 320, 2200, 1], [0.3, 500, 1000, 1],
];

export const OTHER: readonly Seg[] = [
  [0.4, 350, 2100, 1], [0.3, 650, 1100, 1], [0.07, 0, 0, 0], [0.5, 450, 900, 1], [0.35, 300, 2400, 1],
  [0.4, 700, 1300, 1], [0.3, 380, 1900, 1], [0.45, 560, 850, 1], [0.3, 300, 2300, 1],
];

export interface Voice {
  tempo?: number;
  f0?: number;
  shift?: number;
  amp?: number;
}

/** Formant-synthesised chanting with a seeded Park–Miller RNG (identical sequence to v1 test.js). */
export class Synth {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed;
  }

  rnd(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }

  chant(spec: readonly Seg[], { tempo = 1, f0 = 140, shift = 1, amp = 0.3 }: Voice = {}): number[] {
    const out: number[] = [];
    const ph: number[] = [];
    for (let h = 0; h < 90; h++) ph.push(this.rnd() * 6.28);
    for (const [d, f1, f2, v] of spec) {
      const n = Math.round(d * tempo * (0.9 + 0.2 * this.rnd()) * SR);
      const F1 = f1 * shift;
      const F2 = f2 * shift;
      for (let i = 0; i < n; i++) {
        let s = 0;
        const t = out.length / SR;
        if (v) {
          const f = f0 * (1 + 0.02 * Math.sin(2 * Math.PI * 5 * t));
          for (let h = 1; h * f < 7500; h++) {
            const fh = h * f;
            const g = 1 / (1 + ((fh - F1) / 90) ** 2) + 0.7 / (1 + ((fh - F2) / 130) ** 2) + 0.02;
            s += g * Math.sin(2 * Math.PI * fh * t + ph[h]);
          }
          s *= 0.25;
        } else {
          s = (this.rnd() * 2 - 1) * 0.4;
        }
        const env = Math.min(1, i / 160, (n - i) / 160);
        out.push(s * amp * (0.6 + 0.4 * env));
      }
    }
    return out;
  }

  silence(sec: number): number[] {
    return new Array<number>(Math.round(sec * SR)).fill(0);
  }

  addNoise(a: number[], amp = 0.002): number[] {
    return a.map((x) => x + (this.rnd() * 2 - 1) * amp);
  }

  vary(): Required<Voice> {
    return { tempo: 0.85 + 0.3 * this.rnd(), f0: 125 + 30 * this.rnd(), shift: 0.96 + 0.08 * this.rnd(), amp: 0.15 + 0.3 * this.rnd() };
  }
}

/** Appends src to dst in place (avoids spread-argument limits on long arrays). */
export function append(dst: number[], src: number[]): number[] {
  for (let i = 0; i < src.length; i++) dst.push(src[i]);
  return dst;
}

export function framesOf(pcm: ArrayLike<number>): Frame[] {
  const out: Frame[] = [];
  new FeatureStream(SR, (f) => out.push(f)).push(Float32Array.from(pcm));
  return out;
}

/** Median frame energy, as v1 measured the noise floor. */
export function floorOf(frames: Frame[]): number {
  const s = frames.map((f) => f.db).sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}
```

- [ ] **Step 2: Write the failing tests**

`tests/unit/engine/takes.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { FPS, NCEP } from '../../../src/engine/constants';
import { processTake } from '../../../src/engine/takes';
import type { Frame } from '../../../src/engine/types';

const frame = (db: number, fill = 1): Frame => ({ v: new Float32Array(NCEP).fill(fill), db });
const floor = -60;

describe('processTake', () => {
  it('trims to the voiced span plus one frame either side', () => {
    const frames = [...Array(10)].map(() => frame(-60)).concat([...Array(50)].map((_, i) => frame(-20, i)), [...Array(10)].map(() => frame(-60)));
    const take = processTake(frames, floor)!;
    expect(take.start).toBe(9);
    expect(take.end).toBe(60);
    expect(take.frames).toHaveLength(52);
    expect(take.dur).toBeCloseTo(52 / FPS);
  });

  it('subtracts the mean of the voiced frames only', () => {
    const frames = [frame(-60, 100), ...[...Array(45)].map(() => frame(-20, 2)), frame(-60, 100)];
    const take = processTake(frames, floor)!;
    expect(take.mean[0]).toBeCloseTo(2);
    expect(take.frames[1][0]).toBeCloseTo(0);
    expect(take.frames[0][0]).toBeCloseTo(98);
  });

  it('rejects takes with no voice or a voiced span shorter than 40 frames', () => {
    expect(processTake([...Array(100)].map(() => frame(-60)), floor)).toBeNull();
    expect(processTake([...Array(39)].map(() => frame(-20)), floor)).toBeNull();
  });

  it('treats 8 dB above the floor as the voicing line', () => {
    expect(processTake([...Array(50)].map(() => frame(-52)), floor)).toBeNull();
    expect(processTake([...Array(50)].map(() => frame(-51.9)), floor)).not.toBeNull();
  });
});
```

`tests/unit/engine/calibrate.test.ts`:

```ts
import { beforeAll, describe, expect, it } from 'vitest';
import { calibrate, flagOutliers, liveThreshold, STRICTNESS_STEPS, THRESHOLD_MAX, THRESHOLD_MIN } from '../../../src/engine/calibrate';
import { processTake } from '../../../src/engine/takes';
import type { Take } from '../../../src/engine/types';
import { append, floorOf, framesOf, MANTRA, OTHER, Synth } from '../../helpers/synth';

let takes: Take[];
let other: Take;

beforeAll(() => {
  const s = new Synth(7);
  const floor = floorOf(framesOf(s.addNoise(s.silence(1))));
  const record = (spec = MANTRA) => {
    const pcm: number[] = [];
    append(pcm, s.silence(0.6));
    append(pcm, s.chant(spec, s.vary()));
    append(pcm, s.silence(0.8));
    return processTake(framesOf(s.addNoise(pcm)), floor)!;
  };
  takes = [record(), record(), record(), record()];
  other = record(OTHER);
});

describe('calibrate', () => {
  it('needs at least two takes', () => {
    expect(calibrate([])).toBeNull();
    expect(calibrate(takes.slice(0, 1))).toBeNull();
  });

  it('clamps the base threshold into [0.26, 0.32]', () => {
    const cal = calibrate(takes)!;
    expect(cal.base).toBeGreaterThanOrEqual(THRESHOLD_MIN);
    expect(cal.base).toBeLessThanOrEqual(THRESHOLD_MAX);
    expect(cal.base).toBeCloseTo(Math.min(THRESHOLD_MAX, Math.max(THRESHOLD_MIN, 1.3 * cal.max, 2.2 * cal.mean)), 12);
  });

  it('gives one average pairwise score per take', () => {
    const cal = calibrate(takes)!;
    expect(cal.perAvg).toHaveLength(takes.length);
    expect(cal.perAvg.every((x) => Number.isFinite(x) && x > 0)).toBe(true);
  });

  it('a different phrase scores worse than the mantra takes against each other', () => {
    const cal = calibrate([...takes, other])!;
    const odd = cal.perAvg[cal.perAvg.length - 1];
    expect(odd).toBeGreaterThan(Math.max(...cal.perAvg.slice(0, -1)));
    expect(flagOutliers(cal.perAvg)[takes.length]).toBe(true);
  });
});

describe('flagOutliers', () => {
  it('flags takes whose average is more than 1.5× the median', () => {
    expect(flagOutliers([0.1, 0.11, 0.12, 0.2])).toEqual([false, false, false, true]);
  });
  it('flags nothing with fewer than 3 takes', () => {
    expect(flagOutliers([0.1, 0.5])).toEqual([false, false]);
  });
});

describe('liveThreshold', () => {
  it('multiplies the base by the strictness step', () => {
    expect(STRICTNESS_STEPS).toEqual([0.85, 0.9, 0.95, 1.0, 1.05, 1.1]);
    expect(liveThreshold({ base: 0.3, mean: 0, sd: 0, max: 0, perAvg: [] }, 0.9)).toBeCloseTo(0.27);
  });
});
```

- [ ] **Step 3: Run to see them fail**

Run: `npx vitest run tests/unit/engine/takes.test.ts tests/unit/engine/calibrate.test.ts`
Expected: FAIL — cannot resolve `src/engine/takes` / `src/engine/calibrate`.

- [ ] **Step 4: Implement**

`src/engine/takes.ts`:

```ts
import { FPS, NCEP, VOICED_DB } from './constants';
import type { Frame, Take } from './types';
import { vsub } from './vec';

export const MIN_TAKE_SPAN = 40; // frames between first and last voiced frame (0.8 s)

/** Turns one recorded sample into a trimmed, mean-normalised template. */
export function processTake(frames: Frame[], floor: number): Take | null {
  const thr = floor + VOICED_DB;
  let a = -1;
  let b = -1;
  for (let i = 0; i < frames.length; i++) {
    if (frames[i].db > thr) {
      if (a < 0) a = i;
      b = i;
    }
  }
  if (a < 0 || b - a < MIN_TAKE_SPAN) return null;
  a = Math.max(0, a - 1);
  b = Math.min(frames.length - 1, b + 1);
  const seg = frames.slice(a, b + 1);
  const mean = new Float32Array(NCEP);
  let n = 0;
  for (const f of seg) {
    if (f.db > thr) {
      for (let k = 0; k < NCEP; k++) mean[k] += f.v[k];
      n++;
    }
  }
  for (let k = 0; k < NCEP; k++) mean[k] /= n;
  return { frames: seg.map((f) => vsub(f.v, mean)), mean, dur: seg.length / FPS, start: a, end: b };
}
```

`src/engine/calibrate.ts`:

```ts
import { Matcher } from './matcher';
import type { Calibration, Take } from './types';
import { unit } from './vec';

export const THRESHOLD_MIN = 0.26;
export const THRESHOLD_MAX = 0.32;
export const STRICTNESS_STEPS = [0.85, 0.9, 0.95, 1.0, 1.05, 1.1] as const;
export const DEFAULT_STRICTNESS = 1.0;
export const OUTLIER_RATIO = 1.5;

export function bestScore(tpl: Float32Array[], frames: Float32Array[]): number {
  const m = new Matcher(tpl);
  let best = Infinity;
  for (let t = 0; t < frames.length; t++) {
    const r = m.step(frames[t], t);
    if (r && r.score < best) best = r.score;
  }
  return best;
}

/** Scores every sample against every other to set the match limit. */
export function calibrate(takes: Take[]): Calibration | null {
  const n = takes.length;
  if (n < 2) return null;
  const U = takes.map((tk) => tk.frames.map(unit));
  const per: number[][] = U.map(() => []);
  const all: number[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const s = bestScore(U[i], U[j]);
      if (Number.isFinite(s)) {
        all.push(s);
        per[i].push(s);
        per[j].push(s);
      }
    }
  }
  if (!all.length) return null;
  const mean = all.reduce((a, b) => a + b, 0) / all.length;
  const sd = Math.sqrt(all.reduce((acc, b) => acc + (b - mean) ** 2, 0) / all.length);
  const max = Math.max(...all);
  const perAvg = per.map((p) => (p.length ? p.reduce((a, b) => a + b, 0) / p.length : Infinity));
  return { base: Math.min(THRESHOLD_MAX, Math.max(THRESHOLD_MIN, max * 1.3, mean * 2.2)), mean, sd, max, perAvg };
}

/** F6: a sample "sounds different" when its average pairwise score is over 1.5× the median. */
export function flagOutliers(perAvg: number[]): boolean[] {
  if (perAvg.length < 3) return perAvg.map(() => false);
  const sorted = [...perAvg].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  return perAvg.map((x) => x > OUTLIER_RATIO * median);
}

export function liveThreshold(cal: Calibration, strictness: number): number {
  return cal.base * strictness;
}
```

- [ ] **Step 5: Run to see them pass**

Run: `npx vitest run tests/unit/engine`
Expected: PASS (all engine tests).

- [ ] **Step 6: Commit**

```bash
git add tests/helpers/synth.ts src/engine/takes.ts src/engine/calibrate.ts tests/unit/engine/takes.test.ts tests/unit/engine/calibrate.test.ts
git commit -m "feat(engine): port take processing and calibration; add synthetic voice helper"
```

### Task 6: Noise floor helpers and live Counter

**Files:**
- Create: `src/engine/floor.ts`, `src/engine/counter.ts`
- Test: `tests/unit/engine/floor.test.ts`, `tests/unit/engine/counter.test.ts`

**Interfaces:**
- Consumes: `Matcher` (Task 4), `unit`, `vsub`, `processTake`, `calibrate`, synth helper (Task 5).
- Produces:
  - `floor.ts`: `median(a: number[]): number`, `SESSION_QUIET_FRAMES = 75`, `FLOOR_CAP_DB = 10`, `sessionFloor(quietDbs: number[], sampleFloor: number): number`
  - `counter.ts`: `interface CounterOptions { thr: number; floor: number; onCount: (m: MatchResult) => void; onScore?: (best: number, thr: number, voiced: boolean) => void }`, `class Counter { constructor(takes: Take[], opts: CounterOptions); readonly floor: number (getter); readonly frameIndex: number (getter, index of the last fed frame); reset(): void; feed(fr: Frame): void }`

- [ ] **Step 1: Write the failing tests**

`tests/unit/engine/floor.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { median, sessionFloor } from '../../../src/engine/floor';

describe('median', () => {
  it('takes the upper middle element like v1', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(3);
  });
});

describe('sessionFloor', () => {
  it('is the median of the quiet frames', () => {
    expect(sessionFloor([-62, -60, -61], -60)).toBe(-61);
  });
  it('is capped at the sample floor + 10 dB', () => {
    expect(sessionFloor([-30, -30, -30], -60)).toBe(-50);
  });
});
```

`tests/unit/engine/counter.test.ts`:

```ts
import { beforeAll, describe, expect, it } from 'vitest';
import { calibrate } from '../../../src/engine/calibrate';
import { Counter } from '../../../src/engine/counter';
import { processTake } from '../../../src/engine/takes';
import type { Calibration, Frame, Take } from '../../../src/engine/types';
import { append, floorOf, framesOf, MANTRA, OTHER, Synth } from '../../helpers/synth';

let takes: Take[];
let floor: number;
let cal: Calibration;

beforeAll(() => {
  const s = new Synth(7);
  floor = floorOf(framesOf(s.addNoise(s.silence(1))));
  takes = [];
  for (let i = 0; i < 6; i++) {
    const pcm: number[] = [];
    append(pcm, s.silence(0.6));
    append(pcm, s.chant(MANTRA, s.vary()));
    append(pcm, s.silence(0.8));
    takes.push(processTake(framesOf(s.addNoise(pcm)), floor)!);
  }
  cal = calibrate(takes)!;
});

function count(build: (s: Synth) => number[], seed: number, mutate?: (frames: Frame[]) => Frame[]) {
  const s = new Synth(seed);
  let frames = framesOf(s.addNoise(build(s)));
  if (mutate) frames = mutate(frames);
  const hits: number[] = [];
  const c = new Counter(takes, { thr: cal.base, floor, onCount: (m) => hits.push(m.te) });
  for (const f of frames) c.feed(f);
  return hits.length;
}

describe('Counter', () => {
  it('two back-to-back chants give 2 counts', () => {
    expect(count((s) => append(append(append(append(s.silence(1), s.chant(MANTRA, s.vary())), s.chant(MANTRA, s.vary())), s.silence(1)), []), 101)).toBe(2);
  });

  it('one chant matched by all six templates gives exactly 1 count (overlap rule)', () => {
    expect(count((s) => append(append(s.silence(1), s.chant(MANTRA, s.vary())), s.silence(1)), 102)).toBe(1);
  });

  it('ignores NaN frames', () => {
    const withNaN = (frames: Frame[]) => frames.flatMap((f, i) => (i % 37 === 0 ? [{ v: f.v, db: NaN }, f] : [f]));
    expect(count((s) => append(append(append(s.silence(1), s.chant(MANTRA, s.vary())), s.chant(MANTRA, s.vary())), s.silence(1)), 103, withNaN)).toBe(2);
  });

  it('rejects a match that spans 3 s of silence (voiced ratio < 60%)', () => {
    expect(
      count((s) => {
        const m = s.chant(MANTRA, s.vary());
        const h = Math.floor(m.length / 2);
        return append(append(append(append(s.silence(1), m.slice(0, h)), s.silence(3)), m.slice(h)), s.silence(1));
      }, 104),
    ).toBe(0);
  });

  it('does not count a different phrase', () => {
    expect(count((s) => append(append(append(append(s.silence(1), s.chant(OTHER, s.vary())), s.chant(OTHER, s.vary())), s.chant(OTHER, s.vary())), s.silence(1)), 105)).toBe(0);
  });

  it('does not count silence', () => {
    expect(count((s) => s.silence(10), 106)).toBe(0);
  });

  it('noise floor only moves down', () => {
    const c = new Counter(takes, { thr: cal.base, floor: -60, onCount: () => {} });
    const v = new Float32Array(12);
    c.feed({ v, db: -40 });
    expect(c.floor).toBe(-60);
    c.feed({ v, db: -70 });
    expect(c.floor).toBeCloseTo(-61);
  });

  it('frameIndex is the index of the last fed frame', () => {
    const c = new Counter(takes, { thr: cal.base, floor, onCount: () => {} });
    const v = new Float32Array(12);
    c.feed({ v, db: -60 });
    c.feed({ v, db: -60 });
    expect(c.frameIndex).toBe(1);
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run tests/unit/engine/floor.test.ts tests/unit/engine/counter.test.ts`
Expected: FAIL — cannot resolve modules.

- [ ] **Step 3: Implement**

`src/engine/floor.ts`:

```ts
export const SESSION_QUIET_FRAMES = 75; // 1.5 s of quiet measured at session start
export const FLOOR_CAP_DB = 10; // session floor never sits more than 10 dB above the samples' floor

export function median(a: number[]): number {
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
}

export function sessionFloor(quietDbs: number[], sampleFloor: number): number {
  return Math.min(median(quietDbs), sampleFloor + FLOOR_CAP_DB);
}
```

`src/engine/counter.ts` (port of v1 `Counter`):

```ts
import { NCEP, VOICED_DB } from './constants';
import { Matcher } from './matcher';
import type { Frame, MatchResult, Take } from './types';
import { unit, vsub } from './vec';

export interface CounterOptions {
  thr: number;
  floor: number;
  onCount: (m: MatchResult) => void;
  onScore?: (best: number, thr: number, voiced: boolean) => void;
}

const RING = 4096; // voiced flags for the last ~82 s of frames
const LIVE_MEAN_FRAMES = 150; // running cepstral mean time constant (≈ 3 s)
const VOICED_RATIO_MIN = 0.6;
const OVERLAP_MAX = 0.4;
const DROP_BACK = 0.2;
const CONFIRM_MIN_FRAMES = 8;
const CONFIRM_FRAC = 0.12;

/** Live counter: feeds frames through every template matcher and emits one count per chant. */
export class Counter {
  private readonly matchers: Matcher[];
  private readonly Mavg: number;
  private readonly mean: Float32Array;
  private readonly thr: number;
  private readonly onCount: (m: MatchResult) => void;
  private readonly onScore: ((best: number, thr: number, voiced: boolean) => void) | null;
  private readonly voiced = new Uint8Array(RING);
  private _floor: number;
  private t = 0;
  private last: MatchResult | null = null;

  constructor(takes: Take[], opts: CounterOptions) {
    this.matchers = takes.map((tk) => new Matcher(tk.frames.map(unit)));
    this.Mavg = this.matchers.reduce((a, m) => a + m.M, 0) / this.matchers.length;
    this.mean = new Float32Array(NCEP);
    for (const tk of takes) for (let k = 0; k < NCEP; k++) this.mean[k] += tk.mean[k] / takes.length;
    this.thr = opts.thr;
    this._floor = opts.floor;
    this.onCount = opts.onCount;
    this.onScore = opts.onScore ?? null;
  }

  get floor(): number {
    return this._floor;
  }

  get frameIndex(): number {
    return this.t - 1;
  }

  reset(): void {
    for (const m of this.matchers) m.reset();
    this.last = null;
  }

  feed(fr: Frame): void {
    if (!Number.isFinite(fr.db)) return;
    const t = this.t++;
    const v = fr.v;
    const db = fr.db;
    if (db < this._floor) this._floor = 0.9 * this._floor + 0.1 * db;
    const isV = db > this._floor + VOICED_DB;
    this.voiced[t & (RING - 1)] = isV ? 1 : 0;
    if (isV) for (let k = 0; k < NCEP; k++) this.mean[k] += (v[k] - this.mean[k]) / LIVE_MEAN_FRAMES;
    const x = unit(vsub(v, this.mean));
    let bestNow = Infinity;
    for (const m of this.matchers) {
      const r = m.step(x, t);
      if (r) {
        if (r.score < bestNow) bestNow = r.score;
        if (isV && r.score < this.thr && (!m.cand || r.score < m.cand.score)) m.cand = r;
      }
      if (m.cand && t - m.cand.te >= Math.max(CONFIRM_MIN_FRAMES, Math.round(CONFIRM_FRAC * m.M))) {
        const c = m.cand;
        m.cand = null;
        this.emit(c);
      }
    }
    this.onScore?.(bestNow, this.thr, isV);
  }

  private emit(c: MatchResult): void {
    const n = c.te - c.ts + 1;
    let v = 0;
    for (let f = c.ts; f <= c.te; f++) v += this.voiced[f & (RING - 1)];
    if (v / n < VOICED_RATIO_MIN) return;
    if (this.last) {
      const ov = Math.min(c.te, this.last.te) - Math.max(c.ts, this.last.ts);
      if (c.te <= this.last.te || ov > OVERLAP_MAX * Math.min(n, this.last.te - this.last.ts + 1)) return;
    }
    this.last = c;
    const cut = c.te - Math.round(DROP_BACK * this.Mavg);
    for (const m of this.matchers) {
      m.dropUpTo(cut);
      if (m.cand && m.cand.ts <= cut) m.cand = null;
    }
    this.onCount(c);
  }
}
```

- [ ] **Step 4: Run to see them pass**

Run: `npx vitest run tests/unit/engine`
Expected: PASS. These expectations were checked against the v1 engine on several seeds. If one fails, report the observed count rather than editing the expectation.

- [ ] **Step 5: Commit**

```bash
git add src/engine/floor.ts src/engine/counter.ts tests/unit/engine/floor.test.ts tests/unit/engine/counter.test.ts
git commit -m "feat(engine): port live counter and session noise floor"
```

### Task 7: v1 parity test and synthetic accuracy harness (M1 gate)

**Files:**
- Create: `tests/helpers/v1/core.js` (verbatim copy of Appendix A), `tests/harness/synthetic-suite.ts`, `tests/harness/synthetic.test.ts`, `tests/harness/synthetic-extra.test.ts`, `tests/harness/v1-parity.test.ts`
- Modify: `.github/workflows/ci.yml` (remove `--if-present -- --passWithNoTests` from the harness step)

**Interfaces:**
- Consumes: everything in `src/engine`, `tests/helpers/synth.ts`.
- Produces: `runSyntheticSuite(seed: number): SyntheticResult` with `interface SyntheticResult { seed: number; expected: number; counted: number; overcount: number; undercount: number; falseInDistractor: number; maxLatencySec: number }`.

- [ ] **Step 1: Copy the v1 engine verbatim**

```bash
mkdir -p tests/helpers/v1
sed -n '425,628p' docs/DESIGN.md > tests/helpers/v1/core.js
head -1 tests/helpers/v1/core.js   # must print: const SR = 16000, FRAME = 512, HOP = 320, NFFT = 512, NMEL = 40, NCEP = 12;
tail -2 tests/helpers/v1/core.js   # must end with the closing braces of class Counter
```

- [ ] **Step 2: Write the parity test**

`tests/harness/v1-parity.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { calibrate } from '../../src/engine/calibrate';
import { Counter } from '../../src/engine/counter';
import { processTake } from '../../src/engine/takes';
import type { Frame, MatchResult, Take } from '../../src/engine/types';
import { append, floorOf, framesOf, MANTRA, Synth } from '../helpers/synth';

interface V1Engine {
  FeatureStream: new (rate: number, onFrame: (f: Frame) => void) => { push(a: Float32Array): void };
  processTake(frames: Frame[], floor: number): { frames: Float32Array[]; mean: Float32Array; dur: number } | null;
  calibrate(takes: unknown[]): { base: number; mean: number; max: number } | null;
  Counter: new (takes: unknown[], opts: { thr: number; floor: number; onCount: (m: MatchResult) => void }) => { feed(f: Frame): void };
}

const src = readFileSync(new URL('../helpers/v1/core.js', import.meta.url), 'utf8');
const v1 = new Function(`${src}\nreturn { FeatureStream, processTake, calibrate, Counter };`)() as V1Engine;

const v1Frames = (pcm: number[]) => {
  const out: Frame[] = [];
  new v1.FeatureStream(16000, (f) => out.push(f)).push(Float32Array.from(pcm));
  return out;
};

describe('v1 parity at 16 kHz', () => {
  const s = new Synth(7);
  const floor = floorOf(framesOf(s.addNoise(s.silence(1))));
  const recordings: number[][] = [];
  for (let i = 0; i < 4; i++) recordings.push(s.addNoise(append(append(append([], s.silence(0.6)), s.chant(MANTRA, s.vary())), s.silence(0.8))));
  const stream: number[] = s.silence(1);
  for (let i = 0; i < 3; i++) append(stream, s.chant(MANTRA, s.vary()));
  append(stream, s.silence(1));
  const noisyStream = s.addNoise(stream);

  it('frames are identical', () => {
    const a = framesOf(recordings[0]);
    const b = v1Frames(recordings[0]);
    expect(a.length).toBe(b.length);
    for (let i = 0; i < a.length; i++) {
      expect(a[i].db).toBeCloseTo(b[i].db, 6);
      for (let k = 0; k < 12; k++) expect(a[i].v[k]).toBeCloseTo(b[i].v[k], 6);
    }
  });

  it('takes, calibration and counts are identical', () => {
    const ours = recordings.map((r) => processTake(framesOf(r), floor)!) as Take[];
    const theirs = recordings.map((r) => v1.processTake(v1Frames(r), floor)!);
    ours.forEach((t, i) => {
      expect(t.frames.length).toBe(theirs[i].frames.length);
      expect(t.dur).toBeCloseTo(theirs[i].dur, 9);
    });
    const ca = calibrate(ours)!;
    const cb = v1.calibrate(theirs)!;
    expect(ca.base).toBeCloseTo(cb.base, 9);
    expect(ca.mean).toBeCloseTo(cb.mean, 9);
    expect(ca.max).toBeCloseTo(cb.max, 9);

    const a: number[] = [];
    const b: number[] = [];
    const ourCounter = new Counter(ours, { thr: ca.base, floor, onCount: (m) => a.push(m.te) });
    const theirCounter = new v1.Counter(theirs, { thr: cb.base, floor, onCount: (m) => b.push(m.te) });
    for (const f of framesOf(noisyStream)) ourCounter.feed(f);
    for (const f of v1Frames(noisyStream)) theirCounter.feed(f);
    expect(a).toEqual(b);
    expect(a.length).toBe(3);
  });
}, 60_000);
```

- [ ] **Step 3: Write the harness runner and tests**

`tests/harness/synthetic-suite.ts` (port of Appendix D):

```ts
import { calibrate } from '../../src/engine/calibrate';
import { FPS, SR } from '../../src/engine/constants';
import { Counter } from '../../src/engine/counter';
import { processTake } from '../../src/engine/takes';
import type { Take } from '../../src/engine/types';
import { append, floorOf, framesOf, MANTRA, OTHER, Synth, type Seg, type Voice } from '../helpers/synth';

export interface SyntheticResult {
  seed: number;
  expected: number;
  counted: number;
  overcount: number;
  undercount: number;
  falseInDistractor: number;
  maxLatencySec: number;
}

/** Enrol 6 samples; stream 20 chants, 2 s gap, 6 distractor phrases, 1 s gap, 10 chants at 0.75–1.3× pace. */
export function runSyntheticSuite(seed: number): SyntheticResult {
  const s = new Synth(seed);
  const floor = floorOf(framesOf(s.addNoise(s.silence(1))));
  const takes: Take[] = [];
  for (let i = 0; i < 6; i++) {
    const pcm: number[] = [];
    append(pcm, s.silence(0.6));
    append(pcm, s.chant(MANTRA, s.vary()));
    append(pcm, s.silence(0.8));
    const take = processTake(framesOf(s.addNoise(pcm)), floor);
    if (!take) throw new Error(`seed ${seed}: take ${i} rejected`);
    takes.push(take);
  }
  const cal = calibrate(takes);
  if (!cal) throw new Error(`seed ${seed}: calibration failed`);

  const stream: number[] = s.silence(1);
  const marks: { kind: 'M' | 'O'; end: number }[] = [];
  const addReps = (spec: readonly Seg[], n: number, voice: () => Voice) => {
    for (let i = 0; i < n; i++) {
      append(stream, s.chant(spec, voice()));
      marks.push({ kind: spec === MANTRA ? 'M' : 'O', end: stream.length / SR });
    }
  };
  addReps(MANTRA, 20, () => s.vary());
  append(stream, s.silence(2));
  addReps(OTHER, 6, () => s.vary());
  append(stream, s.silence(1));
  addReps(MANTRA, 10, () => ({ ...s.vary(), tempo: 0.75 + 0.55 * s.rnd() }));
  append(stream, s.silence(2));
  const noisy = s.addNoise(stream);

  const counts: { te: number; at: number }[] = [];
  const counter: Counter = new Counter(takes, { thr: cal.base, floor, onCount: (m) => counts.push({ te: m.te, at: counter.frameIndex }) });
  for (const f of framesOf(noisy)) counter.feed(f);

  const expected = 30;
  const otherStart = marks[19].end + 2;
  const otherEnd = marks[25].end;
  const counted = counts.length;
  return {
    seed,
    expected,
    counted,
    overcount: Math.max(0, counted - expected),
    undercount: Math.max(0, expected - counted),
    falseInDistractor: counts.filter((c) => c.te / FPS > otherStart && c.te / FPS <= otherEnd + 0.5).length,
    maxLatencySec: Math.max(0, ...counts.map((c) => (c.at - c.te) / FPS)),
  };
}
```

`tests/harness/synthetic.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { runSyntheticSuite } from './synthetic-suite';

describe('synthetic accuracy harness (v1 reference seeds)', () => {
  it.each([7, 23])('seed %i: 30 of 30, 0 false, every count under 1 s', (seed) => {
    const r = runSyntheticSuite(seed);
    console.log(JSON.stringify(r));
    expect(r.overcount).toBe(0);
    expect(r.falseInDistractor).toBe(0);
    expect(r.counted).toBe(r.expected);
    expect(r.maxLatencySec).toBeLessThan(1);
  }, 180_000);
});
```

`tests/harness/synthetic-extra.test.ts`: same body as `synthetic.test.ts` with `describe('synthetic accuracy harness (extra seeds)'` and `it.each([1, 2, 3])`. Vitest runs the two files in parallel, which keeps the harness under ~1 minute.

- [ ] **Step 4: Run the harness**

Run: `npm run test:harness`
Expected: PASS — parity (2 tests) and 5 seeds each `"counted":30,"overcount":0,"falseInDistractor":0`. The v1 code itself gives 30/30, 0 false on seeds 7, 23, 1, 2, 3, so any difference is a porting bug: use the parity test to find it, do not loosen expectations.

- [ ] **Step 5: Make the CI harness step strict**

In `.github/workflows/ci.yml` replace `- run: npm run test:harness --if-present -- --passWithNoTests` with `- run: npm run test:harness`.

- [ ] **Step 6: Commit**

```bash
git add tests/helpers/v1 tests/harness .github/workflows/ci.yml
git commit -m "test(engine): v1 parity test and synthetic accuracy harness (M1 gate)"
```

---

## M2 — Audio and recording flow

### Task 8: WAV codec, waveform peaks and bells

**Files:**
- Create: `src/audio/wav.ts`, `src/audio/waveform.ts`, `src/audio/bell.ts`
- Test: `tests/unit/audio/wav.test.ts`, `tests/unit/audio/waveform.test.ts`, `tests/unit/audio/bell.test.ts`

**Interfaces:**
- Produces:
  - `encodeWav(pcm: Float32Array, sampleRate?: number): ArrayBuffer` (16-bit PCM mono, default 16000)
  - `decodeWav(buf: ArrayBuffer): { pcm: Float32Array; sampleRate: number }` (16-bit PCM, mono or multi-channel averaged; throws `Error('Not a 16-bit PCM WAV file')` otherwise)
  - `waveformPeaks(pcm: Float32Array, buckets: number): number[]` (max |x| per bucket, 0..1)
  - `type BellContext = Pick<BaseAudioContext, 'currentTime' | 'createOscillator' | 'createGain' | 'destination'>`, `bell(ctx: BellContext, when?: number, freq?: number, vol?: number): void`, `chime(ctx: BellContext): void`

- [ ] **Step 1: Write the failing tests**

`tests/unit/audio/wav.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { decodeWav, encodeWav } from '../../../src/audio/wav';

describe('WAV codec', () => {
  it('writes a 44-byte header for 16 kHz, 16-bit, mono', () => {
    const buf = encodeWav(new Float32Array(100));
    const v = new DataView(buf);
    const str = (o: number) => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
    expect(buf.byteLength).toBe(44 + 200);
    expect(str(0)).toBe('RIFF');
    expect(str(8)).toBe('WAVE');
    expect(v.getUint16(20, true)).toBe(1); // PCM
    expect(v.getUint16(22, true)).toBe(1); // mono
    expect(v.getUint32(24, true)).toBe(16000);
    expect(v.getUint16(34, true)).toBe(16);
    expect(v.getUint32(40, true)).toBe(200);
  });

  it('round-trips samples within one 16-bit step and clamps out-of-range values', () => {
    const pcm = Float32Array.from([0, 0.5, -0.5, 0.123, 1.5, -2]);
    const { pcm: back, sampleRate } = decodeWav(encodeWav(pcm));
    expect(sampleRate).toBe(16000);
    expect(back[1]).toBeCloseTo(0.5, 4);
    expect(back[3]).toBeCloseTo(0.123, 4);
    expect(back[4]).toBeCloseTo(1, 4);
    expect(back[5]).toBeCloseTo(-1, 4);
  });

  it('averages channels of a stereo file', () => {
    const buf = new ArrayBuffer(44 + 8);
    const v = new DataView(buf);
    const w = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
    w(0, 'RIFF'); v.setUint32(4, 36 + 8, true); w(8, 'WAVE'); w(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true); v.setUint32(24, 8000, true);
    v.setUint32(28, 32000, true); v.setUint16(32, 4, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, 8, true);
    v.setInt16(44, 16384, true); v.setInt16(46, 0, true); v.setInt16(48, -16384, true); v.setInt16(50, -16384, true);
    const { pcm, sampleRate } = decodeWav(buf);
    expect(sampleRate).toBe(8000);
    expect(pcm[0]).toBeCloseTo(0.25, 3);
    expect(pcm[1]).toBeCloseTo(-0.5, 3);
  });

  it('rejects files that are not 16-bit PCM WAV', () => {
    expect(() => decodeWav(new ArrayBuffer(10))).toThrow('Not a 16-bit PCM WAV file');
  });
});
```

`tests/unit/audio/waveform.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { waveformPeaks } from '../../../src/audio/waveform';

describe('waveformPeaks', () => {
  it('returns the max absolute value per bucket', () => {
    expect(waveformPeaks(Float32Array.from([0.1, -0.5, 0.2, 0.3]), 2)).toEqual([0.5, 0.3].map((x) => Math.fround(x)));
  });
  it('returns zeros for empty input', () => {
    expect(waveformPeaks(new Float32Array(0), 3)).toEqual([0, 0, 0]);
  });
});
```

`tests/unit/audio/bell.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { bell, chime, type BellContext } from '../../../src/audio/bell';

function fakeCtx() {
  const started: { freq: number; at: number }[] = [];
  const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} });
  const ctx = {
    currentTime: 10,
    destination: {},
    createGain: () => ({ gain: param(), connect() {} }),
    createOscillator: () => {
      const o = { type: 'sine', frequency: param(), connect() {}, start(at: number) { started.push({ freq: o.frequency.value, at }); }, stop() {} };
      return o;
    },
  } as unknown as BellContext;
  return { ctx, started };
}

describe('bell', () => {
  it('plays three sine partials at 1×, 2.76× and 5.4× the base frequency', () => {
    const { ctx, started } = fakeCtx();
    bell(ctx);
    expect(started.map((s) => Math.round(s.freq))).toEqual([528, Math.round(528 * 2.76), Math.round(528 * 5.4)]);
    expect(started.every((s) => s.at === 10)).toBe(true);
  });

  it('chime rings three bells 0.9 s apart at 528, 660 and 792 Hz', () => {
    const { ctx, started } = fakeCtx();
    chime(ctx);
    const fundamentals = started.filter((_, i) => i % 3 === 0);
    expect(fundamentals.map((s) => [s.freq, s.at])).toEqual([[528, 10], [660, 10.9], [792, 11.8]]);
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run tests/unit/audio`
Expected: FAIL — modules missing.

- [ ] **Step 3: Implement**

`src/audio/wav.ts`:

```ts
import { SR } from '../engine/constants';

const ERR = 'Not a 16-bit PCM WAV file';

export function encodeWav(pcm: Float32Array, sampleRate: number = SR): ArrayBuffer {
  const buf = new ArrayBuffer(44 + pcm.length * 2);
  const v = new DataView(buf);
  const w = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  w(0, 'RIFF');
  v.setUint32(4, 36 + pcm.length * 2, true);
  w(8, 'WAVE');
  w(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  w(36, 'data');
  v.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i++) {
    const s = Math.max(-1, Math.min(1, pcm[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buf;
}

export function decodeWav(buf: ArrayBuffer): { pcm: Float32Array; sampleRate: number } {
  if (buf.byteLength < 12) throw new Error(ERR);
  const v = new DataView(buf);
  const str = (o: number) => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
  if (str(0) !== 'RIFF' || str(8) !== 'WAVE') throw new Error(ERR);
  let off = 12;
  let channels = 0;
  let sampleRate = 0;
  let bits = 0;
  let format = 0;
  while (off + 8 <= buf.byteLength) {
    const id = str(off);
    const size = v.getUint32(off + 4, true);
    const body = off + 8;
    if (id === 'fmt ') {
      format = v.getUint16(body, true);
      channels = v.getUint16(body + 2, true);
      sampleRate = v.getUint32(body + 4, true);
      bits = v.getUint16(body + 14, true);
    } else if (id === 'data') {
      if (format !== 1 || bits !== 16 || channels < 1) throw new Error(ERR);
      const frames = Math.floor(Math.min(size, buf.byteLength - body) / (2 * channels));
      const pcm = new Float32Array(frames);
      for (let i = 0; i < frames; i++) {
        let s = 0;
        for (let c = 0; c < channels; c++) s += v.getInt16(body + (i * channels + c) * 2, true) / 0x8000;
        pcm[i] = s / channels;
      }
      return { pcm, sampleRate };
    }
    off = body + size + (size & 1);
  }
  throw new Error(ERR);
}
```

`src/audio/waveform.ts`:

```ts
/** Max |sample| per bucket, for drawing the review waveform. */
export function waveformPeaks(pcm: Float32Array, buckets: number): number[] {
  const out = new Array<number>(buckets).fill(0);
  if (pcm.length === 0) return out;
  for (let b = 0; b < buckets; b++) {
    const from = Math.floor((b * pcm.length) / buckets);
    const to = Math.max(from + 1, Math.floor(((b + 1) * pcm.length) / buckets));
    let m = 0;
    for (let i = from; i < to && i < pcm.length; i++) m = Math.max(m, Math.abs(pcm[i]));
    out[b] = m;
  }
  return out;
}
```

`src/audio/bell.ts` (port of v1 `bell`):

```ts
export type BellContext = Pick<BaseAudioContext, 'currentTime' | 'createOscillator' | 'createGain' | 'destination'>;

/** Soft bell: three sine partials with exponential decay. */
export function bell(ctx: BellContext, when = 0, freq = 528, vol = 0.12): void {
  const t = ctx.currentTime + when;
  for (const [mult, amp] of [[1, 1], [2.76, 0.35], [5.4, 0.12]] as const) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = freq * mult;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol * amp, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.6);
    o.connect(g);
    g.connect(ctx.destination);
    o.start(t);
    o.stop(t + 2.7);
  }
}

/** Three-bell chime at target. */
export function chime(ctx: BellContext): void {
  bell(ctx, 0, 528, 0.16);
  bell(ctx, 0.9, 660, 0.14);
  bell(ctx, 1.8, 792, 0.12);
}
```

- [ ] **Step 4: Run to see them pass**

Run: `npx vitest run tests/unit/audio`
Expected: PASS. (`chime` start times are floating-point sums; if `10.9`/`11.8` compare unequal, round the `at` values to 1e-9 in the test.)

- [ ] **Step 5: Commit**

```bash
git add src/audio tests/unit/audio
git commit -m "feat(audio): WAV codec, waveform peaks and bells"
```

### Task 9: Recording auto-stop with adaptive floor

**Files:**
- Create: `src/recording/autostop.ts`
- Test: `tests/unit/recording/autostop.test.ts`

**Interfaces:**
- Consumes: `HOP`, `VOICED_DB` (Task 2), `median` (Task 6).
- Produces: constants `COUNTDOWN_FRAMES = 150`, `FRAMES_PER_COUNT = 50`, `END_QUIET_FRAMES = 40`, `MIN_SPEECH_FRAMES = 40`, `MAX_CHANT_FRAMES = 750`, `BLIP_FRAMES = 5`, `SPEECH_DROP_DB = 25`, `LEVEL_RANGE_DB = 40`; `type RecPhase = 'countdown' | 'chant' | 'done'`; `type StopReason = 'quiet' | 'limit'`; `interface AutoStopTick { phase: RecPhase; countdown: number; level: number; stopped: StopReason | null }`; `class AutoStop { readonly chantStartSample: number; readonly floor: number | null; readonly phase: RecPhase; readonly reachedChant: boolean; feed(db: number): AutoStopTick; stop(): void }`.

Behaviour (spec "Recording flow" steps 3–5 and feedback row 14): the 3-2-1 countdown (150 frames) measures the noise floor (median). Then the chant phase runs until (a) at least 0.8 s of voiced frames were heard **and** the level has stayed "near the floor" for 0.8 s, or (b) 15 s. "Near the floor" is adaptive: below `max(floor + 8 dB, speech peak − 25 dB)`, so a fan or room reverb above floor + 8 dB still lets the take end. Loud runs shorter than 5 frames (breath, click) do not reset the quiet run. The floor only moves down.

- [ ] **Step 1: Write the failing tests**

`tests/unit/recording/autostop.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { AutoStop, COUNTDOWN_FRAMES, MAX_CHANT_FRAMES, type AutoStopTick } from '../../../src/recording/autostop';

function feed(a: AutoStop, db: number, n: number): AutoStopTick[] {
  return Array.from({ length: n }, () => a.feed(db));
}
function afterCountdown(floor = -60) {
  const a = new AutoStop();
  feed(a, floor, COUNTDOWN_FRAMES);
  return a;
}
const stopIndex = (ticks: AutoStopTick[]) => ticks.findIndex((t) => t.stopped !== null);

describe('AutoStop', () => {
  it('counts down 3-2-1 over 3 s and measures the floor as the median', () => {
    const a = new AutoStop();
    const ticks = [...feed(a, -62, 60), ...feed(a, -58, 90)];
    expect(ticks[0].countdown).toBe(3);
    expect(ticks[60].countdown).toBe(2);
    expect(ticks[110].countdown).toBe(1);
    expect(ticks[148].phase).toBe('countdown');
    expect(ticks[149].phase).toBe('chant');
    expect(a.floor).toBe(-58);
    expect(a.reachedChant).toBe(true);
    expect(a.chantStartSample).toBe(150 * 320);
  });

  it('does not stop before any speech is heard', () => {
    const a = afterCountdown();
    expect(feed(a, -60, 300).every((t) => t.stopped === null)).toBe(true);
  });

  it('stops 0.8 s after the chant ends', () => {
    const a = afterCountdown();
    feed(a, -20, 100);
    const ticks = feed(a, -60, 60);
    expect(stopIndex(ticks)).toBe(39);
    expect(ticks[39].stopped).toBe('quiet');
    expect(a.phase).toBe('done');
  });

  it('still stops when a fan or reverb keeps the level above floor + 8 dB (adaptive line)', () => {
    const a = afterCountdown();
    feed(a, -20, 100);
    expect(stopIndex(feed(a, -48, 60))).toBe(39);
  });

  it('a short breath or click does not restart the quiet wait', () => {
    const a = afterCountdown();
    feed(a, -20, 100);
    feed(a, -60, 20);
    feed(a, -20, 3);
    expect(stopIndex(feed(a, -60, 30))).toBe(19);
  });

  it('a longer sound (≥ 5 frames) restarts the quiet wait', () => {
    const a = afterCountdown();
    feed(a, -20, 100);
    feed(a, -60, 30);
    feed(a, -20, 10);
    expect(stopIndex(feed(a, -60, 60))).toBe(39);
  });

  it('needs at least 0.8 s of voice before auto-stopping', () => {
    const a = afterCountdown();
    feed(a, -20, 20);
    expect(feed(a, -60, 100).every((t) => t.stopped === null)).toBe(true);
  });

  it('stops at the 15 s hard limit', () => {
    const a = afterCountdown();
    const ticks = feed(a, -20, MAX_CHANT_FRAMES);
    expect(stopIndex(ticks)).toBe(MAX_CHANT_FRAMES - 1);
    expect(ticks[MAX_CHANT_FRAMES - 1].stopped).toBe('limit');
  });

  it('manual stop ends the take; later frames report done without a stop reason', () => {
    const a = afterCountdown();
    feed(a, -20, 10);
    a.stop();
    expect(a.feed(-60)).toMatchObject({ phase: 'done', stopped: null });
  });

  it('stopping during the countdown never reaches the chant', () => {
    const a = new AutoStop();
    feed(a, -60, 10);
    a.stop();
    expect(a.reachedChant).toBe(false);
  });

  it('the floor only moves down', () => {
    const a = afterCountdown(-60);
    a.feed(-70);
    expect(a.floor).toBeCloseTo(-61);
    a.feed(-30);
    expect(a.floor).toBeCloseTo(-61);
  });

  it('ignores non-finite levels', () => {
    const a = afterCountdown();
    expect(a.feed(NaN)).toMatchObject({ phase: 'chant', stopped: null, level: 0 });
  });

  it('reports a 0..1 level relative to the floor over 40 dB', () => {
    const a = afterCountdown(-60);
    expect(a.feed(-40).level).toBeCloseTo(0.5);
    expect(a.feed(0).level).toBe(1);
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run tests/unit/recording`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `src/recording/autostop.ts`**

```ts
import { HOP, VOICED_DB } from '../engine/constants';
import { median } from '../engine/floor';

export const COUNTDOWN_FRAMES = 150; // 3 s at 50 frames/s; the noise floor is measured here
export const FRAMES_PER_COUNT = 50; // one countdown digit per second
export const END_QUIET_FRAMES = 40; // 0.8 s near the floor ends the take
export const MIN_SPEECH_FRAMES = 40; // 0.8 s of voiced frames before auto-stop may fire
export const MAX_CHANT_FRAMES = 750; // 15 s hard limit
export const BLIP_FRAMES = 5; // louder runs shorter than 0.1 s don't reset the quiet run
export const SPEECH_DROP_DB = 25; // quiet line = max(floor + 8 dB, speech peak − 25 dB)
export const LEVEL_RANGE_DB = 40; // level meter spans floor .. floor + 40 dB

export type RecPhase = 'countdown' | 'chant' | 'done';
export type StopReason = 'quiet' | 'limit';

export interface AutoStopTick {
  phase: RecPhase;
  countdown: number; // 3, 2, 1 during the countdown; 0 afterwards
  level: number; // 0..1
  stopped: StopReason | null; // set only on the frame that ended the take
}

/** Drives one take: countdown → chant → done, from per-frame energy (dB). */
export class AutoStop {
  readonly chantStartSample = COUNTDOWN_FRAMES * HOP;
  private readonly countdownDbs: number[] = [];
  private _floor: number | null = null;
  private _phase: RecPhase = 'countdown';
  private _reachedChant = false;
  private chantFrames = 0;
  private voiced = 0;
  private quietRun = 0;
  private loudRun = 0;
  private peak = -Infinity;
  private smooth: number | null = null;

  get floor(): number | null {
    return this._floor;
  }

  get phase(): RecPhase {
    return this._phase;
  }

  get reachedChant(): boolean {
    return this._reachedChant;
  }

  feed(db: number): AutoStopTick {
    if (this._phase === 'done') return this.tick(null, 0);
    if (!Number.isFinite(db)) return this.tick(null, 0);
    if (this._phase === 'countdown') {
      this.countdownDbs.push(db);
      if (this.countdownDbs.length >= COUNTDOWN_FRAMES) {
        this._floor = median(this.countdownDbs);
        this._phase = 'chant';
        this._reachedChant = true;
      }
      return this.tick(null, this.levelOf(db));
    }
    let floor = this._floor as number;
    if (db < floor) floor = this._floor = 0.9 * floor + 0.1 * db;
    this.chantFrames++;
    this.smooth = this.smooth === null ? db : 0.8 * this.smooth + 0.2 * db;
    if (db > floor + VOICED_DB) {
      this.voiced++;
      this.peak = Math.max(this.peak, this.smooth);
    }
    const quietLine = Math.max(floor + VOICED_DB, this.peak - SPEECH_DROP_DB);
    if (db < quietLine) {
      this.quietRun++;
      this.loudRun = 0;
    } else {
      this.loudRun++;
      if (this.loudRun >= BLIP_FRAMES) this.quietRun = 0;
    }
    let stopped: StopReason | null = null;
    if (this.voiced >= MIN_SPEECH_FRAMES && this.quietRun >= END_QUIET_FRAMES) stopped = 'quiet';
    else if (this.chantFrames >= MAX_CHANT_FRAMES) stopped = 'limit';
    if (stopped) this._phase = 'done';
    return this.tick(stopped, this.levelOf(db));
  }

  /** Manual stop (the always-visible Stop button). */
  stop(): void {
    this._phase = 'done';
  }

  private levelOf(db: number): number {
    const ref = this._floor ?? (this.countdownDbs.length ? median(this.countdownDbs) : db);
    return Math.max(0, Math.min(1, (db - ref) / LEVEL_RANGE_DB));
  }

  private tick(stopped: StopReason | null, level: number): AutoStopTick {
    const countdown = this._phase === 'countdown' ? 3 - Math.floor(this.countdownDbs.length / FRAMES_PER_COUNT) : 0;
    return { phase: this._phase, countdown, level, stopped };
  }
}
```

- [ ] **Step 4: Run to see them pass**

Run: `npx vitest run tests/unit/recording`
Expected: PASS (13 tests). Note the countdown digit test: after the 60th push the length is 60 → digit 2; after 110 → digit 1.

- [ ] **Step 5: Commit**

```bash
git add src/recording tests/unit/recording
git commit -m "feat(recording): auto-stop with adaptive floor, blip tolerance and 15 s limit"
```

### Task 10: Engine worker core, AudioWorklet capture and mic glue

**Files:**
- Create: `src/audio/protocol.ts`, `src/audio/engine-core.ts`, `src/audio/engine.worker.ts`, `src/audio/worklet.ts`, `src/audio/worklet-env.d.ts`, `src/audio/mic.ts`, `tests/helpers/fake-engine.ts`
- Test: `tests/unit/audio/engine-core.test.ts`

**Interfaces:**
- Consumes: `FeatureStream` (Task 3), `Counter` (Task 6), `sessionFloor`, `SESSION_QUIET_FRAMES` (Task 6).
- Produces:
  - `protocol.ts`:
    ```ts
    export type ToEngine =
      | { type: 'init'; inRate: number; port?: MessagePort }
      | { type: 'rec-start' }
      | { type: 'rec-stop' }
      | { type: 'session-start'; takes: Take[]; thr: number; sampleFloor: number }
      | { type: 'session-stop' };
    export type FromEngine =
      | { type: 'frame'; db: number }
      | { type: 'rec-pcm'; pcm: Float32Array }
      | { type: 'session-ready'; floor: number }
      | { type: 'count'; te: number };
    export interface EngineHandle {
      readonly ctx: AudioContext | null;
      send(msg: ToEngine, transfer?: Transferable[]): void;
      on(listener: (msg: FromEngine) => void): () => void;
      close(): Promise<void>;
    }
    export type OpenEngine = () => Promise<EngineHandle>;
    ```
  - `engine-core.ts`: `class EngineCore { constructor(post: (msg: FromEngine, transfer?: Transferable[]) => void); handle(msg: ToEngine): void; audio(chunk: Float32Array): void }`
  - `mic.ts`: `MIC_CONSTRAINTS: MediaStreamConstraints`, `openAudioEngine: OpenEngine`
  - `tests/helpers/fake-engine.ts`: `class FakeEngine implements EngineHandle { ctx: AudioContext | null; sent: ToEngine[]; closed: boolean; emit(msg: FromEngine): void }`

Engine behaviour:
- `init`: remembers `inRate`; if `port` is given, `port.onmessage = (e) => this.audio(e.data)`.
- `rec-start`: new `FeatureStream(inRate, onFrame, onPcm)`; mode `rec`; clear collected PCM. In `rec` mode every frame posts `{ type: 'frame', db }` and every 16 kHz PCM chunk is kept.
- `rec-stop`: `flush()` the stream, concatenate the kept PCM, post `{ type: 'rec-pcm', pcm }` with `[pcm.buffer]` transferred, mode `idle`.
- `session-start`: new `FeatureStream`; mode `quiet`; collect finite frame dBs; after `SESSION_QUIET_FRAMES` frames: `floor = sessionFloor(dbs, sampleFloor)`, build `Counter(takes, { thr, floor, onCount: m => post({ type: 'count', te: m.te }) })`, post `{ type: 'session-ready', floor }`, mode `live`; then feed every frame to the counter.
- `session-stop`: mode `idle`, drop the stream and counter.
- `audio(chunk)` in `idle` mode does nothing.

- [ ] **Step 1: Write the protocol types and the fake engine (types + test helper, no logic)**

`src/audio/protocol.ts` exactly as in Interfaces above, with `import type { Take } from '../engine/types';`.

`tests/helpers/fake-engine.ts`:

```ts
import type { EngineHandle, FromEngine, ToEngine } from '../../src/audio/protocol';

export class FakeEngine implements EngineHandle {
  ctx: AudioContext | null = {} as AudioContext;
  sent: ToEngine[] = [];
  closed = false;
  private readonly listeners = new Set<(msg: FromEngine) => void>();

  send(msg: ToEngine): void {
    this.sent.push(msg);
  }

  on(listener: (msg: FromEngine) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async close(): Promise<void> {
    this.closed = true;
  }

  emit(msg: FromEngine): void {
    for (const l of [...this.listeners]) l(msg);
  }

  sentTypes(): string[] {
    return this.sent.map((m) => m.type);
  }
}
```

- [ ] **Step 2: Write the failing tests**

`tests/unit/audio/engine-core.test.ts`:

```ts
import { beforeAll, describe, expect, it } from 'vitest';
import { EngineCore } from '../../../src/audio/engine-core';
import type { FromEngine } from '../../../src/audio/protocol';
import { calibrate } from '../../../src/engine/calibrate';
import { FRAME, HOP, SR } from '../../../src/engine/constants';
import { processTake } from '../../../src/engine/takes';
import type { Take } from '../../../src/engine/types';
import { append, floorOf, framesOf, MANTRA, Synth } from '../../helpers/synth';

function harness() {
  const out: FromEngine[] = [];
  const core = new EngineCore((m) => out.push(m));
  return { core, out, of: (t: FromEngine['type']) => out.filter((m) => m.type === t) };
}
function feedChunks(core: EngineCore, pcm: Float32Array, size = 1024) {
  for (let i = 0; i < pcm.length; i += size) core.audio(pcm.slice(i, i + size));
}

let takes: Take[];
let floor: number;
let thr: number;
let session: Float32Array;

beforeAll(() => {
  const s = new Synth(7);
  floor = floorOf(framesOf(s.addNoise(s.silence(1))));
  takes = [];
  for (let i = 0; i < 4; i++) takes.push(processTake(framesOf(s.addNoise(append(append(s.silence(0.6), s.chant(MANTRA, s.vary())), s.silence(0.8)))), floor)!);
  thr = calibrate(takes)!.base;
  session = Float32Array.from(s.addNoise(append(append(append(s.silence(2), s.chant(MANTRA, s.vary())), s.chant(MANTRA, s.vary())), s.silence(1))));
});

describe('EngineCore', () => {
  it('ignores audio until a mode is started', () => {
    const { core, out } = harness();
    core.handle({ type: 'init', inRate: SR });
    core.audio(new Float32Array(4096));
    expect(out).toEqual([]);
  });

  it('recording posts one frame level per hop and returns the 16 kHz PCM on stop', () => {
    const { core, of } = harness();
    core.handle({ type: 'init', inRate: SR });
    core.handle({ type: 'rec-start' });
    feedChunks(core, new Float32Array(SR).fill(0.01));
    core.handle({ type: 'rec-stop' });
    expect(of('frame')).toHaveLength(Math.floor((SR - FRAME) / HOP) + 1);
    const pcm = (of('rec-pcm')[0] as { pcm: Float32Array }).pcm;
    expect(pcm.length).toBe(SR);
  });

  it('resamples 48 kHz input to 16 kHz for recordings', () => {
    const { core, of } = harness();
    core.handle({ type: 'init', inRate: 48000 });
    core.handle({ type: 'rec-start' });
    feedChunks(core, new Float32Array(48000));
    core.handle({ type: 'rec-stop' });
    expect(Math.abs((of('rec-pcm')[0] as { pcm: Float32Array }).pcm.length - SR)).toBeLessThanOrEqual(1);
  });

  it('a new recording starts empty', () => {
    const { core, of } = harness();
    core.handle({ type: 'init', inRate: SR });
    core.handle({ type: 'rec-start' });
    feedChunks(core, new Float32Array(SR));
    core.handle({ type: 'rec-stop' });
    core.handle({ type: 'rec-start' });
    feedChunks(core, new Float32Array(SR / 2));
    core.handle({ type: 'rec-stop' });
    expect((of('rec-pcm')[1] as { pcm: Float32Array }).pcm.length).toBe(SR / 2);
  });

  it('session: measures 1.5 s of quiet, then counts chants', () => {
    const { core, of } = harness();
    core.handle({ type: 'init', inRate: SR });
    core.handle({ type: 'session-start', takes, thr, sampleFloor: floor });
    feedChunks(core, session);
    expect(of('session-ready')).toHaveLength(1);
    expect(of('count')).toHaveLength(2);
  });

  it('session-stop silences the engine', () => {
    const { core, out } = harness();
    core.handle({ type: 'init', inRate: SR });
    core.handle({ type: 'session-start', takes, thr, sampleFloor: floor });
    core.handle({ type: 'session-stop' });
    feedChunks(core, session);
    expect(out).toEqual([]);
  });
});
```

- [ ] **Step 3: Run to see them fail**

Run: `npx vitest run tests/unit/audio/engine-core.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 4: Implement `src/audio/engine-core.ts`**

```ts
import { Counter } from '../engine/counter';
import { FeatureStream } from '../engine/features';
import { SESSION_QUIET_FRAMES, sessionFloor } from '../engine/floor';
import type { Frame, Take } from '../engine/types';
import type { FromEngine, ToEngine } from './protocol';

type Mode = 'idle' | 'rec' | 'quiet' | 'live';

/** Worker-side engine, free of worker globals so it runs in Node tests. */
export class EngineCore {
  private inRate = 16000;
  private mode: Mode = 'idle';
  private stream: FeatureStream | null = null;
  private recPcm: Float32Array[] = [];
  private quietDbs: number[] = [];
  private counter: Counter | null = null;
  private session: { takes: Take[]; thr: number; sampleFloor: number } | null = null;

  constructor(private readonly post: (msg: FromEngine, transfer?: Transferable[]) => void) {}

  handle(msg: ToEngine): void {
    switch (msg.type) {
      case 'init':
        this.inRate = msg.inRate;
        if (msg.port) msg.port.onmessage = (e: MessageEvent<Float32Array>) => this.audio(e.data);
        break;
      case 'rec-start':
        this.recPcm = [];
        this.mode = 'rec';
        this.stream = new FeatureStream(this.inRate, (f) => this.onFrame(f), (pcm) => this.recPcm.push(pcm.slice()));
        break;
      case 'rec-stop': {
        this.stream?.flush();
        const total = this.recPcm.reduce((n, a) => n + a.length, 0);
        const pcm = new Float32Array(total);
        let o = 0;
        for (const a of this.recPcm) {
          pcm.set(a, o);
          o += a.length;
        }
        this.recPcm = [];
        this.mode = 'idle';
        this.stream = null;
        this.post({ type: 'rec-pcm', pcm }, [pcm.buffer]);
        break;
      }
      case 'session-start':
        this.session = { takes: msg.takes, thr: msg.thr, sampleFloor: msg.sampleFloor };
        this.quietDbs = [];
        this.counter = null;
        this.mode = 'quiet';
        this.stream = new FeatureStream(this.inRate, (f) => this.onFrame(f));
        break;
      case 'session-stop':
        this.mode = 'idle';
        this.stream = null;
        this.counter = null;
        this.session = null;
        break;
    }
  }

  audio(chunk: Float32Array): void {
    if (this.mode === 'idle') return;
    this.stream?.push(chunk);
  }

  private onFrame(f: Frame): void {
    if (this.mode === 'rec') {
      this.post({ type: 'frame', db: f.db });
    } else if (this.mode === 'quiet' && this.session) {
      if (Number.isFinite(f.db)) this.quietDbs.push(f.db);
      if (this.quietDbs.length >= SESSION_QUIET_FRAMES) {
        const floor = sessionFloor(this.quietDbs, this.session.sampleFloor);
        this.counter = new Counter(this.session.takes, { thr: this.session.thr, floor, onCount: (m) => this.post({ type: 'count', te: m.te }) });
        this.mode = 'live';
        this.post({ type: 'session-ready', floor });
      }
    } else if (this.mode === 'live') {
      this.counter?.feed(f);
    }
  }
}
```

- [ ] **Step 5: Run to see them pass**

Run: `npx vitest run tests/unit/audio/engine-core.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Write the browser glue (exempt from unit tests; verified by build now and Playwright in Task 15)**

`src/audio/worklet-env.d.ts`:

```ts
declare abstract class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor();
  abstract process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>): boolean;
}
declare function registerProcessor(name: string, ctor: new () => AudioWorkletProcessor): void;
```

`src/audio/worklet.ts`:

```ts
/// <reference path="./worklet-env.d.ts" />
const CHUNK = 1024;

/** Copies mic input to the engine worker in 1024-sample chunks over a dedicated MessagePort. */
class CaptureProcessor extends AudioWorkletProcessor {
  private out: MessagePort | null = null;
  private buf = new Float32Array(CHUNK);
  private n = 0;

  constructor() {
    super();
    this.port.onmessage = (e: MessageEvent<{ type: string; port: MessagePort }>) => {
      if (e.data?.type === 'port') this.out = e.data.port;
    };
  }

  process(inputs: Float32Array[][]): boolean {
    const ch = inputs[0]?.[0];
    if (ch && this.out) {
      for (let i = 0; i < ch.length; i++) {
        this.buf[this.n++] = ch[i];
        if (this.n === CHUNK) {
          this.out.postMessage(this.buf, [this.buf.buffer]);
          this.buf = new Float32Array(CHUNK);
          this.n = 0;
        }
      }
    }
    return true;
  }
}

registerProcessor('japa-capture', CaptureProcessor);
```

`src/audio/engine.worker.ts`:

```ts
import { EngineCore } from './engine-core';
import type { FromEngine, ToEngine } from './protocol';

const scope = self as unknown as {
  postMessage(msg: FromEngine, transfer: Transferable[]): void;
  onmessage: ((e: MessageEvent<ToEngine>) => void) | null;
};
const core = new EngineCore((msg, transfer) => scope.postMessage(msg, transfer ?? []));
scope.onmessage = (e) => core.handle(e.data);
```

`src/audio/mic.ts`:

```ts
import EngineWorker from './engine.worker.ts?worker';
import workletUrl from './worklet.ts?worker&url';
import type { EngineHandle, FromEngine, OpenEngine } from './protocol';

export const MIC_CONSTRAINTS: MediaStreamConstraints = {
  audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
};

/** Opens the mic once and wires mic → AudioWorklet → engine worker. Reuse the handle for every recording on a screen. */
export const openAudioEngine: OpenEngine = async (): Promise<EngineHandle> => {
  const stream = await navigator.mediaDevices.getUserMedia(MIC_CONSTRAINTS);
  const ctx = new AudioContext();
  try {
    await ctx.resume();
    await ctx.audioWorklet.addModule(workletUrl);
  } catch (err) {
    stream.getTracks().forEach((t) => t.stop());
    await ctx.close();
    throw err;
  }
  const source = ctx.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(ctx, 'japa-capture', { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1 });
  const mute = ctx.createGain();
  mute.gain.value = 0;
  source.connect(node);
  node.connect(mute);
  mute.connect(ctx.destination);

  const worker = new EngineWorker();
  const channel = new MessageChannel();
  node.port.postMessage({ type: 'port', port: channel.port1 }, [channel.port1]);
  worker.postMessage({ type: 'init', inRate: ctx.sampleRate, port: channel.port2 }, [channel.port2]);

  const listeners = new Set<(msg: FromEngine) => void>();
  worker.onmessage = (e: MessageEvent<FromEngine>) => listeners.forEach((l) => l(e.data));

  return {
    ctx,
    send: (msg, transfer) => worker.postMessage(msg, transfer ?? []),
    on: (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    close: async () => {
      listeners.clear();
      stream.getTracks().forEach((t) => t.stop());
      source.disconnect();
      node.disconnect();
      worker.terminate();
      await ctx.close();
    },
  };
};
```

- [ ] **Step 7: Verify types, lint and build**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: all succeed; `dist/assets` contains a worker chunk and a worklet chunk. If Vite rejects `?worker&url` for the worklet, fall back to `new URL('./worklet.ts', import.meta.url)` only if the build output still transpiles it to JS — check the emitted file; report which approach worked.

- [ ] **Step 8: Commit**

```bash
git add src/audio tests/helpers/fake-engine.ts tests/unit/audio/engine-core.test.ts
git commit -m "feat(audio): engine worker core, AudioWorklet capture and mic glue"
```

### Task 11: IndexedDB storage, sample records and re-extraction (F16)

**Files:**
- Create: `src/storage/db.ts`, `src/storage/samples.ts`, `tests/helpers/samples.ts`
- Test: `tests/unit/storage/db.test.ts`, `tests/unit/storage/samples.test.ts`

**Interfaces:**
- Consumes: `encodeWav`, `decodeWav` (Task 8), `extractFrames` (Task 3), `processTake` (Task 5), `ENGINE_VERSION`, constants.
- Produces:
  - `db.ts`:
    ```ts
    export interface SampleRecord {
      id: string; createdAt: number;
      wav: ArrayBuffer;          // 16 kHz mono 16-bit WAV of the chant phase
      durationSec: number;       // trimmed (voiced) duration shown in the row
      trimStart: number; trimEnd: number;   // sample indices into the WAV PCM
      floor: number;             // noise floor (dB) measured during the countdown
      engineVersion: number; take: Take;
      driveFileId?: string; synced: boolean;
    }
    export interface Settings { mantraDevanagari: string; mantraRoman: string; target: number; strictness: number; bell: boolean }
    export interface HistoryEntry { id?: number; at: number; count: number; target: number; secs: number; avgSecsPerChant: number }
    export const DEFAULT_SETTINGS: Settings; export const DB_NAME = 'japa-counter'; export const HISTORY_LIMIT = 200;
    export type JapaDB;
    openDb(name?: string): Promise<JapaDB>
    listSamples(db): Promise<SampleRecord[]>  // oldest first
    getSample(db, id): Promise<SampleRecord | undefined>
    putSample(db, rec): Promise<void>
    deleteSample(db, id): Promise<void>       // queues a Drive delete when the record has driveFileId
    getSettings(db): Promise<Settings>        // defaults merged
    saveSettings(db, s): Promise<void>
    addHistory(db, e: Omit<HistoryEntry, 'id'>): Promise<void>
    listHistory(db): Promise<HistoryEntry[]>  // newest first, max 200
    getMeta<T>(db, key): Promise<T | undefined>; setMeta(db, key, value): Promise<void>
    listPendingDeletes(db): Promise<string[]>; clearPendingDelete(db, driveFileId): Promise<void>
    ```
  - `samples.ts`: `buildSampleFromRecording(pcm16k: Float32Array, floor: number, now?: number, id?: string): SampleRecord | null`, `rebuildFromWav(base: Pick<SampleRecord, 'id' | 'createdAt' | 'wav' | 'floor' | 'synced' | 'driveFileId'>): SampleRecord | null`, `ensureCurrentFeatures(db: JapaDB): Promise<{ updated: number; failed: string[] }>`, `isUsable(s: SampleRecord): boolean` (true when `s.engineVersion === ENGINE_VERSION`), `trimmedWav(s: SampleRecord): ArrayBuffer`
  - **Fix round 1 (user-approved):** `ensureCurrentFeatures` rebuilds each record independently (try/catch per record). A record whose rebuild returns null or throws is left on disk unchanged (old `engineVersion`), listed in `failed`, and is therefore not `isUsable`: later tasks exclude it from counting and its row shows `Couldn’t update this sample. Record it again.`
  - `tests/helpers/samples.ts`: `makeSamplePcm(seed: number): { pcm: Float32Array; floor: number }`, `makeSampleRecord(seed: number, createdAt?: number): SampleRecord`

Key rule: features are always extracted from the **16-bit quantised** PCM (encode → decode), so re-extraction from the stored WAV reproduces them exactly.

- [ ] **Step 1: Write the sample test helper**

`tests/helpers/samples.ts`:

```ts
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
```

- [ ] **Step 2: Write the failing tests**

`tests/unit/storage/db.test.ts`:

```ts
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import {
  addHistory, clearPendingDelete, DEFAULT_SETTINGS, deleteSample, getMeta, getSettings, listHistory,
  listPendingDeletes, listSamples, openDb, putSample, saveSettings, setMeta,
} from '../../../src/storage/db';
import { makeSampleRecord } from '../../helpers/samples';

const fresh = () => openDb(`test-${crypto.randomUUID()}`);

describe('db', () => {
  it('saves, loads and deletes samples (oldest first), keeping typed arrays', async () => {
    const db = await fresh();
    const a = makeSampleRecord(11, 2);
    const b = makeSampleRecord(12, 1);
    await putSample(db, a);
    await putSample(db, b);
    const all = await listSamples(db);
    expect(all.map((s) => s.id)).toEqual([b.id, a.id]);
    expect(all[0].take.frames[0]).toBeInstanceOf(Float32Array);
    expect(all[0].wav.byteLength).toBe(b.wav.byteLength);
    await deleteSample(db, a.id);
    expect((await listSamples(db)).map((s) => s.id)).toEqual([b.id]);
  });

  it('queues a Drive delete when a synced sample is deleted', async () => {
    const db = await fresh();
    await putSample(db, { ...makeSampleRecord(13), driveFileId: 'file-13', synced: true });
    await deleteSample(db, 'sample-13');
    expect(await listPendingDeletes(db)).toEqual(['file-13']);
    await clearPendingDelete(db, 'file-13');
    expect(await listPendingDeletes(db)).toEqual([]);
  });

  it('returns default settings, then saved ones', async () => {
    const db = await fresh();
    expect(await getSettings(db)).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS).toEqual({
      mantraDevanagari: 'ॐ नमः शिवाय',
      mantraRoman: 'om namah shivaya',
      target: 108,
      strictness: 1,
      bell: true,
    });
    await saveSettings(db, { ...DEFAULT_SETTINGS, target: 1008 });
    expect((await getSettings(db)).target).toBe(1008);
  });

  it('lists history newest first, capped at 200', async () => {
    const db = await fresh();
    for (let i = 0; i < 205; i++) await addHistory(db, { at: i, count: 1, target: 1, secs: 1, avgSecsPerChant: 1 });
    const h = await listHistory(db);
    expect(h).toHaveLength(200);
    expect(h[0].at).toBe(204);
  });

  it('stores meta values', async () => {
    const db = await fresh();
    expect(await getMeta(db, 'micExplained')).toBeUndefined();
    await setMeta(db, 'micExplained', true);
    expect(await getMeta<boolean>(db, 'micExplained')).toBe(true);
  });
});
```

`tests/unit/storage/samples.test.ts`:

```ts
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { decodeWav } from '../../../src/audio/wav';
import { FRAME, HOP, SR } from '../../../src/engine/constants';
import { ENGINE_VERSION } from '../../../src/engine/version';
import { getSample, openDb, putSample } from '../../../src/storage/db';
import { buildSampleFromRecording, ensureCurrentFeatures, rebuildFromWav, trimmedWav } from '../../../src/storage/samples';
import { makeSamplePcm, makeSampleRecord } from '../../helpers/samples';

describe('buildSampleFromRecording', () => {
  it('stores the whole chant phase as WAV and the voiced span as trim points', () => {
    const { pcm, floor } = makeSamplePcm(21);
    const rec = buildSampleFromRecording(pcm, floor, 5, 'x')!;
    expect(rec).toMatchObject({ id: 'x', createdAt: 5, floor, engineVersion: ENGINE_VERSION, synced: false });
    expect(decodeWav(rec.wav).pcm.length).toBe(pcm.length);
    expect(rec.trimStart).toBe(rec.take.start * HOP);
    expect(rec.trimEnd).toBe(Math.min(pcm.length, rec.take.end * HOP + FRAME));
    expect(rec.durationSec).toBeCloseTo((rec.trimEnd - rec.trimStart) / SR, 9);
    expect(rec.trimStart).toBeGreaterThan(0.4 * SR); // leading 0.6 s of room noise trimmed
  });

  it('returns null when there is no full chant', () => {
    const { floor } = makeSamplePcm(22);
    expect(buildSampleFromRecording(new Float32Array(SR), floor)).toBeNull();
  });
});

describe('rebuildFromWav', () => {
  it('re-extracts exactly the same features from the stored WAV', () => {
    const rec = makeSampleRecord(23);
    const again = rebuildFromWav(rec)!;
    expect(again.take.frames.length).toBe(rec.take.frames.length);
    expect(Array.from(again.take.frames[10])).toEqual(Array.from(rec.take.frames[10]));
    expect(again.trimStart).toBe(rec.trimStart);
  });
});

describe('ensureCurrentFeatures', () => {
  it('re-extracts samples cached by another engine version and leaves current ones alone', async () => {
    const db = await openDb(`test-${crypto.randomUUID()}`);
    const stale = makeSampleRecord(24);
    await putSample(db, { ...stale, engineVersion: 0, take: { frames: [], mean: new Float32Array(12), dur: 0, start: 0, end: 0 }, synced: true, driveFileId: 'f' });
    await putSample(db, makeSampleRecord(25));
    expect(await ensureCurrentFeatures(db)).toBe(1);
    const fixed = (await getSample(db, stale.id))!;
    expect(fixed.engineVersion).toBe(ENGINE_VERSION);
    expect(fixed.take.frames.length).toBe(stale.take.frames.length);
    expect(fixed).toMatchObject({ synced: true, driveFileId: 'f' });
    expect(await ensureCurrentFeatures(db)).toBe(0);
  });
});

describe('trimmedWav', () => {
  it('encodes only the voiced span', () => {
    const rec = makeSampleRecord(26);
    expect(decodeWav(trimmedWav(rec)).pcm.length).toBe(rec.trimEnd - rec.trimStart);
  });
});
```

- [ ] **Step 3: Run to see them fail**

Run: `npx vitest run tests/unit/storage`
Expected: FAIL — modules missing.

- [ ] **Step 4: Implement**

`src/storage/db.ts`:

```ts
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
```

`src/storage/samples.ts`:

```ts
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

/** Re-extracts features for samples cached by another engine version. Returns how many were updated. */
export async function ensureCurrentFeatures(db: JapaDB): Promise<number> {
  let updated = 0;
  for (const s of await listSamples(db)) {
    if (s.engineVersion === ENGINE_VERSION) continue;
    const rebuilt = rebuildFromWav(s);
    if (rebuilt) {
      await putSample(db, rebuilt);
      updated++;
    }
  }
  return updated;
}

export function trimmedWav(s: SampleRecord): ArrayBuffer {
  const { pcm } = decodeWav(s.wav);
  return encodeWav(pcm.subarray(s.trimStart, s.trimEnd), SR);
}
```

- [ ] **Step 5: Run to see them pass**

Run: `npx vitest run tests/unit/storage`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/storage tests/helpers/samples.ts tests/unit/storage
git commit -m "feat(storage): IndexedDB store, sample records and feature re-extraction"
```

### Task 12: App store, styles and Setup screen (mantra, target, Start, Settings)

**Files:**
- Create: `src/state/store.ts`, `src/ui/Setup.tsx`, `src/ui/Settings.tsx`, `src/ui/styles.css`, `tests/setup.ts`, `tests/helpers/store.ts`
- Modify: `src/ui/App.tsx`, `src/main.tsx`, `vite.config.ts` (add `setupFiles: ['tests/setup.ts']`)
- Test: `tests/unit/state/store.test.ts`, `tests/unit/ui/setup.test.tsx`

**Interfaces:**
- Consumes: storage (Task 11), `calibrate`, `flagOutliers`, `liveThreshold`, `STRICTNESS_STEPS` (Task 5).
- Produces:
  - `store.ts`: `MIN_SAMPLES = 3`, `MAX_SAMPLES = 10`, `MAX_TARGET = 100_000`, `isValidTarget(n: number): boolean`, `createStore(db: JapaDB): Store`, `StoreContext`, `useStore(): Store`, and
    ```ts
    export interface Store {
      readonly db: JapaDB;
      readonly settings: Signal<Settings>;
      readonly samples: Signal<SampleRecord[]>;
      readonly history: Signal<HistoryEntry[]>;
      readonly screen: Signal<'setup' | 'session'>;
      readonly micExplained: Signal<boolean>;
      readonly usableSamples: ReadonlySignal<SampleRecord[]>;     // samples with current-engine features (isUsable)
      readonly calibration: ReadonlySignal<Calibration | null>;  // from usableSamples; null below MIN_SAMPLES usable
      readonly outliers: ReadonlySignal<boolean[]>;               // one flag per entry of samples (false for unusable ones)
      readonly threshold: ReadonlySignal<number | null>;          // base × strictness
      readonly sampleFloor: ReadonlySignal<number>;               // mean floor of usableSamples, −60 when none
      readonly canStart: ReadonlySignal<boolean>;
      load(): Promise<void>;                                      // runs ensureCurrentFeatures first
      updateSettings(patch: Partial<Settings>): Promise<void>;
      addSample(rec: SampleRecord): Promise<void>;
      removeSample(id: string): Promise<void>;
      refreshSamples(): Promise<void>;
      recordSession(entry: Omit<HistoryEntry, 'id'>): Promise<void>;
      markMicExplained(): Promise<void>;
      onLocalChange(listener: () => void): () => void;            // fired after addSample / removeSample
    }
    ```
  - `tests/helpers/store.ts`: `makeStore(sampleSeeds?: number[]): Promise<Store>` (fake-indexeddb, unique DB name, samples pre-loaded, `load()` already called).
  - `Setup` component: `export function Setup(): JSX.Element` (Task 13 adds an `openEngine` prop).
  - `Settings` component: `export function Settings(): JSX.Element`.

Copy and layout (spec "Setup screen"): one narrow column, no cards, no shadows, no caps labels. Blocks top to bottom: Mantra (Devanagari textarea + roman input), Voice samples (hint text; recorder arrives in Task 13), Target (number input labelled "Target" + preset buttons `108`, `1008`), Start button. Then a small "Settings" text link that reveals strictness, bell toggle and history.

Hint under Voice samples: fewer than 3 samples → `Record at least 3 samples to start. 6 to 8 work best.`; 3 to 5 → `Ready to start. 6 to 8 samples work best.`; 6 or more → nothing.

Strictness labels (one radio per step, in order): `Strictest`, `Very strict`, `Stricter`, `Strict (default)`, `Relaxed`, `Most relaxed`, with the help line `Stricter may miss a chant now and then. Relaxed may count something that isn’t one.`
Bell toggle label: `Soft bell every 108`.
History row: `<date, e.g. 2 Nov 2026, 14:02> · <count> / <target> · <duration via formatDuration from Task 14 — for now render seconds as "<n>s"> · <avg toFixed(1)> s per chant`. (Task 14 switches the duration to `formatDuration`.) Empty history: `No sessions yet.`

- [ ] **Step 1: Test infrastructure**

`tests/setup.ts`:

```ts
import { afterEach } from 'vitest';

afterEach(async () => {
  if (typeof document !== 'undefined') {
    const { cleanup } = await import('@testing-library/preact');
    cleanup();
  }
});
```

Add `setupFiles: ['tests/setup.ts'],` to the `test` block in `vite.config.ts`.

`tests/helpers/store.ts`:

```ts
import 'fake-indexeddb/auto';
import { createStore, type Store } from '../../src/state/store';
import { openDb, putSample } from '../../src/storage/db';
import { makeSampleRecord } from './samples';

export async function makeStore(sampleSeeds: number[] = []): Promise<Store> {
  const db = await openDb(`test-${crypto.randomUUID()}`);
  for (const seed of sampleSeeds) await putSample(db, makeSampleRecord(seed));
  const store = createStore(db);
  await store.load();
  return store;
}
```

- [ ] **Step 2: Write the failing tests**

`tests/unit/state/store.test.ts`:

```ts
import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import { isValidTarget } from '../../../src/state/store';
import { getSettings, listPendingDeletes } from '../../../src/storage/db';
import { makeSampleRecord } from '../../helpers/samples';
import { makeStore } from '../../helpers/store';

describe('store', () => {
  it('loads defaults and has no calibration below 3 samples', async () => {
    const store = await makeStore([31, 32]);
    expect(store.settings.value.target).toBe(108);
    expect(store.samples.value).toHaveLength(2);
    expect(store.calibration.value).toBeNull();
    expect(store.canStart.value).toBe(false);
  });

  it('calibrates with 3 samples and exposes the live threshold', async () => {
    const store = await makeStore([31, 32, 33]);
    const cal = store.calibration.value!;
    expect(store.threshold.value).toBeCloseTo(cal.base * 1.0);
    await store.updateSettings({ strictness: 0.9 });
    expect(store.threshold.value).toBeCloseTo(cal.base * 0.9);
    expect(store.canStart.value).toBe(true);
    expect(store.outliers.value).toHaveLength(3);
    expect(store.sampleFloor.value).toBeCloseTo(store.samples.value.reduce((a, s) => a + s.floor, 0) / 3);
  });

  it('leaves samples without current-engine features out of calibration', async () => {
    const store = await makeStore([31, 32, 33]);
    await store.addSample({ ...makeSampleRecord(35), engineVersion: 0 });
    expect(store.samples.value).toHaveLength(4);
    expect(store.usableSamples.value).toHaveLength(3);
    expect(store.outliers.value).toHaveLength(4);
    expect(store.outliers.value[3]).toBe(false);
  });

  it('persists settings', async () => {
    const store = await makeStore();
    await store.updateSettings({ target: 1008 });
    expect((await getSettings(store.db)).target).toBe(1008);
  });

  it('cannot start with an invalid target', async () => {
    const store = await makeStore([31, 32, 33]);
    await store.updateSettings({ target: 0 });
    expect(store.canStart.value).toBe(false);
  });

  it('adds and removes samples, notifying local-change listeners', async () => {
    const store = await makeStore();
    const spy = vi.fn();
    store.onLocalChange(spy);
    await store.addSample(makeSampleRecord(34));
    expect(store.samples.value).toHaveLength(1);
    await store.removeSample('sample-34');
    expect(store.samples.value).toHaveLength(0);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(await listPendingDeletes(store.db)).toEqual([]);
  });

  it('records sessions newest first', async () => {
    const store = await makeStore();
    await store.recordSession({ at: 1, count: 5, target: 108, secs: 15, avgSecsPerChant: 3 });
    await store.recordSession({ at: 2, count: 6, target: 108, secs: 18, avgSecsPerChant: 3 });
    expect(store.history.value.map((h) => h.at)).toEqual([2, 1]);
  });

  it('remembers that the mic was explained', async () => {
    const store = await makeStore();
    expect(store.micExplained.value).toBe(false);
    await store.markMicExplained();
    expect(store.micExplained.value).toBe(true);
  });

  it('validates targets 1..100,000', () => {
    expect([0, 1, 108, 100000, 100001, 1.5, NaN].map(isValidTarget)).toEqual([false, true, true, true, false, false, false]);
  });
});
```

`tests/unit/ui/setup.test.tsx`:

```tsx
// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
import { fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { describe, expect, it } from 'vitest';
import { StoreContext, type Store } from '../../../src/state/store';
import { getSettings } from '../../../src/storage/db';
import { Setup } from '../../../src/ui/Setup';
import { makeStore } from '../../helpers/store';

const renderSetup = (store: Store) => render(<StoreContext.Provider value={store}><Setup /></StoreContext.Provider>);

describe('Setup', () => {
  it('shows the default mantra and target 108', async () => {
    renderSetup(await makeStore());
    expect(screen.getByLabelText('Mantra (Devanagari)')).toHaveProperty('value', 'ॐ नमः शिवाय');
    expect(screen.getByLabelText('Mantra (roman)')).toHaveProperty('value', 'om namah shivaya');
    expect(screen.getByLabelText('Target')).toHaveProperty('value', '108');
  });

  it('disables Start until 3 samples exist', async () => {
    renderSetup(await makeStore([41, 42]));
    expect(screen.getByRole('button', { name: 'Start' })).toHaveProperty('disabled', true);
    expect(screen.getByText('Record at least 3 samples to start. 6 to 8 work best.')).toBeTruthy();
  });

  it('enables Start with 3 samples and a valid target; Start switches to the session screen', async () => {
    const store = await makeStore([41, 42, 43]);
    renderSetup(store);
    const start = screen.getByRole('button', { name: 'Start' });
    expect(start).toHaveProperty('disabled', false);
    fireEvent.click(start);
    expect(store.screen.value).toBe('session');
  });

  it('presets set and persist the target', async () => {
    const store = await makeStore();
    renderSetup(store);
    fireEvent.click(screen.getByRole('button', { name: '1008' }));
    await waitFor(async () => expect((await getSettings(store.db)).target).toBe(1008));
    expect(screen.getByLabelText('Target')).toHaveProperty('value', '1008');
  });

  it('rejects targets outside 1 to 100,000', async () => {
    const store = await makeStore([41, 42, 43]);
    renderSetup(store);
    fireEvent.input(screen.getByLabelText('Target'), { target: { value: '100001' } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Start' })).toHaveProperty('disabled', true));
    fireEvent.input(screen.getByLabelText('Target'), { target: { value: '27' } });
    await waitFor(() => expect(store.settings.value.target).toBe(27));
  });

  it('persists mantra edits', async () => {
    const store = await makeStore();
    renderSetup(store);
    fireEvent.change(screen.getByLabelText('Mantra (roman)'), { target: { value: 'om namah shivaya' } });
    await waitFor(async () => expect((await getSettings(store.db)).mantraRoman).toBe('om namah shivaya'));
  });

  it('Settings link reveals strictness, bell and history; changing strictness persists', async () => {
    const store = await makeStore();
    renderSetup(store);
    expect(screen.queryByRole('radio', { name: 'Strictest' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(screen.getAllByRole('radio')).toHaveLength(6);
    expect(screen.getByRole('radio', { name: 'Strict (default)' })).toHaveProperty('checked', true);
    expect(screen.getByRole('checkbox', { name: 'Soft bell every 108' })).toHaveProperty('checked', true);
    expect(screen.getByText('No sessions yet.')).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: 'Relaxed' }));
    await waitFor(async () => expect((await getSettings(store.db)).strictness).toBe(1.05));
  });
});
```

- [ ] **Step 3: Run to see them fail**

Run: `npx vitest run tests/unit/state tests/unit/ui`
Expected: FAIL — modules missing.

- [ ] **Step 4: Implement `src/state/store.ts`**

```ts
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
```

- [ ] **Step 5: Implement the UI**

`src/ui/Settings.tsx`:

```tsx
import { STRICTNESS_STEPS } from '../engine/calibrate';
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
              {dateFmt.format(h.at)} · {h.count} / {h.target} · {Math.round(h.secs)}s · {h.avgSecsPerChant.toFixed(1)} s per chant
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

`src/ui/Setup.tsx`:

```tsx
import { useState } from 'preact/hooks';
import { isValidTarget, MIN_SAMPLES, useStore } from '../state/store';
import { Settings } from './Settings';

const PRESETS = [108, 1008];

function hintFor(n: number): string | null {
  if (n < MIN_SAMPLES) return 'Record at least 3 samples to start. 6 to 8 work best.';
  if (n < 6) return 'Ready to start. 6 to 8 samples work best.';
  return null;
}

export function Setup() {
  const store = useStore();
  const s = store.settings.value;
  const [targetText, setTargetText] = useState(String(s.target));
  const [showSettings, setShowSettings] = useState(false);
  const hint = hintFor(store.samples.value.length);

  const setTarget = (text: string) => {
    setTargetText(text);
    void store.updateSettings({ target: Number(text) }); // '' → 0, which isValidTarget rejects
  };

  return (
    <main class="setup">
      <section aria-labelledby="mantra-h">
        <h2 id="mantra-h">Mantra</h2>
        <label class="sr-only" for="mantra-dev">Mantra (Devanagari)</label>
        <textarea id="mantra-dev" class="mantra-input" lang="sa" rows={2} value={s.mantraDevanagari}
          onChange={(e) => void store.updateSettings({ mantraDevanagari: e.currentTarget.value })} />
        <label class="sr-only" for="mantra-roman">Mantra (roman)</label>
        <input id="mantra-roman" class="mantra-roman-input" value={s.mantraRoman}
          onChange={(e) => void store.updateSettings({ mantraRoman: e.currentTarget.value })} />
      </section>

      <section aria-labelledby="samples-h">
        <h2 id="samples-h">Voice samples</h2>
        {hint && <p class="hint">{hint}</p>}
      </section>

      <section aria-labelledby="target-h">
        <h2 id="target-h">Target</h2>
        <div class="target-row">
          <input id="target" aria-label="Target" type="number" inputMode="numeric" min={1} max={100000} step={1}
            value={targetText} aria-invalid={!isValidTarget(Number(targetText))}
            onInput={(e) => setTarget(e.currentTarget.value)} />
          {PRESETS.map((p) => (
            <button key={p} type="button" class="preset" aria-pressed={s.target === p} onClick={() => setTarget(String(p))}>{p}</button>
          ))}
        </div>
      </section>

      <button type="button" class="start" disabled={!store.canStart.value} onClick={() => (store.screen.value = 'session')}>Start</button>

      <button type="button" class="link" aria-expanded={showSettings} onClick={() => setShowSettings(!showSettings)}>Settings</button>
      {showSettings && <Settings />}
    </main>
  );
}
```

`src/ui/App.tsx`:

```tsx
import { StoreContext, type Store } from '../state/store';
import { Setup } from './Setup';

export function App({ store }: { store: Store }) {
  return (
    <StoreContext.Provider value={store}>
      <Setup />
    </StoreContext.Provider>
  );
}
```

`src/main.tsx`:

```tsx
import '@fontsource/hanken-grotesk/400.css';
import '@fontsource/hanken-grotesk/500.css';
import '@fontsource/tiro-devanagari-sanskrit/400.css';
import './ui/styles.css';
import { render } from 'preact';
import { createStore } from './state/store';
import { openDb } from './storage/db';
import { App } from './ui/App';

async function boot() {
  const store = createStore(await openDb());
  await store.load();
  render(<App store={store} />, document.getElementById('app')!);
}

void boot();
```

`src/ui/styles.css` (tokens from the spec; no shadows, cards or caps):

```css
:root {
  --setup-bg: #f5f4f2;
  --setup-fg: #1c1b19;
  --setup-muted: #6b665e;
  --setup-line: #d9d5ce;
  --session-bg: #000000;
  --mantra: #e6dccb;
  --count: #6f675c;
  --count-bright: #a39a8c;
  --timer: #4a443c;
  --font-body: 'Hanken Grotesk', system-ui, sans-serif;
  --font-mantra: 'Tiro Devanagari Sanskrit', 'Noto Serif Devanagari', serif;
  color-scheme: light dark;
}
@media (prefers-color-scheme: dark) {
  :root { --setup-bg: #0a0a0a; --setup-fg: #e8e4dc; --setup-muted: #8d877d; --setup-line: #2a2824; }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--setup-bg); color: var(--setup-fg); font: 16px/1.5 var(--font-body); }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }

.setup { max-width: 34rem; margin: 0 auto; padding: 3rem 1.25rem 4rem; display: flex; flex-direction: column; gap: 2.25rem; }
.setup h2 { font-size: 0.95rem; font-weight: 500; margin: 0 0 0.6rem; color: var(--setup-muted); }
.setup h3 { font-size: 0.95rem; font-weight: 500; margin: 1.5rem 0 0.4rem; color: var(--setup-muted); }
.hint { color: var(--setup-muted); font-size: 0.9rem; margin: 0.4rem 0 0; }
.mantra-input, .mantra-roman-input, #target {
  width: 100%; background: transparent; color: inherit; border: 0; border-bottom: 1px solid var(--setup-line);
  padding: 0.35rem 0; font: inherit;
}
.mantra-input { font-family: var(--font-mantra); font-size: 1.5rem; resize: vertical; }
.target-row { display: flex; gap: 0.75rem; align-items: baseline; }
#target { width: 8rem; }
button { font: inherit; color: inherit; background: transparent; border: 1px solid var(--setup-line); border-radius: 4px; padding: 0.4rem 0.9rem; cursor: pointer; }
button:disabled { opacity: 0.4; cursor: default; }
button.link { border: 0; padding: 0; text-decoration: underline; color: var(--setup-muted); align-self: flex-start; }
button.start { align-self: flex-start; padding: 0.6rem 2rem; border-color: currentColor; }
.preset[aria-pressed='true'] { border-color: currentColor; }
.settings fieldset { border: 0; padding: 0; margin: 0; }
.settings legend { color: var(--setup-muted); font-size: 0.95rem; margin-bottom: 0.4rem; }
.radio, .checkbox { display: block; padding: 0.15rem 0; }
.history { list-style: none; padding: 0; margin: 0; font-size: 0.9rem; color: var(--setup-muted); }
```

- [ ] **Step 6: Run to see them pass**

Run: `npx vitest run tests/unit/state tests/unit/ui && npm run typecheck && npm run lint`
Expected: PASS. If happy-dom needs `toHaveProperty('value', …)` replaced by `.value` reads, adjust the assertion style only.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(ui): app store and minimal setup screen with settings"
```

### Task 13: Recording flow UI (Recorder) and sample rows

**Files:**
- Create: `src/ui/Recorder.tsx`, `src/ui/SampleRow.tsx`, `src/ui/useClipPlayer.ts`
- Modify: `src/ui/Setup.tsx` (render `Recorder` and the sample list; accept `openEngine`), `src/ui/App.tsx` and `src/main.tsx` (pass `openAudioEngine`), `src/ui/styles.css`, `tests/setup.ts` (media + object-URL stubs), `tests/unit/ui/setup.test.tsx` (pass a dummy `openEngine`)
- Test: `tests/unit/ui/recorder.test.tsx`, `tests/unit/ui/sample-row.test.tsx`

**Interfaces:**
- Consumes: `AutoStop` (Task 9), `EngineHandle`, `OpenEngine`, `FakeEngine` (Task 10), `buildSampleFromRecording`, `trimmedWav` (Task 11), `waveformPeaks`, `decodeWav` (Task 8), store (Task 12).
- Produces: `Recorder({ openEngine }: { openEngine: OpenEngine })`, `SampleRow({ sample, index, flagged, onDelete }: { sample: SampleRecord; index: number; flagged: boolean; onDelete: () => void })`, `useClipPlayer(wav: ArrayBuffer): { playing: boolean; toggle(): void }`, `Setup({ openEngine }: { openEngine: OpenEngine })`, `App({ store, openEngine })`.

Flow (spec "Recording flow", Locked):
1. Idle: button `Record a sample` and under it `You’ll chant the mantra once. Recording stops when you go quiet.`
2. First visit only (`store.micExplained` false): `Your browser will ask to use the microphone` + button `Continue`. Continue → `markMicExplained()` → open the engine.
3. The engine is opened once per Setup visit and reused for every take; closed when Setup unmounts.
4. Countdown: text `Stay quiet…`, the digit (3, 2, 1), a level line (`role="meter"`, `aria-label="Microphone level"`), and `Stop`.
5. Chant: `Chant once now.`, level line, `Stop`.
6. When `AutoStop` reports `stopped`, or Stop is pressed, send `rec-stop`; on `rec-pcm`, if the take never reached the chant phase go back to idle; otherwise `buildSampleFromRecording(pcm.subarray(auto.chantStartSample), auto.floor)`. `null` → `Didn’t catch a full chant. Try again, a little closer to the mic.` + `Redo`. Otherwise Review.
7. Review: waveform (SVG, 120 bars from the trimmed PCM, `aria-label="Waveform"`), play/pause (`Play` / `Pause`), `Keep`, `Redo`. Nothing is saved until Keep.
8. Keep → `store.addSample` → idle with `Sample N saved.` Redo → straight back to the countdown (no explanation, no new engine).
9. Mic errors: `NotAllowedError` → `Microphone blocked. Allow it from the address bar, then try again.`; `NotFoundError` → `No microphone found.`; other → `Couldn’t open the microphone.`
10. With 10 samples, the record button is disabled and the line reads `10 samples is the most the counter uses. Delete one to record another.`

Sample row (spec "Sample list row"): a row whose sample is not `isUsable` (F16 rebuild failed) also shows `Couldn’t update this sample. Record it again.` `Sample 3   2.6 s   ▶ / ❚❚   Download   Delete   ✓ synced` plus, when flagged, `Sounds different from the others. Consider recording it again.` Play button accessible names `Play sample 3` / `Pause sample 3`. Download is a link with `download="japa-sample-3.wav"` to the stored WAV. Delete asks first: `Delete` → `Yes, delete` / `Cancel`. `✓ synced` shows when `sample.synced`.

- [ ] **Step 1: Extend test setup with media stubs**

Append to `tests/setup.ts`:

```ts
import { vi } from 'vitest';

if (typeof window !== 'undefined') {
  window.HTMLMediaElement.prototype.play = vi.fn(function (this: HTMLMediaElement) {
    this.dispatchEvent(new Event('play'));
    return Promise.resolve();
  });
  window.HTMLMediaElement.prototype.pause = vi.fn(function (this: HTMLMediaElement) {
    this.dispatchEvent(new Event('pause'));
  });
  if (!URL.createObjectURL) URL.createObjectURL = () => 'blob:test';
  if (!URL.revokeObjectURL) URL.revokeObjectURL = () => {};
}
```

(Keep the existing `afterEach` cleanup; move the `vi` import to the top of the file.)

- [ ] **Step 2: Write the failing tests**

`tests/unit/ui/recorder.test.tsx`:

```tsx
// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { describe, expect, it, vi } from 'vitest';
import { COUNTDOWN_FRAMES } from '../../../src/recording/autostop';
import { StoreContext, type Store } from '../../../src/state/store';
import { Recorder } from '../../../src/ui/Recorder';
import { FakeEngine } from '../../helpers/fake-engine';
import { makeSamplePcm } from '../../helpers/samples';
import { makeStore } from '../../helpers/store';

function setup(store: Store, engine = new FakeEngine()) {
  const openEngine = vi.fn(async () => engine);
  render(<StoreContext.Provider value={store}><Recorder openEngine={openEngine} /></StoreContext.Provider>);
  return { engine, openEngine };
}
const frames = (engine: FakeEngine, db: number, n: number) => act(() => { for (let i = 0; i < n; i++) engine.emit({ type: 'frame', db }); });
/** 3 s of countdown audio followed by a real chant-phase recording. */
function recordingPcm(seed = 51) {
  const { pcm } = makeSamplePcm(seed);
  const out = new Float32Array(COUNTDOWN_FRAMES * 320 + pcm.length);
  out.set(pcm, COUNTDOWN_FRAMES * 320);
  return out;
}
async function runTake(engine: FakeEngine, pcm = recordingPcm()) {
  await frames(engine, -60, COUNTDOWN_FRAMES);
  await frames(engine, -20, 100);
  await frames(engine, -60, 40);
  expect(engine.sentTypes()).toContain('rec-stop');
  await act(() => engine.emit({ type: 'rec-pcm', pcm }));
}

describe('Recorder', () => {
  it('explains before asking for the mic on the first visit, then counts down', async () => {
    const store = await makeStore();
    const { engine, openEngine } = setup(store);
    expect(screen.getByText('You’ll chant the mantra once. Recording stops when you go quiet.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Record a sample' }));
    expect(screen.getByText('Your browser will ask to use the microphone')).toBeTruthy();
    expect(openEngine).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(engine.sentTypes()).toEqual(['rec-start']));
    expect(screen.getByText('Stay quiet…')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
    expect(store.micExplained.value).toBe(true);
  });

  it('switches to "Chant once now." after the countdown, auto-stops and shows the review', async () => {
    const store = await makeStore();
    await store.markMicExplained();
    const { engine } = setup(store);
    fireEvent.click(screen.getByRole('button', { name: 'Record a sample' }));
    await waitFor(() => expect(engine.sentTypes()).toEqual(['rec-start']));
    await frames(engine, -60, COUNTDOWN_FRAMES);
    expect(screen.getByText('Chant once now.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Stop' })).toBeTruthy();
    await frames(engine, -20, 100);
    await frames(engine, -60, 40);
    await act(() => engine.emit({ type: 'rec-pcm', pcm: recordingPcm() }));
    expect(screen.getByRole('button', { name: 'Keep' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Redo' })).toBeTruthy();
    expect(screen.getByLabelText('Waveform')).toBeTruthy();
    expect(store.samples.value).toHaveLength(0); // nothing saved before Keep
  });

  it('Keep saves the sample; the next take reuses the open mic without re-explaining', async () => {
    const store = await makeStore();
    await store.markMicExplained();
    const { engine, openEngine } = setup(store);
    fireEvent.click(screen.getByRole('button', { name: 'Record a sample' }));
    await waitFor(() => expect(engine.sentTypes()).toEqual(['rec-start']));
    await runTake(engine);
    fireEvent.click(screen.getByRole('button', { name: 'Keep' }));
    await waitFor(() => expect(store.samples.value).toHaveLength(1));
    expect(screen.getByText('Sample 1 saved.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Record a sample' }));
    await waitFor(() => expect(engine.sentTypes().filter((t) => t === 'rec-start')).toHaveLength(2));
    expect(openEngine).toHaveBeenCalledTimes(1);
  });

  it('Redo goes straight back to the countdown', async () => {
    const store = await makeStore();
    await store.markMicExplained();
    const { engine } = setup(store);
    fireEvent.click(screen.getByRole('button', { name: 'Record a sample' }));
    await waitFor(() => expect(engine.sentTypes()).toEqual(['rec-start']));
    await runTake(engine);
    fireEvent.click(screen.getByRole('button', { name: 'Redo' }));
    await waitFor(() => expect(screen.getByText('Stay quiet…')).toBeTruthy());
    expect(engine.sentTypes().filter((t) => t === 'rec-start')).toHaveLength(2);
  });

  it('Stop ends the take early', async () => {
    const store = await makeStore();
    await store.markMicExplained();
    const { engine } = setup(store);
    fireEvent.click(screen.getByRole('button', { name: 'Record a sample' }));
    await waitFor(() => expect(engine.sentTypes()).toEqual(['rec-start']));
    await frames(engine, -60, COUNTDOWN_FRAMES);
    await frames(engine, -20, 10);
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(engine.sentTypes()).toEqual(['rec-start', 'rec-stop']);
  });

  it('explains when no full chant was caught', async () => {
    const store = await makeStore();
    await store.markMicExplained();
    const { engine } = setup(store);
    fireEvent.click(screen.getByRole('button', { name: 'Record a sample' }));
    await waitFor(() => expect(engine.sentTypes()).toEqual(['rec-start']));
    await runTake(engine, new Float32Array(COUNTDOWN_FRAMES * 320 + 32000));
    expect(screen.getByText('Didn’t catch a full chant. Try again, a little closer to the mic.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Redo' })).toBeTruthy();
  });

  it('shows a clear message when the mic is blocked', async () => {
    const store = await makeStore();
    await store.markMicExplained();
    render(
      <StoreContext.Provider value={store}>
        <Recorder openEngine={async () => { throw new DOMException('denied', 'NotAllowedError'); }} />
      </StoreContext.Provider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Record a sample' }));
    await waitFor(() => expect(screen.getByText('Microphone blocked. Allow it from the address bar, then try again.')).toBeTruthy());
  });

  it('closes the mic when the setup screen goes away', async () => {
    const store = await makeStore();
    await store.markMicExplained();
    const engine = new FakeEngine();
    const view = render(<StoreContext.Provider value={store}><Recorder openEngine={async () => engine} /></StoreContext.Provider>);
    fireEvent.click(screen.getByRole('button', { name: 'Record a sample' }));
    await waitFor(() => expect(engine.sentTypes()).toEqual(['rec-start']));
    view.unmount();
    expect(engine.closed).toBe(true);
  });

  it('caps samples at 10', async () => {
    const store = await makeStore([61, 62, 63, 64, 65, 66, 67, 68, 69, 70]);
    setup(store);
    expect(screen.getByRole('button', { name: 'Record a sample' })).toHaveProperty('disabled', true);
    expect(screen.getByText('10 samples is the most the counter uses. Delete one to record another.')).toBeTruthy();
  });
});
```

`tests/unit/ui/sample-row.test.tsx`:

```tsx
// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/preact';
import { describe, expect, it, vi } from 'vitest';
import { SampleRow } from '../../../src/ui/SampleRow';
import { makeSampleRecord } from '../../helpers/samples';

const sample = makeSampleRecord(71);

describe('SampleRow', () => {
  it('shows name, trimmed duration and a download link for the WAV', () => {
    render(<ul><SampleRow sample={sample} index={2} flagged={false} onDelete={() => {}} /></ul>);
    expect(screen.getByText('Sample 3')).toBeTruthy();
    expect(screen.getByText(`${sample.durationSec.toFixed(1)} s`)).toBeTruthy();
    const link = screen.getByRole('link', { name: 'Download' });
    expect(link.getAttribute('download')).toBe('japa-sample-3.wav');
  });

  it('play toggles to pause', async () => {
    render(<ul><SampleRow sample={sample} index={0} flagged={false} onDelete={() => {}} /></ul>);
    fireEvent.click(screen.getByRole('button', { name: 'Play sample 1' }));
    expect(await screen.findByRole('button', { name: 'Pause sample 1' })).toBeTruthy();
  });

  it('asks before deleting', () => {
    const onDelete = vi.fn();
    render(<ul><SampleRow sample={sample} index={0} flagged={false} onDelete={onDelete} /></ul>);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onDelete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Yes, delete' }));
    expect(onDelete).toHaveBeenCalledOnce();
  });

  it('flags a sample the current engine could not rebuild', () => {
    render(<ul><SampleRow sample={{ ...sample, engineVersion: 0 }} index={0} flagged={false} onDelete={() => {}} /></ul>);
    expect(screen.getByText('Couldn’t update this sample. Record it again.')).toBeTruthy();
  });

  it('shows the synced tick and the "sounds different" note', () => {
    render(<ul><SampleRow sample={{ ...sample, synced: true }} index={0} flagged={true} onDelete={() => {}} /></ul>);
    expect(screen.getByText('✓ synced')).toBeTruthy();
    expect(screen.getByText('Sounds different from the others. Consider recording it again.')).toBeTruthy();
  });
});
```

- [ ] **Step 3: Run to see them fail**

Run: `npx vitest run tests/unit/ui/recorder.test.tsx tests/unit/ui/sample-row.test.tsx`
Expected: FAIL — modules missing.

- [ ] **Step 4: Implement**

`src/ui/useClipPlayer.ts`:

```ts
import { useEffect, useMemo, useState } from 'preact/hooks';

/** Plays a WAV buffer through an <audio> element; one player per clip. */
export function useClipPlayer(wav: ArrayBuffer): { playing: boolean; toggle(): void } {
  const audio = useMemo(() => {
    const el = new Audio(URL.createObjectURL(new Blob([wav], { type: 'audio/wav' })));
    el.preload = 'none';
    return el;
  }, [wav]);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    const on = () => setPlaying(true);
    const off = () => setPlaying(false);
    audio.addEventListener('play', on);
    audio.addEventListener('pause', off);
    audio.addEventListener('ended', off);
    return () => {
      audio.pause();
      audio.removeEventListener('play', on);
      audio.removeEventListener('pause', off);
      audio.removeEventListener('ended', off);
      URL.revokeObjectURL(audio.src);
    };
  }, [audio]);
  return {
    playing,
    toggle: () => {
      if (audio.paused) {
        audio.currentTime = 0;
        void audio.play();
      } else audio.pause();
    },
  };
}
```

`src/ui/SampleRow.tsx`:

```tsx
import { useEffect, useMemo, useState } from 'preact/hooks';
import type { SampleRecord } from '../storage/db';
import { isUsable, trimmedWav } from '../storage/samples';
import { useClipPlayer } from './useClipPlayer';

interface Props {
  sample: SampleRecord;
  index: number;
  flagged: boolean;
  onDelete: () => void;
}

export function SampleRow({ sample, index, flagged, onDelete }: Props) {
  const n = index + 1;
  const clip = useClipPlayer(useMemo(() => trimmedWav(sample), [sample]));
  const downloadUrl = useMemo(() => URL.createObjectURL(new Blob([sample.wav], { type: 'audio/wav' })), [sample]);
  useEffect(() => () => URL.revokeObjectURL(downloadUrl), [downloadUrl]);
  const [confirming, setConfirming] = useState(false);

  return (
    <li class="sample-row" data-testid="sample-row">
      <span class="sample-name">Sample {n}</span>
      <span class="sample-dur">{sample.durationSec.toFixed(1)} s</span>
      <button type="button" class="icon" aria-label={clip.playing ? `Pause sample ${n}` : `Play sample ${n}`} onClick={clip.toggle}>
        {clip.playing ? '❚❚' : '▶'}
      </button>
      <a href={downloadUrl} download={`japa-sample-${n}.wav`}>Download</a>
      {confirming ? (
        <span class="confirm">
          <button type="button" onClick={onDelete}>Yes, delete</button>
          <button type="button" onClick={() => setConfirming(false)}>Cancel</button>
        </span>
      ) : (
        <button type="button" class="link" onClick={() => setConfirming(true)}>Delete</button>
      )}
      {sample.synced && <span class="synced">✓ synced</span>}
      {flagged && <p class="hint flag">Sounds different from the others. Consider recording it again.</p>}
      {!isUsable(sample) && <p class="hint flag">Couldn’t update this sample. Record it again.</p>}
    </li>
  );
}
```

`src/ui/Recorder.tsx`:

```tsx
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { EngineHandle, FromEngine, OpenEngine } from '../audio/protocol';
import { decodeWav } from '../audio/wav';
import { waveformPeaks } from '../audio/waveform';
import { AutoStop } from '../recording/autostop';
import { MAX_SAMPLES, useStore } from '../state/store';
import type { SampleRecord } from '../storage/db';
import { buildSampleFromRecording, trimmedWav } from '../storage/samples';
import { useClipPlayer } from './useClipPlayer';

type View =
  | { kind: 'idle'; message?: string }
  | { kind: 'explain' }
  | { kind: 'countdown'; n: number }
  | { kind: 'chant' }
  | { kind: 'finishing' }
  | { kind: 'review'; sample: SampleRecord }
  | { kind: 'failed' }
  | { kind: 'error'; message: string };

function micErrorMessage(err: unknown): string {
  const name = err instanceof DOMException || err instanceof Error ? err.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Microphone blocked. Allow it from the address bar, then try again.';
  if (name === 'NotFoundError') return 'No microphone found.';
  return 'Couldn’t open the microphone.';
}

function LevelLine({ level }: { level: number }) {
  return (
    <div class="level" role="meter" aria-label="Microphone level" aria-valuemin={0} aria-valuemax={1} aria-valuenow={level}>
      <span style={{ transform: `scaleX(${level})` }} />
    </div>
  );
}

function Review({ sample, onKeep, onRedo }: { sample: SampleRecord; onKeep: () => void; onRedo: () => void }) {
  const wav = useMemo(() => trimmedWav(sample), [sample]);
  const peaks = useMemo(() => waveformPeaks(decodeWav(wav).pcm, 120), [wav]);
  const max = Math.max(1e-6, ...peaks);
  const clip = useClipPlayer(wav);
  return (
    <div class="review">
      <svg class="waveform" aria-label="Waveform" role="img" viewBox="0 0 120 40" preserveAspectRatio="none">
        {peaks.map((p, i) => {
          const h = Math.max(0.5, (p / max) * 38);
          return <rect key={i} x={i + 0.15} y={20 - h / 2} width={0.7} height={h} />;
        })}
      </svg>
      <div class="row">
        <button type="button" onClick={clip.toggle}>{clip.playing ? 'Pause' : 'Play'}</button>
        <button type="button" onClick={onKeep}>Keep</button>
        <button type="button" onClick={onRedo}>Redo</button>
      </div>
    </div>
  );
}

export function Recorder({ openEngine }: { openEngine: OpenEngine }) {
  const store = useStore();
  const [view, setView] = useState<View>({ kind: 'idle' });
  const [level, setLevel] = useState(0);
  const engineRef = useRef<EngineHandle | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);
  const autoRef = useRef<AutoStop | null>(null);
  const stoppingRef = useRef(false);

  useEffect(
    () => () => {
      unsubRef.current?.();
      void engineRef.current?.close();
      engineRef.current = null;
    },
    [],
  );

  const requestStop = () => {
    const auto = autoRef.current;
    if (!auto || stoppingRef.current) return;
    stoppingRef.current = true;
    auto.stop();
    setView({ kind: 'finishing' });
    engineRef.current?.send({ type: 'rec-stop' });
  };

  const onMessage = (msg: FromEngine) => {
    const auto = autoRef.current;
    if (!auto) return;
    if (msg.type === 'frame') {
      if (stoppingRef.current) return;
      const tick = auto.feed(msg.db);
      setLevel(tick.level);
      if (tick.phase === 'countdown') setView((v) => (v.kind === 'countdown' && v.n === tick.countdown ? v : { kind: 'countdown', n: tick.countdown }));
      else if (tick.phase === 'chant') setView((v) => (v.kind === 'chant' ? v : { kind: 'chant' }));
      if (tick.stopped) requestStop();
    } else if (msg.type === 'rec-pcm') {
      autoRef.current = null;
      stoppingRef.current = false;
      if (!auto.reachedChant || auto.floor === null) {
        setView({ kind: 'idle' });
        return;
      }
      const rec = buildSampleFromRecording(msg.pcm.subarray(auto.chantStartSample), auto.floor);
      setView(rec ? { kind: 'review', sample: rec } : { kind: 'failed' });
    }
  };

  const begin = async () => {
    try {
      if (!engineRef.current) {
        const engine = await openEngine();
        engineRef.current = engine;
        unsubRef.current = engine.on(onMessage);
      }
      autoRef.current = new AutoStop();
      stoppingRef.current = false;
      setLevel(0);
      setView({ kind: 'countdown', n: 3 });
      engineRef.current.send({ type: 'rec-start' });
    } catch (err) {
      setView({ kind: 'error', message: micErrorMessage(err) });
    }
  };

  const atCap = store.samples.value.length >= MAX_SAMPLES;
  const onRecord = () => (store.micExplained.value ? void begin() : setView({ kind: 'explain' }));
  const onContinue = async () => {
    await store.markMicExplained();
    await begin();
  };
  const onKeep = async (sample: SampleRecord) => {
    await store.addSample(sample);
    setView({ kind: 'idle', message: `Sample ${store.samples.value.length} saved.` });
  };

  switch (view.kind) {
    case 'explain':
      return (
        <div class="recorder">
          <p>Your browser will ask to use the microphone</p>
          <button type="button" onClick={() => void onContinue()}>Continue</button>
        </div>
      );
    case 'countdown':
      return (
        <div class="recorder" aria-live="polite">
          <p>Stay quiet…</p>
          <p class="countdown">{view.n}</p>
          <LevelLine level={level} />
          <button type="button" onClick={requestStop}>Stop</button>
        </div>
      );
    case 'chant':
    case 'finishing':
      return (
        <div class="recorder" aria-live="polite">
          <p>Chant once now.</p>
          <LevelLine level={level} />
          <button type="button" onClick={requestStop} disabled={view.kind === 'finishing'}>Stop</button>
        </div>
      );
    case 'review':
      return <Review sample={view.sample} onKeep={() => void onKeep(view.sample)} onRedo={() => void begin()} />;
    case 'failed':
      return (
        <div class="recorder">
          <p>Didn’t catch a full chant. Try again, a little closer to the mic.</p>
          <button type="button" onClick={() => void begin()}>Redo</button>
        </div>
      );
    default:
      return (
        <div class="recorder">
          <button type="button" onClick={onRecord} disabled={atCap}>Record a sample</button>
          <p class="hint">
            {atCap
              ? '10 samples is the most the counter uses. Delete one to record another.'
              : 'You’ll chant the mantra once. Recording stops when you go quiet.'}
          </p>
          {view.kind === 'idle' && view.message && <p class="hint" role="status">{view.message}</p>}
          {view.kind === 'error' && <p class="hint" role="alert">{view.message}</p>}
        </div>
      );
  }
}
```

Note: `onMessage` is registered once, so it must read state only through refs (as above) and set state with updater functions.

Modify `src/ui/Setup.tsx`: change the signature to `export function Setup({ openEngine }: { openEngine: OpenEngine })`, import `Recorder`, `SampleRow`, and replace the Voice samples section body with:

```tsx
        <Recorder openEngine={openEngine} />
        {store.samples.value.length > 0 && (
          <ul class="samples">
            {store.samples.value.map((s, i) => (
              <SampleRow key={s.id} sample={s} index={i} flagged={store.outliers.value[i] ?? false} onDelete={() => void store.removeSample(s.id)} />
            ))}
          </ul>
        )}
        {hint && <p class="hint">{hint}</p>}
```

Modify `src/ui/App.tsx` to `App({ store, openEngine }: { store: Store; openEngine: OpenEngine })` passing `openEngine` to `Setup`; in `src/main.tsx` import `openAudioEngine` from `./audio/mic` and render `<App store={store} openEngine={openAudioEngine} />`. In `tests/unit/ui/setup.test.tsx`, render `<Setup openEngine={async () => new FakeEngine()} />`.

Append to `src/ui/styles.css`:

```css
.recorder { display: flex; flex-direction: column; gap: 0.6rem; align-items: flex-start; }
.countdown { font-size: 2rem; margin: 0; font-variant-numeric: tabular-nums; }
.level { width: 100%; height: 2px; background: var(--setup-line); overflow: hidden; }
.level span { display: block; height: 100%; background: currentColor; transform-origin: left; transition: transform 60ms linear; }
.review { display: flex; flex-direction: column; gap: 0.6rem; }
.review .row { display: flex; gap: 0.6rem; }
.waveform { width: 100%; height: 48px; fill: currentColor; }
.samples { list-style: none; padding: 0; margin: 1rem 0 0; }
.sample-row { display: flex; flex-wrap: wrap; gap: 0.9rem; align-items: baseline; padding: 0.45rem 0; border-bottom: 1px solid var(--setup-line); }
.sample-row a { color: inherit; }
.sample-dur, .synced { color: var(--setup-muted); font-variant-numeric: tabular-nums; }
.sample-row .flag { flex-basis: 100%; margin: 0; }
button.icon { border: 0; padding: 0 0.2rem; }
@media (prefers-reduced-motion: reduce) { .level span { transition: none; } }
```

- [ ] **Step 5: Run to see them pass**

Run: `npm test && npm run typecheck && npm run lint && npm run build`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(ui): guided recording flow with review, and sample rows"
```

---

## M3 — Session screen

### Task 14: Session logic and the minimal session screen

**Files:**
- Create: `src/session/session-logic.ts`, `src/ui/Session.tsx`
- Modify: `src/ui/App.tsx` (render `Session` when `store.screen.value === 'session'`), `src/ui/Settings.tsx` (history duration via `formatDuration`), `src/ui/styles.css`
- Test: `tests/unit/session/session-logic.test.ts`, `tests/unit/ui/session.test.tsx`

**Interfaces:**
- Consumes: store (Task 12), `EngineHandle`/`OpenEngine` (Task 10), `bell`, `chime` (Task 8), `FakeEngine`.
- Produces:
  - `session-logic.ts`: `BELL_EVERY = 108`, `type CountEffect = 'bell' | 'target' | null`, `interface SessionResult { count: number; target: number; secs: number; avgSecsPerChant: number; reached: boolean }`, `class SessionState { constructor(target: number, bellEnabled: boolean, now: () => number); count: number; readonly started: boolean; readonly ended: boolean; begin(): void; onCount(): CountEffect; elapsedSec(): number; end(): SessionResult }`, `formatTimer(secs: number): string`, `formatDuration(secs: number): string`, `formatSummary(count: number, secs: number): string`
  - `Session({ openEngine, onExit }: { openEngine: OpenEngine; onExit: () => void })`

Behaviour (spec "Session screen"):
- On mount: request fullscreen on the session root and a screen wake lock (both optional, failures ignored); open the engine; send `session-start` with `takes = samples.map(s => s.take)`, `thr = store.threshold`, `sampleFloor = store.sampleFloor`. Show only `Stay quiet` while the engine measures 1.5 s of quiet.
- On `session-ready`: `begin()` (timer starts from `performance.now()`), show the mantra (Devanagari large; roman smaller under it, per open question Q5 default), the count `247 / 1008` and the timer `18:40`. Timer re-renders every 500 ms.
- On `count`: increment; the count text gets a `bump` class that fades it from slightly brighter to its rest tone over 600 ms (no animation under reduced motion). `bell` effect → `bell(ctx)`. `target` effect → `chime(ctx)`, end.
- End (target reached, `Escape`, or leaving fullscreen while running): stop the engine (`session-stop`), keep the context open ~4 s so the chime rings, then close; release the wake lock; save history when `count > 0` (`at: Date.now()`, `count`, `target`, `secs`, `avgSecsPerChant`); show the summary `1,008 chants  ·  1h 12m 04s` in place of count and timer.
- After the summary, any key (or click) exits fullscreen and returns to setup via `onExit()`.
- Root element: `data-testid="session"`, `data-phase` (`quiet` | `live` | `done`), `data-count`, `data-chimed` (`true` once the target chime played). Cursor hidden. No buttons.
- Timer and count format: `formatTimer(1120) === '18:40'`, `formatTimer(4324) === '1:12:04'`; `formatDuration(4324) === '1h 12m 04s'`, `formatDuration(724) === '12m 04s'`, `formatDuration(42) === '42s'`; `formatSummary(1008, 4324) === '1,008 chants  ·  1h 12m 04s'`, `formatSummary(1, 3) === '1 chant  ·  3s'`.

- [ ] **Step 1: Write the failing tests**

`tests/unit/session/session-logic.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { formatDuration, formatSummary, formatTimer, SessionState } from '../../../src/session/session-logic';

function clock() {
  let t = 0;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

describe('SessionState', () => {
  it('ignores counts before begin()', () => {
    const c = clock();
    const s = new SessionState(10, true, c.now);
    expect(s.onCount()).toBeNull();
    expect(s.count).toBe(0);
  });

  it('rings a soft bell every 108 and signals the target', () => {
    const s = new SessionState(216, true, clock().now);
    s.begin();
    const effects = Array.from({ length: 216 }, () => s.onCount());
    expect(effects[107]).toBe('bell');
    expect(effects.filter((e) => e === 'bell')).toHaveLength(1);
    expect(effects[215]).toBe('target');
  });

  it('no soft bells when the setting is off', () => {
    const s = new SessionState(1000, false, clock().now);
    s.begin();
    expect(Array.from({ length: 300 }, () => s.onCount()).every((e) => e === null)).toBe(true);
  });

  it('times from begin() on a monotonic clock and ends once', () => {
    const c = clock();
    const s = new SessionState(2, true, c.now);
    c.advance(5000);
    s.begin();
    c.advance(3000);
    s.onCount();
    c.advance(3000);
    expect(s.onCount()).toBe('target');
    const r = s.end();
    expect(r).toEqual({ count: 2, target: 2, secs: 6, avgSecsPerChant: 3, reached: true });
    c.advance(10000);
    expect(s.elapsedSec()).toBe(6);
    expect(s.onCount()).toBeNull();
    expect(s.end()).toEqual(r);
  });

  it('average is 0 with no counts', () => {
    const s = new SessionState(5, true, clock().now);
    s.begin();
    expect(s.end().avgSecsPerChant).toBe(0);
  });
});

describe('formatting', () => {
  it('formats the timer', () => {
    expect(formatTimer(0)).toBe('0:00');
    expect(formatTimer(1120)).toBe('18:40');
    expect(formatTimer(4324)).toBe('1:12:04');
  });
  it('formats durations and the summary', () => {
    expect(formatDuration(42)).toBe('42s');
    expect(formatDuration(724)).toBe('12m 04s');
    expect(formatDuration(4324)).toBe('1h 12m 04s');
    expect(formatSummary(1008, 4324)).toBe('1,008 chants  ·  1h 12m 04s');
    expect(formatSummary(1, 3)).toBe('1 chant  ·  3s');
  });
});
```

`tests/unit/ui/session.test.tsx`:

```tsx
// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bell, chime } from '../../../src/audio/bell';
import { StoreContext, type Store } from '../../../src/state/store';
import { Session } from '../../../src/ui/Session';
import { FakeEngine } from '../../helpers/fake-engine';
import { makeStore } from '../../helpers/store';

vi.mock('../../../src/audio/bell', () => ({ bell: vi.fn(), chime: vi.fn() }));

let store: Store;
beforeEach(async () => {
  vi.mocked(bell).mockClear();
  vi.mocked(chime).mockClear();
  store = await makeStore([81, 82, 83]);
});

async function start(target: number, bellOn = true) {
  await store.updateSettings({ target, bell: bellOn });
  const engine = new FakeEngine();
  const onExit = vi.fn();
  render(<StoreContext.Provider value={store}><Session openEngine={async () => engine} onExit={onExit} /></StoreContext.Provider>);
  await waitFor(() => expect(engine.sentTypes()).toEqual(['session-start']));
  return { engine, onExit, root: screen.getByTestId('session') };
}
const counts = (engine: FakeEngine, n: number) => act(() => { for (let i = 0; i < n; i++) engine.emit({ type: 'count', te: i }); });

describe('Session', () => {
  it('starts the engine with the samples, threshold and sample floor, showing "Stay quiet"', async () => {
    const { engine, root } = await start(108);
    const msg = engine.sent[0] as { type: 'session-start'; takes: unknown[]; thr: number; sampleFloor: number };
    expect(msg.takes).toHaveLength(3);
    expect(msg.thr).toBe(store.threshold.value);
    expect(msg.sampleFloor).toBe(store.sampleFloor.value);
    expect(root.dataset.phase).toBe('quiet');
    expect(screen.getByText('Stay quiet')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('shows the mantra, count and timer once the engine is ready', async () => {
    const { engine, root } = await start(1008);
    await act(() => engine.emit({ type: 'session-ready', floor: -60 }));
    expect(root.dataset.phase).toBe('live');
    expect(screen.getByText(store.settings.value.mantraDevanagari)).toBeTruthy();
    expect(screen.getByText(store.settings.value.mantraRoman)).toBeTruthy();
    await counts(engine, 3);
    expect(screen.getByText('3 / 1008')).toBeTruthy();
    expect(screen.getByText('0:00')).toBeTruthy();
  });

  it('rings a soft bell at 108', async () => {
    const { engine } = await start(1008);
    await act(() => engine.emit({ type: 'session-ready', floor: -60 }));
    await counts(engine, 108);
    expect(bell).toHaveBeenCalledTimes(1);
  });

  it('chimes at the target, ends by itself, saves history and shows the summary', async () => {
    const { engine, root } = await start(5);
    await act(() => engine.emit({ type: 'session-ready', floor: -60 }));
    await counts(engine, 6);
    expect(chime).toHaveBeenCalledTimes(1);
    expect(root.dataset.phase).toBe('done');
    expect(root.dataset.chimed).toBe('true');
    expect(root.dataset.count).toBe('5');
    expect(screen.getByTestId('summary').textContent).toMatch(/^5 chants {2}· {2}\d+s$/);
    expect(engine.sentTypes()).toContain('session-stop');
    await waitFor(() => expect(store.history.value[0]).toMatchObject({ count: 5, target: 5 }));
  });

  it('Escape ends the session early without a chime; then any key returns to setup', async () => {
    const { engine, root, onExit } = await start(108);
    await act(() => engine.emit({ type: 'session-ready', floor: -60 }));
    await counts(engine, 2);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(root.dataset.phase).toBe('done');
    expect(chime).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: 'a' });
    expect(onExit).toHaveBeenCalledOnce();
  });

  it('does not save history when nothing was counted', async () => {
    const { engine } = await start(108);
    await act(() => engine.emit({ type: 'session-ready', floor: -60 }));
    fireEvent.keyDown(window, { key: 'Escape' });
    await new Promise((r) => setTimeout(r, 20));
    expect(store.history.value).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run tests/unit/session tests/unit/ui/session.test.tsx`
Expected: FAIL — modules missing.

- [ ] **Step 3: Implement `src/session/session-logic.ts`**

```ts
export const BELL_EVERY = 108;

export type CountEffect = 'bell' | 'target' | null;

export interface SessionResult {
  count: number;
  target: number;
  secs: number;
  avgSecsPerChant: number;
  reached: boolean;
}

/** Count, target and timing for one session. Time comes from a monotonic clock (performance.now). */
export class SessionState {
  count = 0;
  private startedAt: number | null = null;
  private endedAt: number | null = null;
  private result: SessionResult | null = null;

  constructor(
    readonly target: number,
    readonly bellEnabled: boolean,
    private readonly now: () => number,
  ) {}

  get started(): boolean {
    return this.startedAt !== null;
  }

  get ended(): boolean {
    return this.result !== null;
  }

  begin(): void {
    if (this.startedAt === null) this.startedAt = this.now();
  }

  onCount(): CountEffect {
    if (this.ended || this.startedAt === null) return null;
    this.count++;
    if (this.count >= this.target) return 'target';
    if (this.bellEnabled && this.count % BELL_EVERY === 0) return 'bell';
    return null;
  }

  elapsedSec(): number {
    if (this.startedAt === null) return 0;
    return ((this.endedAt ?? this.now()) - this.startedAt) / 1000;
  }

  end(): SessionResult {
    if (this.result) return this.result;
    this.endedAt = this.now();
    const secs = this.elapsedSec();
    this.result = {
      count: this.count,
      target: this.target,
      secs,
      avgSecsPerChant: this.count ? secs / this.count : 0,
      reached: this.count >= this.target,
    };
    return this.result;
  }
}

const pad = (n: number) => String(n).padStart(2, '0');

export function formatTimer(secs: number): string {
  const s = Math.floor(secs);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

export function formatDuration(secs: number): string {
  const s = Math.floor(secs);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${pad(m)}m ${pad(s % 60)}s`;
  if (m > 0) return `${m}m ${pad(s % 60)}s`;
  return `${s}s`;
}

export function formatSummary(count: number, secs: number): string {
  return `${count.toLocaleString('en-US')} ${count === 1 ? 'chant' : 'chants'}  ·  ${formatDuration(secs)}`;
}
```

- [ ] **Step 4: Implement `src/ui/Session.tsx`**

```tsx
import { useEffect, useRef, useState } from 'preact/hooks';
import { bell, chime } from '../audio/bell';
import type { EngineHandle, OpenEngine } from '../audio/protocol';
import { formatSummary, formatTimer, SessionState, type SessionResult } from '../session/session-logic';
import { useStore } from '../state/store';

type Phase = 'quiet' | 'live' | 'done';
const CHIME_TAIL_MS = 4000; // keep the audio context alive while the chime rings

export function Session({ openEngine, onExit }: { openEngine: OpenEngine; onExit: () => void }) {
  const store = useStore();
  const settings = store.settings.value;
  const rootRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef(new SessionState(settings.target, settings.bell, () => performance.now()));
  const phaseRef = useRef<Phase>('quiet');
  const [phase, setPhaseState] = useState<Phase>('quiet');
  const [count, setCount] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [bump, setBump] = useState(0);
  const [chimed, setChimed] = useState(false);
  const [result, setResult] = useState<SessionResult | null>(null);

  const setPhase = (p: Phase) => {
    phaseRef.current = p;
    setPhaseState(p);
  };

  useEffect(() => {
    const st = stateRef.current;
    let engine: EngineHandle | null = null;
    let unsub = () => {};
    let wake: WakeLockSentinel | null = null;
    let timer = 0;
    let cancelled = false;

    const acquireWake = async () => {
      try {
        wake = (await navigator.wakeLock?.request('screen')) ?? null;
      } catch {
        wake = null;
      }
    };

    const end = () => {
      if (st.ended) return;
      window.clearInterval(timer);
      const r = st.end();
      setResult(r);
      setElapsed(r.secs);
      setPhase('done');
      engine?.send({ type: 'session-stop' });
      const e = engine;
      window.setTimeout(() => void e?.close(), CHIME_TAIL_MS);
      void wake?.release().catch(() => {});
      wake = null;
      if (r.count > 0) {
        void store.recordSession({ at: Date.now(), count: r.count, target: r.target, secs: r.secs, avgSecsPerChant: r.avgSecsPerChant });
      }
    };

    const onKey = (e: KeyboardEvent) => {
      if (phaseRef.current === 'done') {
        if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
        onExit();
      } else if (e.key === 'Escape') {
        end();
      }
    };
    const onFullscreen = () => {
      if (!document.fullscreenElement && phaseRef.current !== 'done') end();
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible' && phaseRef.current !== 'done') void acquireWake();
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('fullscreenchange', onFullscreen);
    document.addEventListener('visibilitychange', onVisible);

    void (async () => {
      try {
        await rootRef.current?.requestFullscreen?.();
      } catch {
        /* fullscreen is optional */
      }
      await acquireWake();
      const e = await openEngine();
      if (cancelled) {
        void e.close();
        return;
      }
      engine = e;
      unsub = e.on((msg) => {
        if (msg.type === 'session-ready') {
          st.begin();
          setPhase('live');
          timer = window.setInterval(() => setElapsed(st.elapsedSec()), 500);
        } else if (msg.type === 'count') {
          const fx = st.onCount();
          if (fx === null && (st.ended || !st.started)) return;
          setCount(st.count);
          setBump((b) => b + 1);
          if (fx === 'bell' && e.ctx) bell(e.ctx);
          if (fx === 'target') {
            if (e.ctx) chime(e.ctx);
            setChimed(true);
            end();
          }
        }
      });
      e.send({
        type: 'session-start',
        takes: store.usableSamples.value.map((s) => s.take),
        thr: store.threshold.value ?? 0,
        sampleFloor: store.sampleFloor.value,
      });
    })();

    return () => {
      cancelled = true;
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('fullscreenchange', onFullscreen);
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(timer);
      unsub();
      if (!st.ended) {
        engine?.send({ type: 'session-stop' });
        void engine?.close();
      }
      void wake?.release().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only by design
  }, []);

  return (
    <div
      ref={rootRef}
      class="session"
      data-testid="session"
      data-phase={phase}
      data-count={count}
      data-chimed={chimed ? 'true' : 'false'}
      onClick={() => phaseRef.current === 'done' && onExit()}
    >
      {phase === 'quiet' ? (
        <p class="session-quiet">Stay quiet</p>
      ) : (
        <div class="mantra">
          <p class="mantra-dev" lang="sa">{settings.mantraDevanagari}</p>
          <p class="mantra-roman">{settings.mantraRoman}</p>
        </div>
      )}
      <div class="session-meta">
        {phase === 'done' && result ? (
          <p class="summary" data-testid="summary">{formatSummary(result.count, result.secs)}</p>
        ) : phase === 'live' ? (
          <>
            <p class={bump > 0 ? 'count bump' : 'count'} key={bump}>{count} / {settings.target}</p>
            <p class="timer">{formatTimer(elapsed)}</p>
          </>
        ) : null}
      </div>
    </div>
  );
}
```

If ESLint reports the `react-hooks/exhaustive-deps` disable comment as an unknown rule (the plugin isn't installed), delete that comment line.

Modify `src/ui/App.tsx`:

```tsx
import type { OpenEngine } from '../audio/protocol';
import { StoreContext, type Store } from '../state/store';
import { Session } from './Session';
import { Setup } from './Setup';

export function App({ store, openEngine }: { store: Store; openEngine: OpenEngine }) {
  return (
    <StoreContext.Provider value={store}>
      {store.screen.value === 'session' ? (
        <Session openEngine={openEngine} onExit={() => (store.screen.value = 'setup')} />
      ) : (
        <Setup openEngine={openEngine} />
      )}
    </StoreContext.Provider>
  );
}
```

In `src/ui/Settings.tsx` replace `{Math.round(h.secs)}s` with `{formatDuration(h.secs)}` (import from `../session/session-logic`).

Append to `src/ui/styles.css`:

```css
.session {
  position: fixed; inset: 0; background: var(--session-bg); color: var(--mantra); cursor: none;
  display: grid; grid-template-rows: 1fr auto; justify-items: center; align-items: center; padding: 3rem 1.5rem 3.5rem;
}
.session-quiet { color: var(--count); font-size: 1rem; margin: 0; }
.mantra { text-align: center; max-width: 60rem; }
.mantra-dev { font-family: var(--font-mantra); font-size: clamp(2.25rem, 5.5vw, 4.5rem); line-height: 1.5; margin: 0; }
.mantra-roman { font-size: clamp(1rem, 1.8vw, 1.4rem); margin: 0.75rem 0 0; opacity: 0.55; }
.session-meta { text-align: center; min-height: 3rem; }
.count { color: var(--count); font-size: 15px; margin: 0; font-variant-numeric: tabular-nums; }
.count.bump { animation: count-fade 600ms ease-out; }
.timer { color: var(--timer); font-size: 13px; margin: 0.25rem 0 0; font-variant-numeric: tabular-nums; }
.summary { color: var(--count); font-size: 15px; margin: 0; white-space: pre; }
@keyframes count-fade { from { color: var(--count-bright); } to { color: var(--count); } }
@media (prefers-reduced-motion: reduce) { .count.bump { animation: none; } }
```

- [ ] **Step 5: Run to see them pass**

Run: `npm test && npm run typecheck && npm run lint && npm run build`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(session): minimal session screen with bells, chime, wake lock and history"
```

### Task 15: End-to-end tests with Chrome's fake mic (M3 gate)

**Files:**
- Create: `scripts/make-fixtures.ts`, `tests/e2e/global-setup.ts`, `tests/e2e/helpers.ts`, `tests/e2e/recording.spec.ts`, `tests/e2e/session.spec.ts`
- Modify: `playwright.config.ts` (add `globalSetup`), `.github/workflows/ci.yml` (add `e2e` job)

**Interfaces:**
- Consumes: `encodeWav` (Task 8), synth helper (Task 5); the running app.
- Produces: `writeFixtures(dir?: string): void` generating `sample-1.wav`, `sample-2.wav`, `sample-3.wav` (0.6 s noise + chant + 0.8 s noise), `rec-once.wav` (4.5 s noise + chant + 10 s noise), `stream-20.wav` (3 s noise + 20 continuous chants + 5 s noise) — all 16 kHz mono 16-bit, from `new Synth(7)`.

Chrome flags: `--use-fake-ui-for-media-stream --use-fake-device-for-media-stream --use-file-for-fake-audio-capture=<file>%noloop`. With `%noloop` the file plays once from the moment the capture device opens, then silence. Samples for the session test are seeded through the app's own modules (Vite serves `/src/...`), so the session test does not depend on recording timing.

- [ ] **Step 1: Write the fixture generator**

`scripts/make-fixtures.ts`:

```ts
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
```

Run: `npm run fixtures && ls tests/fixtures/synthetic`
Expected: the five WAV files.

- [ ] **Step 2: Write the Playwright setup and helpers**

`tests/e2e/global-setup.ts`:

```ts
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { FIXTURE_DIR, writeFixtures } from '../../scripts/make-fixtures';

export default function globalSetup() {
  const names = ['sample-1.wav', 'sample-2.wav', 'sample-3.wav', 'rec-once.wav', 'stream-20.wav'];
  if (!names.every((n) => existsSync(join(FIXTURE_DIR, n)))) writeFixtures();
}
```

Add `globalSetup: './tests/e2e/global-setup.ts',` to `playwright.config.ts`.

`tests/e2e/helpers.ts`:

```ts
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
```

- [ ] **Step 3: Write the e2e tests**

`tests/e2e/recording.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { fakeMic } from './helpers';

test.use(fakeMic('rec-once.wav'));

test('records a sample: explain → countdown → chant → auto-stop → review → keep', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('You’ll chant the mantra once. Recording stops when you go quiet.')).toBeVisible();
  await page.getByRole('button', { name: 'Record a sample' }).click();
  await expect(page.getByText('Your browser will ask to use the microphone')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('Stay quiet…')).toBeVisible();
  await expect(page.getByText('Chant once now.')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('button', { name: 'Keep' })).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Keep' }).click();
  await expect(page.getByTestId('sample-row')).toHaveCount(1);
  await expect(page.getByTestId('sample-row')).toContainText(/Sample 1\s+\d\.\d s/);
  await page.reload();
  await expect(page.getByTestId('sample-row')).toHaveCount(1);
});
```

`tests/e2e/session.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { fakeMic, seedSamples } from './helpers';

test.use(fakeMic('stream-20.wav'));

test('counts 20 continuous chants, chimes at the target and saves history', async ({ page }) => {
  await page.goto('/');
  await seedSamples(page, ['sample-1.wav', 'sample-2.wav', 'sample-3.wav']);
  await expect(page.getByTestId('sample-row')).toHaveCount(3);
  await page.getByLabel('Target').fill('20');
  await page.getByRole('button', { name: 'Start' }).click();
  const session = page.getByTestId('session');
  await expect(session).toHaveAttribute('data-phase', 'live', { timeout: 15_000 });
  await expect(session).toHaveAttribute('data-phase', 'done', { timeout: 150_000 });
  await expect(session).toHaveAttribute('data-count', '20');
  await expect(session).toHaveAttribute('data-chimed', 'true');
  await expect(page.getByTestId('summary')).toContainText('20 chants');
  await page.keyboard.press('a');
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByText(/20 \/ 20/)).toBeVisible();
});
```

- [ ] **Step 4: Run the e2e tests**

Run: `npm run test:e2e`
Expected: 2 passed. If the session test fails, read `data-count` from the failure: fewer than 20 means the engine under-counted through Chrome's fake device (report the number and the fake-device sample rate from `page.evaluate(() => new AudioContext().sampleRate)`); do not change the target or fixtures to make it pass. If `%noloop` is not honoured by this Chrome build (the recording test sees the chant during the countdown), report it as BLOCKED with the observed behaviour.

- [ ] **Step 5: Add the e2e job to CI**

Append to `.github/workflows/ci.yml` under `jobs:`:

```yaml
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: npm
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npm run test:e2e
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "test(e2e): fake-mic recording and 20-chant session tests (M3 gate)"
```

---

## M4 — Google Drive

### Task 16: Drive REST client and manifest

**Files:**
- Create: `src/storage/drive.ts`, `src/storage/manifest.ts`
- Test: `tests/unit/storage/drive.test.ts`, `tests/unit/storage/manifest.test.ts`

**Interfaces:**
- Consumes: `SampleRecord` (Task 11).
- Produces:
  - `drive.ts`:
    ```ts
    export type TokenProvider = (opts: { forceRefresh: boolean; interactive: boolean }) => Promise<string>;
    export interface DriveFile { id: string; name: string; mimeType: string }
    export class DriveError extends Error { constructor(readonly status: number, message: string) }
    export interface DriveApi {
      ensureSamplesFolder(): Promise<string>;
      listFiles(folderId: string): Promise<DriveFile[]>;
      uploadFile(folderId: string, name: string, mimeType: string, body: ArrayBuffer | string, existingId?: string): Promise<string>;
      downloadFile(id: string): Promise<ArrayBuffer>;
      deleteFile(id: string): Promise<void>;
    }
    export const ROOT_FOLDER = 'Japa Counter'; export const SAMPLES_FOLDER = 'samples';
    export class DriveClient implements DriveApi { constructor(getToken: TokenProvider, fetchFn?: typeof fetch, interactive?: boolean) }
    ```
  - `manifest.ts`:
    ```ts
    export const MANIFEST_NAME = 'manifest.json';
    export interface ManifestEntry { sampleId: string; fileId: string; createdAt: number; durationSec: number; trimStart: number; trimEnd: number; floor: number; engineVersion: number }
    export interface Manifest { version: 1; samples: ManifestEntry[] }
    export function emptyManifest(): Manifest;
    export function entryFromSample(s: SampleRecord): ManifestEntry;   // requires s.driveFileId
    export function mergeManifests(a: Manifest, b: Manifest, deletedFileIds?: ReadonlySet<string>): Manifest;
    export function parseManifest(text: string): Manifest;               // tolerant: bad JSON → emptyManifest()
    ```

Drive details: folder `Japa Counter/samples/` in My Drive. API base `https://www.googleapis.com/drive/v3/files`; multipart upload `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`; content update `PATCH https://www.googleapis.com/upload/drive/v3/files/{id}?uploadType=media`; download `GET …/files/{id}?alt=media`. Queries: `name='<escaped>' and mimeType='application/vnd.google-apps.folder' and '<parent>' in parents and trashed=false` (parent `root` for the top folder); listing: `'<folderId>' in parents and trashed=false`, `fields=files(id,name,mimeType)`, `pageSize=1000`. Escape `\` and `'` in names. Every request sends `Authorization: Bearer <token>`. A 401 refreshes the token once (`forceRefresh: true`) and retries; a second failure throws `DriveError`. `deleteFile` treats 404 as success. The manifest records `floor` in addition to the spec's fields because re-extraction on a fresh profile needs it.

- [ ] **Step 1: Write the failing tests**

`tests/unit/storage/drive.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { DriveClient, DriveError } from '../../../src/storage/drive';

type Call = { url: string; method: string; headers: Record<string, string>; body: unknown };

function mockFetch(handler: (c: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const c: Call = { url: String(input), method: init.method ?? 'GET', headers: Object.fromEntries(new Headers(init.headers).entries()), body: init.body };
    calls.push(c);
    return handler(c);
  });
  return { fn: fn as unknown as typeof fetch, calls };
}
const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } });
const tokens = () => {
  let n = 0;
  return vi.fn(async () => `tok-${++n}`);
};

describe('DriveClient', () => {
  it('creates Japa Counter/samples when missing and reuses it when present', async () => {
    const created: string[] = [];
    const { fn, calls } = mockFetch((c) => {
      if (c.method === 'GET') return json({ files: created.length === 2 && c.url.includes('samples') ? [{ id: 'S' }] : [] });
      const body = JSON.parse(String(c.body));
      created.push(body.name);
      return json({ id: body.name === 'Japa Counter' ? 'R' : 'S' });
    });
    const drive = new DriveClient(tokens(), fn);
    expect(await drive.ensureSamplesFolder()).toBe('S');
    expect(created).toEqual(['Japa Counter', 'samples']);
    const post = calls.filter((c) => c.method === 'POST').map((c) => JSON.parse(String(c.body)));
    expect(post[0]).toMatchObject({ name: 'Japa Counter', mimeType: 'application/vnd.google-apps.folder', parents: ['root'] });
    expect(post[1]).toMatchObject({ name: 'samples', parents: ['R'] });
    expect(decodeURIComponent(calls[0].url)).toContain("name='Japa Counter' and mimeType='application/vnd.google-apps.folder' and 'root' in parents and trashed=false");
  });

  it('sends the bearer token and refreshes once on 401', async () => {
    const getToken = tokens();
    let first = true;
    const { fn, calls } = mockFetch(() => {
      if (first) {
        first = false;
        return new Response('', { status: 401 });
      }
      return json({ files: [] });
    });
    const drive = new DriveClient(getToken, fn);
    expect(await drive.listFiles('F')).toEqual([]);
    expect(calls.map((c) => c.headers.authorization)).toEqual(['Bearer tok-1', 'Bearer tok-2']);
    expect(getToken).toHaveBeenLastCalledWith({ forceRefresh: true, interactive: false });
  });

  it('throws DriveError when the refreshed token is also rejected', async () => {
    const { fn } = mockFetch(() => new Response('', { status: 401 }));
    await expect(new DriveClient(tokens(), fn).listFiles('F')).rejects.toBeInstanceOf(DriveError);
  });

  it('uploads new files as multipart and updates existing ones with PATCH', async () => {
    const { fn, calls } = mockFetch((c) => json({ id: c.method === 'POST' ? 'NEW' : 'OLD' }));
    const drive = new DriveClient(tokens(), fn);
    expect(await drive.uploadFile('F', 'a.wav', 'audio/wav', new ArrayBuffer(4))).toBe('NEW');
    expect(calls[0].url).toBe('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id');
    expect(calls[0].headers['content-type']).toMatch(/^multipart\/related; boundary=/);
    const text = await new Response(calls[0].body as BodyInit).text();
    expect(text).toContain('"name":"a.wav"');
    expect(text).toContain('"parents":["F"]');
    expect(await drive.uploadFile('F', 'm.json', 'application/json', '{}', 'OLD')).toBe('OLD');
    expect(calls[1]).toMatchObject({ method: 'PATCH', url: 'https://www.googleapis.com/upload/drive/v3/files/OLD?uploadType=media&fields=id' });
  });

  it('downloads file bytes and treats deleting a missing file as done', async () => {
    const { fn, calls } = mockFetch((c) => (c.method === 'DELETE' ? new Response('', { status: 404 }) : new Response(new Uint8Array([1, 2, 3]))));
    const drive = new DriveClient(tokens(), fn);
    expect(new Uint8Array(await drive.downloadFile('X'))).toEqual(new Uint8Array([1, 2, 3]));
    expect(calls[0].url).toBe('https://www.googleapis.com/drive/v3/files/X?alt=media');
    await expect(drive.deleteFile('X')).resolves.toBeUndefined();
  });

  it("escapes quotes in folder names", async () => {
    const { fn, calls } = mockFetch(() => json({ files: [{ id: 'Q' }] }));
    const drive = new DriveClient(tokens(), fn);
    await drive.findFolder("O'Brien", 'root');
    expect(decodeURIComponent(calls[0].url)).toContain("name='O\\'Brien'");
  });
});
```

`tests/unit/storage/manifest.test.ts`:

```ts
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
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run tests/unit/storage/drive.test.ts tests/unit/storage/manifest.test.ts`
Expected: FAIL — modules missing.

- [ ] **Step 3: Implement**

`src/storage/drive.ts`:

```ts
export type TokenProvider = (opts: { forceRefresh: boolean; interactive: boolean }) => Promise<string>;

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
}

export class DriveError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'DriveError';
  }
}

export interface DriveApi {
  ensureSamplesFolder(): Promise<string>;
  listFiles(folderId: string): Promise<DriveFile[]>;
  uploadFile(folderId: string, name: string, mimeType: string, body: ArrayBuffer | string, existingId?: string): Promise<string>;
  downloadFile(id: string): Promise<ArrayBuffer>;
  deleteFile(id: string): Promise<void>;
}

export const ROOT_FOLDER = 'Japa Counter';
export const SAMPLES_FOLDER = 'samples';
const API = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

/** Minimal Drive REST v3 client for files this app creates (scope drive.file). */
export class DriveClient implements DriveApi {
  constructor(
    private readonly getToken: TokenProvider,
    private readonly fetchFn: typeof fetch = (...args) => fetch(...args),
    private readonly interactive = false,
  ) {}

  private async request(url: string, init: RequestInit = {}): Promise<Response> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const token = await this.getToken({ forceRefresh: attempt > 0, interactive: this.interactive });
      const headers = new Headers(init.headers);
      headers.set('Authorization', `Bearer ${token}`);
      const res = await this.fetchFn(url, { ...init, headers });
      if (res.status === 401 && attempt === 0) continue;
      if (!res.ok) throw new DriveError(res.status, `Drive request failed (${res.status})`);
      return res;
    }
    throw new DriveError(401, 'Drive authorisation failed');
  }

  async findFolder(name: string, parentId: string): Promise<string | null> {
    const q = `name='${esc(name)}' and mimeType='${FOLDER_MIME}' and '${esc(parentId)}' in parents and trashed=false`;
    const res = await this.request(`${API}?q=${encodeURIComponent(q)}&fields=${encodeURIComponent('files(id)')}`);
    const { files } = (await res.json()) as { files: { id: string }[] };
    return files[0]?.id ?? null;
  }

  async createFolder(name: string, parentId: string): Promise<string> {
    const res = await this.request(`${API}?fields=id`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parentId] }),
    });
    return ((await res.json()) as { id: string }).id;
  }

  async ensureSamplesFolder(): Promise<string> {
    const root = (await this.findFolder(ROOT_FOLDER, 'root')) ?? (await this.createFolder(ROOT_FOLDER, 'root'));
    return (await this.findFolder(SAMPLES_FOLDER, root)) ?? (await this.createFolder(SAMPLES_FOLDER, root));
  }

  async listFiles(folderId: string): Promise<DriveFile[]> {
    const q = `'${esc(folderId)}' in parents and trashed=false`;
    const res = await this.request(`${API}?q=${encodeURIComponent(q)}&fields=${encodeURIComponent('files(id,name,mimeType)')}&pageSize=1000`);
    return ((await res.json()) as { files: DriveFile[] }).files;
  }

  async uploadFile(folderId: string, name: string, mimeType: string, body: ArrayBuffer | string, existingId?: string): Promise<string> {
    if (existingId) {
      const res = await this.request(`${UPLOAD}/${existingId}?uploadType=media&fields=id`, {
        method: 'PATCH',
        headers: { 'Content-Type': mimeType },
        body,
      });
      return ((await res.json()) as { id: string }).id;
    }
    const boundary = `japa${Math.random().toString(36).slice(2)}`;
    const meta = JSON.stringify({ name, parents: [folderId], mimeType });
    const multipart = new Blob([
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n`,
      `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
      body,
      `\r\n--${boundary}--`,
    ]);
    const res = await this.request(`${UPLOAD}?uploadType=multipart&fields=id`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body: multipart,
    });
    return ((await res.json()) as { id: string }).id;
  }

  async downloadFile(id: string): Promise<ArrayBuffer> {
    return (await this.request(`${API}/${id}?alt=media`)).arrayBuffer();
  }

  async deleteFile(id: string): Promise<void> {
    try {
      await this.request(`${API}/${id}`, { method: 'DELETE' });
    } catch (err) {
      if (err instanceof DriveError && err.status === 404) return;
      throw err;
    }
  }
}
```

`src/storage/manifest.ts`:

```ts
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

export function parseManifest(text: string): Manifest {
  try {
    const m = JSON.parse(text) as Partial<Manifest>;
    return Array.isArray(m.samples) ? { version: 1, samples: m.samples } : emptyManifest();
  } catch {
    return emptyManifest();
  }
}
```

- [ ] **Step 4: Run to see them pass**

Run: `npx vitest run tests/unit/storage`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/storage/drive.ts src/storage/manifest.ts tests/unit/storage/drive.test.ts tests/unit/storage/manifest.test.ts
git commit -m "feat(drive): Drive REST client with token refresh, and sample manifest"
```

### Task 17: Google sign-in, sync engine and Drive UI

**Files:**
- Create: `src/storage/auth.ts`, `src/storage/sync.ts`, `src/state/drive-controller.ts`, `src/ui/DriveSection.tsx`, `tests/helpers/fake-drive.ts`
- Modify: `src/ui/Settings.tsx` (render `DriveSection`), `src/ui/App.tsx` and `src/main.tsx` (create and provide the drive controller), `.gitignore` already ignores `.env.local`
- Test: `tests/unit/storage/auth.test.ts`, `tests/unit/storage/sync.test.ts`, `tests/unit/state/drive-controller.test.ts`

**Interfaces:**
- Consumes: `DriveApi`, `DriveClient`, `TokenProvider` (Task 16), manifest (Task 16), db + `rebuildFromWav` (Task 11), store incl. `onLocalChange` (Task 12).
- Produces:
  - `auth.ts`: `DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file'`, `GIS_SRC = 'https://accounts.google.com/gsi/client'`, `createGoogleTokenProvider(clientId: string, deps?: { loadGis?: () => Promise<GoogleOAuth2>; now?: () => number }): TokenProvider`, `interface GoogleOAuth2 { initTokenClient(config: { client_id: string; scope: string; callback: (r: { access_token?: string; expires_in?: number; error?: string }) => void; error_callback?: (e: { type: string }) => void }): { requestAccessToken(o?: { prompt?: string }): void } }`
  - `sync.ts`: `interface SyncReport { uploaded: number; downloaded: number; deleted: number; skipped: boolean }`, `interface SyncDeps { db: JapaDB; drive: DriveApi; isOnline: () => boolean }`, `syncSamples(deps: SyncDeps): Promise<SyncReport>`, `startAutoSync(run: () => Promise<unknown>, target?: EventTarget): () => void` (runs `run` on every `online` event; returns an unsubscribe)
  - `drive-controller.ts`: `type DriveStatus = 'off' | 'disconnected' | 'syncing' | 'idle' | 'error'`, `interface DriveController { status: Signal<DriveStatus>; lastSync: Signal<number | null>; message: Signal<string | null>; connect(): Promise<void>; syncNow(): Promise<void>; start(): Promise<void>; stop(): void }`, `createDriveController(store: Store, deps: { clientId: string | undefined; makeDrive: (interactive: boolean) => DriveApi; isOnline?: () => boolean; events?: EventTarget }): DriveController`, `DriveContext`, `useDrive(): DriveController | null`
  - `tests/helpers/fake-drive.ts`: `class FakeDrive implements DriveApi` (in-memory files map; `files: Map<string, { name: string; folderId: string; body: ArrayBuffer | string }>`; counters `uploads`, `deletes`)

Sync algorithm (`syncSamples`), setup screen only:
1. If `!isOnline()` → return `{ uploaded: 0, downloaded: 0, deleted: 0, skipped: true }` without touching Drive.
2. `folder = ensureSamplesFolder()`; `files = listFiles(folder)`; read `manifest.json` if present (`parseManifest`), else empty.
3. Pending deletes: `deleteFile(id)` for each, `clearPendingDelete`; collect into `deleted`.
4. Uploads: every local sample with `synced === false` → `uploadFile(folder, 'sample-<ISO date with : replaced by ->-<first 8 chars of id>.wav', 'audio/wav', wav)` → `putSample({ ...s, driveFileId, synced: true })`.
5. Manifest = `mergeManifests(remote, { version: 1, samples: synced local samples → entryFromSample }, deleted)`.
6. Downloads: manifest entries whose `sampleId` is not local and whose `fileId` exists in `files` → `downloadFile` → `rebuildFromWav({ id: sampleId, createdAt, wav, floor, synced: true, driveFileId: fileId })` → `putSample` (skip if it returns null).
7. Write the manifest back: `uploadFile(folder, 'manifest.json', 'application/json', JSON.stringify(manifest), existingManifestId)`.

Controller rules: `status` is `off` when there is no client ID. `connect()` (needs a click) runs an interactive sync and sets meta `driveConnected = true`. `start()` (on setup load) runs a non-interactive sync if `driveConnected`, registers `startAutoSync` for the `online` event and subscribes to `store.onLocalChange` (debounced 1 s). A sync never runs while `store.screen.value === 'session'`. After every sync: `store.refreshSamples()`, `lastSync = Date.now()`, status `idle`. Failures set status `error` and `message = 'Drive sync paused. Use Sync now to retry.'`. Interactive token requests use `prompt: ''` when a token was granted before in this page load, otherwise `prompt: 'consent'`; non-interactive requests never open a popup: they fail if no cached token exists.

DriveSection copy: `off` → `Drive backup is off. Set VITE_GOOGLE_CLIENT_ID to turn it on.`; `disconnected` → button `Connect Google Drive` and line `Samples are saved as WAV files in Japa Counter/samples in your Drive.`; otherwise → `Saved to Drive: Japa Counter/samples.`, a status line (`Syncing…` / `Last synced 14:02` / the error message), and button `Sync now`.

- [ ] **Step 1: Write the fake Drive**

`tests/helpers/fake-drive.ts`:

```ts
import type { DriveApi, DriveFile } from '../../src/storage/drive';

export class FakeDrive implements DriveApi {
  files = new Map<string, { name: string; folderId: string; body: ArrayBuffer | string }>();
  uploads = 0;
  deletes = 0;
  private next = 1;
  readonly folderId = 'FOLDER';

  async ensureSamplesFolder(): Promise<string> {
    return this.folderId;
  }

  async listFiles(folderId: string): Promise<DriveFile[]> {
    return [...this.files.entries()]
      .filter(([, f]) => f.folderId === folderId)
      .map(([id, f]) => ({ id, name: f.name, mimeType: f.name.endsWith('.json') ? 'application/json' : 'audio/wav' }));
  }

  async uploadFile(folderId: string, name: string, _mime: string, body: ArrayBuffer | string, existingId?: string): Promise<string> {
    this.uploads++;
    const id = existingId ?? `F${this.next++}`;
    this.files.set(id, { name, folderId, body });
    return id;
  }

  async downloadFile(id: string): Promise<ArrayBuffer> {
    const f = this.files.get(id);
    if (!f) throw new Error(`missing ${id}`);
    return typeof f.body === 'string' ? new TextEncoder().encode(f.body).buffer : f.body;
  }

  async deleteFile(id: string): Promise<void> {
    this.deletes++;
    this.files.delete(id);
  }

  manifestText(): string | undefined {
    const m = [...this.files.values()].find((f) => f.name === 'manifest.json');
    return m && (typeof m.body === 'string' ? m.body : new TextDecoder().decode(m.body));
  }
}
```

- [ ] **Step 2: Write the failing tests**

`tests/unit/storage/sync.test.ts`:

```ts
import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import { deleteSample, getSample, listPendingDeletes, listSamples, openDb, putSample } from '../../../src/storage/db';
import { parseManifest } from '../../../src/storage/manifest';
import { startAutoSync, syncSamples } from '../../../src/storage/sync';
import { FakeDrive } from '../../helpers/fake-drive';
import { makeSampleRecord } from '../../helpers/samples';

const fresh = () => openDb(`test-${crypto.randomUUID()}`);

describe('syncSamples', () => {
  it('does nothing offline', async () => {
    const db = await fresh();
    await putSample(db, makeSampleRecord(101));
    const drive = new FakeDrive();
    const spy = vi.spyOn(drive, 'ensureSamplesFolder');
    expect(await syncSamples({ db, drive, isOnline: () => false })).toEqual({ uploaded: 0, downloaded: 0, deleted: 0, skipped: true });
    expect(spy).not.toHaveBeenCalled();
  });

  it('uploads unsynced samples, marks them synced and writes the manifest', async () => {
    const db = await fresh();
    await putSample(db, makeSampleRecord(102));
    const drive = new FakeDrive();
    const report = await syncSamples({ db, drive, isOnline: () => true });
    expect(report.uploaded).toBe(1);
    const s = (await getSample(db, 'sample-102'))!;
    expect(s.synced).toBe(true);
    expect(drive.files.get(s.driveFileId!)?.name).toMatch(/^sample-.*\.wav$/);
    expect(parseManifest(drive.manifestText()!).samples.map((e) => e.sampleId)).toEqual(['sample-102']);
  });

  it('restores samples on a fresh profile with re-extracted features', async () => {
    const drive = new FakeDrive();
    const a = await fresh();
    await putSample(a, makeSampleRecord(103));
    await putSample(a, makeSampleRecord(104));
    await syncSamples({ db: a, drive, isOnline: () => true });
    const b = await fresh();
    const report = await syncSamples({ db: b, drive, isOnline: () => true });
    expect(report.downloaded).toBe(2);
    const restored = await listSamples(b);
    const original = await listSamples(a);
    expect(restored.map((s) => s.id)).toEqual(original.map((s) => s.id));
    expect(restored[0].take.frames.length).toBe(original[0].take.frames.length);
    expect(restored[0].durationSec).toBe(original[0].durationSec);
    expect(restored.every((s) => s.synced)).toBe(true);
  });

  it('keeps both sides when merging', async () => {
    const drive = new FakeDrive();
    const a = await fresh();
    await putSample(a, makeSampleRecord(105));
    await syncSamples({ db: a, drive, isOnline: () => true });
    const b = await fresh();
    await putSample(b, makeSampleRecord(106));
    await syncSamples({ db: b, drive, isOnline: () => true });
    expect((await listSamples(b)).map((s) => s.id).sort()).toEqual(['sample-105', 'sample-106']);
    expect(parseManifest(drive.manifestText()!).samples).toHaveLength(2);
  });

  it('applies queued deletes to Drive and the manifest', async () => {
    const db = await fresh();
    await putSample(db, makeSampleRecord(107));
    const drive = new FakeDrive();
    await syncSamples({ db, drive, isOnline: () => true });
    await deleteSample(db, 'sample-107');
    const report = await syncSamples({ db, drive, isOnline: () => true });
    expect(report.deleted).toBe(1);
    expect(await listPendingDeletes(db)).toEqual([]);
    expect(parseManifest(drive.manifestText()!).samples).toEqual([]);
    expect((await listSamples(db))).toEqual([]);
  });
});

describe('startAutoSync', () => {
  it('drains the queue when the browser comes back online', async () => {
    const target = new EventTarget();
    const run = vi.fn(async () => {});
    const stop = startAutoSync(run, target);
    target.dispatchEvent(new Event('online'));
    expect(run).toHaveBeenCalledOnce();
    stop();
    target.dispatchEvent(new Event('online'));
    expect(run).toHaveBeenCalledOnce();
  });
});
```

`tests/unit/storage/auth.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { createGoogleTokenProvider, DRIVE_SCOPE, type GoogleOAuth2 } from '../../../src/storage/auth';

function fakeGis(reply: () => { access_token?: string; expires_in?: number; error?: string }) {
  const requests: (string | undefined)[] = [];
  let config: Parameters<GoogleOAuth2['initTokenClient']>[0] | null = null;
  const gis: GoogleOAuth2 = {
    initTokenClient(c) {
      config = c;
      return { requestAccessToken: (o) => { requests.push(o?.prompt); queueMicrotask(() => c.callback(reply())); } };
    },
  };
  return { gis, requests, config: () => config };
}

describe('createGoogleTokenProvider', () => {
  it('asks for drive.file consent the first time and caches the token', async () => {
    let n = 0;
    const f = fakeGis(() => ({ access_token: `t${++n}`, expires_in: 3600 }));
    const get = createGoogleTokenProvider('cid', { loadGis: async () => f.gis, now: () => 0 });
    expect(await get({ forceRefresh: false, interactive: true })).toBe('t1');
    expect(f.config()).toMatchObject({ client_id: 'cid', scope: DRIVE_SCOPE });
    expect(await get({ forceRefresh: false, interactive: false })).toBe('t1');
    expect(f.requests).toEqual(['consent']);
  });

  it('refreshes silently when forced or expired', async () => {
    let n = 0;
    let t = 0;
    const f = fakeGis(() => ({ access_token: `t${++n}`, expires_in: 3600 }));
    const get = createGoogleTokenProvider('cid', { loadGis: async () => f.gis, now: () => t });
    await get({ forceRefresh: false, interactive: true });
    expect(await get({ forceRefresh: true, interactive: true })).toBe('t2');
    t = 3_600_000;
    expect(await get({ forceRefresh: false, interactive: true })).toBe('t3');
    expect(f.requests).toEqual(['consent', '', '']);
  });

  it('never opens a popup when not interactive and no token is cached', async () => {
    const f = fakeGis(() => ({ access_token: 'x', expires_in: 3600 }));
    const get = createGoogleTokenProvider('cid', { loadGis: async () => f.gis });
    await expect(get({ forceRefresh: false, interactive: false })).rejects.toThrow('Drive needs a click to reconnect');
    expect(f.requests).toEqual([]);
  });

  it('rejects on an OAuth error', async () => {
    const f = fakeGis(() => ({ error: 'access_denied' }));
    const get = createGoogleTokenProvider('cid', { loadGis: async () => f.gis });
    await expect(get({ forceRefresh: false, interactive: true })).rejects.toThrow('access_denied');
  });
});
```

`tests/unit/state/drive-controller.test.ts`:

```ts
import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import { createDriveController } from '../../../src/state/drive-controller';
import { getMeta } from '../../../src/storage/db';
import { FakeDrive } from '../../helpers/fake-drive';
import { makeSampleRecord } from '../../helpers/samples';
import { makeStore } from '../../helpers/store';

describe('drive controller', () => {
  it('is off without a client ID', async () => {
    const c = createDriveController(await makeStore(), { clientId: undefined, makeDrive: () => new FakeDrive() });
    expect(c.status.value).toBe('off');
  });

  it('connect() syncs interactively and remembers the connection', async () => {
    const store = await makeStore([111]);
    const drive = new FakeDrive();
    const makeDrive = vi.fn(() => drive);
    const c = createDriveController(store, { clientId: 'cid', makeDrive, isOnline: () => true, events: new EventTarget() });
    expect(c.status.value).toBe('disconnected');
    await c.connect();
    expect(makeDrive).toHaveBeenCalledWith(true);
    expect(c.status.value).toBe('idle');
    expect(store.samples.value[0].synced).toBe(true);
    expect(await getMeta(store.db, 'driveConnected')).toBe(true);
  });

  it('start() syncs when previously connected, and local changes trigger a sync', async () => {
    // Real timers on purpose: fake timers would stall fake-indexeddb.
    const store = await makeStore();
    const drive = new FakeDrive();
    const c = createDriveController(store, { clientId: 'cid', makeDrive: () => drive, isOnline: () => true, events: new EventTarget() });
    await c.connect();
    await c.start();
    await store.addSample(makeSampleRecord(112));
    expect(store.samples.value[0].synced).toBe(false);
    await vi.waitFor(() => expect(store.samples.value[0].synced).toBe(true), { timeout: 4000 });
    c.stop();
  });

  it('never syncs during a session', async () => {
    const store = await makeStore([113]);
    const drive = new FakeDrive();
    const spy = vi.spyOn(drive, 'ensureSamplesFolder');
    const c = createDriveController(store, { clientId: 'cid', makeDrive: () => drive, isOnline: () => true, events: new EventTarget() });
    store.screen.value = 'session';
    await c.syncNow();
    expect(spy).not.toHaveBeenCalled();
  });

  it('reports a paused sync on failure', async () => {
    const store = await makeStore([114]);
    const drive = new FakeDrive();
    vi.spyOn(drive, 'ensureSamplesFolder').mockRejectedValue(new Error('boom'));
    const c = createDriveController(store, { clientId: 'cid', makeDrive: () => drive, isOnline: () => true, events: new EventTarget() });
    await c.syncNow();
    expect(c.status.value).toBe('error');
    expect(c.message.value).toBe('Drive sync paused. Use Sync now to retry.');
  });
});
```

- [ ] **Step 3: Run to see them fail**

Run: `npx vitest run tests/unit/storage/sync.test.ts tests/unit/storage/auth.test.ts tests/unit/state/drive-controller.test.ts`
Expected: FAIL — modules missing.

- [ ] **Step 4: Implement**

`src/storage/sync.ts`:

```ts
import { clearPendingDelete, listPendingDeletes, listSamples, putSample, type JapaDB } from './db';
import type { DriveApi } from './drive';
import { emptyManifest, entryFromSample, MANIFEST_NAME, mergeManifests, parseManifest } from './manifest';
import { rebuildFromWav } from './samples';

export interface SyncReport {
  uploaded: number;
  downloaded: number;
  deleted: number;
  skipped: boolean;
}

export interface SyncDeps {
  db: JapaDB;
  drive: DriveApi;
  isOnline: () => boolean;
}

const fileNameFor = (createdAt: number, id: string) => `sample-${new Date(createdAt).toISOString().replace(/:/g, '-')}-${id.slice(0, 8)}.wav`;

/** Setup-screen sync: deletes, uploads, manifest merge, downloads. Sessions never call this. */
export async function syncSamples({ db, drive, isOnline }: SyncDeps): Promise<SyncReport> {
  const report: SyncReport = { uploaded: 0, downloaded: 0, deleted: 0, skipped: false };
  if (!isOnline()) return { ...report, skipped: true };

  const folder = await drive.ensureSamplesFolder();
  const files = await drive.listFiles(folder);
  const manifestFile = files.find((f) => f.name === MANIFEST_NAME);
  const remote = manifestFile ? parseManifest(new TextDecoder().decode(await drive.downloadFile(manifestFile.id))) : emptyManifest();

  const deleted = new Set<string>();
  for (const id of await listPendingDeletes(db)) {
    await drive.deleteFile(id);
    await clearPendingDelete(db, id);
    deleted.add(id);
  }
  report.deleted = deleted.size;

  for (const s of await listSamples(db)) {
    if (s.synced) continue;
    const driveFileId = await drive.uploadFile(folder, fileNameFor(s.createdAt, s.id), 'audio/wav', s.wav);
    await putSample(db, { ...s, driveFileId, synced: true });
    report.uploaded++;
  }

  const local = await listSamples(db);
  const localIds = new Set(local.map((s) => s.id));
  const manifest = mergeManifests(remote, { version: 1, samples: local.filter((s) => s.synced && s.driveFileId).map(entryFromSample) }, deleted);

  const remoteIds = new Set(files.map((f) => f.id));
  for (const e of manifest.samples) {
    if (localIds.has(e.sampleId) || !remoteIds.has(e.fileId)) continue;
    const wav = await drive.downloadFile(e.fileId);
    const rec = rebuildFromWav({ id: e.sampleId, createdAt: e.createdAt, wav, floor: e.floor, synced: true, driveFileId: e.fileId });
    if (!rec) continue;
    await putSample(db, rec);
    report.downloaded++;
  }

  await drive.uploadFile(folder, MANIFEST_NAME, 'application/json', JSON.stringify(manifest), manifestFile?.id);
  return report;
}

/** Re-runs sync whenever the browser comes back online (upload queue drains). */
export function startAutoSync(run: () => Promise<unknown>, target: EventTarget = window): () => void {
  const onOnline = () => void run();
  target.addEventListener('online', onOnline);
  return () => target.removeEventListener('online', onOnline);
}
```

`src/storage/auth.ts`:

```ts
import type { TokenProvider } from './drive';

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
export const GIS_SRC = 'https://accounts.google.com/gsi/client';
const EXPIRY_MARGIN_MS = 60_000;

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
}

export interface GoogleOAuth2 {
  initTokenClient(config: {
    client_id: string;
    scope: string;
    callback: (r: TokenResponse) => void;
    error_callback?: (e: { type: string }) => void;
  }): { requestAccessToken(o?: { prompt?: string }): void };
}

let gisPromise: Promise<GoogleOAuth2> | null = null;

/** Loads Google Identity Services, the only third-party script the app allows. */
export function loadGis(): Promise<GoogleOAuth2> {
  gisPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = GIS_SRC;
    s.async = true;
    s.onload = () => resolve((window as unknown as { google: { accounts: { oauth2: GoogleOAuth2 } } }).google.accounts.oauth2);
    s.onerror = () => {
      gisPromise = null;
      reject(new Error('Could not load Google sign-in'));
    };
    document.head.appendChild(s);
  });
  return gisPromise;
}

export function createGoogleTokenProvider(
  clientId: string,
  deps: { loadGis?: () => Promise<GoogleOAuth2>; now?: () => number } = {},
): TokenProvider {
  const load = deps.loadGis ?? loadGis;
  const now = deps.now ?? Date.now;
  let token: { value: string; expiresAt: number } | null = null;
  let granted = false;

  const request = async (): Promise<string> => {
    const oauth2 = await load();
    return new Promise((resolve, reject) => {
      const client = oauth2.initTokenClient({
        client_id: clientId,
        scope: DRIVE_SCOPE,
        callback: (r) => {
          if (r.error || !r.access_token) return reject(new Error(r.error ?? 'No access token'));
          granted = true;
          token = { value: r.access_token, expiresAt: now() + (r.expires_in ?? 3600) * 1000 - EXPIRY_MARGIN_MS };
          resolve(r.access_token);
        },
        error_callback: (e) => reject(new Error(e.type)),
      });
      client.requestAccessToken({ prompt: granted ? '' : 'consent' });
    });
  };

  return async ({ forceRefresh, interactive }) => {
    if (!forceRefresh && token && now() < token.expiresAt) return token.value;
    if (!interactive && !granted) throw new Error('Drive needs a click to reconnect');
    return request();
  };
}
```

`src/state/drive-controller.ts`:

```ts
import { signal, type Signal } from '@preact/signals';
import { createContext } from 'preact';
import { useContext } from 'preact/hooks';
import { getMeta, setMeta } from '../storage/db';
import type { DriveApi } from '../storage/drive';
import { startAutoSync, syncSamples } from '../storage/sync';
import type { Store } from './store';

export type DriveStatus = 'off' | 'disconnected' | 'syncing' | 'idle' | 'error';

export interface DriveController {
  status: Signal<DriveStatus>;
  lastSync: Signal<number | null>;
  message: Signal<string | null>;
  connect(): Promise<void>;
  syncNow(): Promise<void>;
  start(): Promise<void>;
  stop(): void;
}

interface Deps {
  clientId: string | undefined;
  makeDrive: (interactive: boolean) => DriveApi;
  isOnline?: () => boolean;
  events?: EventTarget;
}

const PAUSED = 'Drive sync paused. Use Sync now to retry.';
const DEBOUNCE_MS = 1000;

export function createDriveController(store: Store, deps: Deps): DriveController {
  const status = signal<DriveStatus>(deps.clientId ? 'disconnected' : 'off');
  const lastSync = signal<number | null>(null);
  const message = signal<string | null>(null);
  const isOnline = deps.isOnline ?? (() => navigator.onLine);
  const cleanups: (() => void)[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running: Promise<void> | null = null;

  const run = async (interactive: boolean): Promise<void> => {
    if (status.value === 'off' || store.screen.value === 'session') return;
    if (running) return running;
    running = (async () => {
      status.value = 'syncing';
      try {
        const report = await syncSamples({ db: store.db, drive: deps.makeDrive(interactive), isOnline });
        await store.refreshSamples();
        if (!report.skipped) lastSync.value = Date.now();
        message.value = null;
        status.value = 'idle';
      } catch {
        message.value = PAUSED;
        status.value = 'error';
      } finally {
        running = null;
      }
    })();
    return running;
  };

  return {
    status,
    lastSync,
    message,
    async connect() {
      await run(true);
      if (status.value === 'idle') await setMeta(store.db, 'driveConnected', true);
    },
    syncNow: () => run(true),
    async start() {
      if (status.value === 'off') return;
      const connected = (await getMeta<boolean>(store.db, 'driveConnected')) === true;
      cleanups.push(startAutoSync(() => run(false), deps.events ?? window));
      cleanups.push(
        store.onLocalChange(() => {
          clearTimeout(timer);
          timer = setTimeout(() => void run(false), DEBOUNCE_MS);
        }),
      );
      if (connected) await run(false);
    },
    stop() {
      clearTimeout(timer);
      cleanups.splice(0).forEach((c) => c());
    },
  };
}

export const DriveContext = createContext<DriveController | null>(null);

export function useDrive(): DriveController | null {
  return useContext(DriveContext);
}
```

Note: when `start()` finds `driveConnected` but the page was reloaded (no cached token), the non-interactive run fails with status `error` and the "Sync now" message — that is the intended "needs a click" path.

`src/ui/DriveSection.tsx`:

```tsx
import { useDrive } from '../state/drive-controller';

const timeFmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });

export function DriveSection() {
  const drive = useDrive();
  if (!drive || drive.status.value === 'off') {
    return <p class="hint">Drive backup is off. Set VITE_GOOGLE_CLIENT_ID to turn it on.</p>;
  }
  if (drive.status.value === 'disconnected') {
    return (
      <div class="drive">
        <button type="button" onClick={() => void drive.connect()}>Connect Google Drive</button>
        <p class="hint">Samples are saved as WAV files in Japa Counter/samples in your Drive.</p>
      </div>
    );
  }
  const line =
    drive.status.value === 'syncing'
      ? 'Syncing…'
      : drive.message.value ?? (drive.lastSync.value ? `Last synced ${timeFmt.format(drive.lastSync.value)}` : '');
  return (
    <div class="drive">
      <p>Saved to Drive: Japa Counter/samples.</p>
      {line && <p class="hint" role="status">{line}</p>}
      <button type="button" disabled={drive.status.value === 'syncing'} onClick={() => void drive.syncNow()}>Sync now</button>
    </div>
  );
}
```

Modify `src/ui/Settings.tsx`: add `<h3>Google Drive</h3><DriveSection />` above History.

Modify `src/ui/App.tsx`: accept `drive: DriveController | null` and wrap children in `<DriveContext.Provider value={drive}>`; start the controller once on mount and stop on unmount:

```tsx
import { useEffect } from 'preact/hooks';
import type { OpenEngine } from '../audio/protocol';
import { DriveContext, type DriveController } from '../state/drive-controller';
import { StoreContext, type Store } from '../state/store';
import { Session } from './Session';
import { Setup } from './Setup';

export function App({ store, openEngine, drive }: { store: Store; openEngine: OpenEngine; drive: DriveController | null }) {
  useEffect(() => {
    void drive?.start();
    return () => drive?.stop();
  }, [drive]);
  return (
    <StoreContext.Provider value={store}>
      <DriveContext.Provider value={drive}>
        {store.screen.value === 'session' ? (
          <Session openEngine={openEngine} onExit={() => (store.screen.value = 'setup')} />
        ) : (
          <Setup openEngine={openEngine} />
        )}
      </DriveContext.Provider>
    </StoreContext.Provider>
  );
}
```

Modify `src/main.tsx` `boot()`:

```tsx
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
  const tokens = clientId ? createGoogleTokenProvider(clientId) : null;
  const drive = clientId
    ? createDriveController(store, { clientId, makeDrive: (interactive) => new DriveClient(tokens!, undefined, interactive) })
    : null;
  render(<App store={store} openEngine={openAudioEngine} drive={drive} />, document.getElementById('app')!);
```

(imports: `createGoogleTokenProvider` from `./storage/auth`, `DriveClient` from `./storage/drive`, `createDriveController` from `./state/drive-controller`.)

- [ ] **Step 5: Run to see them pass**

Run: `npm test && npm run typecheck && npm run lint && npm run build`
Expected: all pass. Also run `npm run test:e2e` — the e2e tests must still pass (Drive is off without a client ID).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(drive): Google sign-in, sample sync with manifest merge and offline queue"
```

### Task 18: Offline app shell and README

**Files:**
- Modify: `vite.config.ts`, `package.json` (dev dependency `vite-plugin-pwa`)
- Create: `README.md`, `.env.example`

**Interfaces:**
- Consumes: the built app.
- Produces: a service worker (`dist/sw.js`) that precaches the app shell (JS, CSS, HTML, fonts) so the app loads offline (F18); setup docs.

This is configuration; verification is the build output plus a manual offline check, not a unit test.

- [ ] **Step 1: Install and configure**

```bash
npm install -D vite-plugin-pwa
```

In `vite.config.ts` add `import { VitePWA } from 'vite-plugin-pwa';` and extend `plugins`:

```ts
  plugins: [
    preact(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      workbox: { globPatterns: ['**/*.{js,css,html,woff,woff2}'], navigateFallback: 'index.html' },
      manifest: { name: 'Japa Counter', short_name: 'Japa', theme_color: '#000000', background_color: '#000000', display: 'standalone', icons: [] },
    }),
  ],
```

- [ ] **Step 2: Verify**

Run: `npm run build && ls dist/sw.js && grep -c woff2 dist/sw.js`
Expected: `dist/sw.js` exists and lists the font files. No runtime caching rule mentions `googleapis.com` (`grep -c googleapis dist/sw.js` prints 0).

Then: `npm test && npm run test:e2e`
Expected: still green.

- [ ] **Step 3: Write `.env.example` and `README.md`**

`.env.example`:

```
# Google OAuth Web client ID (scope drive.file). Leave empty to run without Drive backup.
VITE_GOOGLE_CLIENT_ID=
```

`README.md`:

````markdown
# Japa Counter

Counts chanted mantras by voice, entirely in the browser. It matches the live mic against your own recorded samples (MFCC + streaming DTW). Audio never leaves your laptop except for sample WAVs saved to your own Google Drive.

Design: [docs/DESIGN.md](docs/DESIGN.md).

## Run

```bash
npm install
npm run dev        # http://localhost:5173 — use this fixed origin so Chrome remembers the mic permission
```

## Test

```bash
npm test               # unit tests
npm run test:harness   # synthetic accuracy harness (fails on any overcount)
npm run test:e2e       # Playwright with Chrome's fake mic
```

## Google Drive backup (optional)

1. In Google Cloud Console create a project, then enable the **Google Drive API**.
2. **OAuth consent screen**: External, publishing status *Testing*, add your Google account as a test user.
3. **Credentials → Create credentials → OAuth client ID → Web application**. Authorised JavaScript origin: `http://localhost:5173`. No redirect URI is needed.
4. Copy `.env.example` to `.env.local` and set `VITE_GOOGLE_CLIENT_ID`.
5. Restart `npm run dev`, open Settings → Connect Google Drive.

Samples are stored as 16 kHz WAV files plus `manifest.json` in `Japa Counter/samples` in your Drive. The app only has `drive.file` access: it can see the files it created and nothing else.
````

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: offline app shell; README with Drive setup"
```

---

## Out of scope for this plan (M5, needs the user's recordings)

Real-voice fixtures and tuning, CMVN/liftering experiments, negative "room and speech" recording, calibration trial mode (F15), and the 108-chant mala run. The harness and e2e structure above are ready to take real WAVs in `tests/fixtures/`.
