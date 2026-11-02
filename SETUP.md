# Setup and technical guide

This is the technical companion to the [README](README.md): how to run, configure, test and change Japa Counter.

## Quick start

Requirements: Node.js 22+ (see `.nvmrc`), npm, Google Chrome on a laptop.

First time:

```bash
git clone https://github.com/jatinnsharmaa/japa-counter.git
cd japa-counter
npm install
npx playwright install chromium
```

The last line is only needed if you want to run the browser tests.

Every time:

```bash
cd japa-counter
npm run dev
```

If you cloned it somewhere else, `cd` into that folder instead.

Open **http://localhost:5173** in Chrome. Stop the server with Ctrl + C.

Always use exactly `http://localhost:5173` (`strictPort` is on). Chrome remembers the microphone grant per origin, IndexedDB data (samples, settings, history) lives per origin, and it's the origin registered with Google OAuth.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server on port 5173 (no service worker) |
| `npm run build` | Typecheck, then production build to `dist/` with the service worker |
| `npm run preview` | Serve `dist/` (port 4173; Drive sign-in won't work there unless that origin is added in Google Cloud) |
| `npm test` | Unit tests (`tests/unit`, Vitest) |
| `npm run test:harness` | Accuracy harness: v1 parity + synthetic chant suite on 5 seeds. Fails on any overcount |
| `npm run test:e2e` | Playwright with Chrome's fake microphone: recording flow and a 20-chant session |
| `npm run fixtures` | Regenerate synthetic WAV fixtures in `tests/fixtures/synthetic/` (git-ignored) |
| `npm run lint` / `npm run typecheck` | ESLint / `tsc --noEmit` |

CI (`.github/workflows/ci.yml`) runs lint, typecheck, unit tests, harness and build in one job, and the e2e tests in another.

## Google Drive backup (optional)

Without a client ID the app works fully offline and Settings says Drive backup is off.

1. Google Cloud Console → pick or create a project → enable the **Google Drive API**.
2. **Google Auth Platform** (OAuth consent screen): user type External, publishing status **Testing**, add your Google account under **Audience → Test users**.
3. **Clients → Create client → Web application**. Authorized JavaScript origin: `http://localhost:5173`. No redirect URI. (A *Desktop* client won't work: it has no JavaScript origins.)
4. Create `.env.local` (git-ignored) from `.env.example`:

   ```
   VITE_GOOGLE_CLIENT_ID=<your-client-id>.apps.googleusercontent.com
   ```

   The client ID is public by design. The client secret is not used; don't put it in the repo.
5. Restart `npm run dev`, then Settings → **Connect Google Drive**. In Testing mode Google shows "Google hasn't verified this app": choose Advanced → Go to (app).

## Stack

| Layer | Choice |
| --- | --- |
| Language | TypeScript 6, strict |
| Build / dev server | Vite 8 |
| UI | Preact 11 + `@preact/signals` |
| Audio capture | `getUserMedia` (echo cancellation, noise suppression, auto gain all **off**) → AudioWorklet |
| Engine | Pure TypeScript in a Web Worker, zero runtime dependencies; the same code runs in Node for tests |
| Local storage | IndexedDB via `idb` |
| Cloud storage | Google Drive REST v3, Google Identity Services token client, scope `drive.file` |
| Offline | `vite-plugin-pwa` (precache only, no runtime caching) |
| Fonts | Self-hosted via `@fontsource`: Tiro Devanagari Sanskrit (mantra), Hanken Grotesk (UI) |
| Tests | Vitest (+ happy-dom, @testing-library/preact, fake-indexeddb), Playwright |

## Architecture

```
Mic ─► AudioWorklet ──PCM chunks (MessagePort)──► Engine Web Worker
                                                   resample → 16 kHz
                                                   MFCC frames (50/s)
                                                   recording: collect PCM + frame levels
                                                   session:   Counter (one DTW matcher per sample)
                                                        │ frame / count / ready / error events
                                                        ▼
                                                 UI (Preact) ◄──► IndexedDB
                                                        │  setup screen only
                                                        ▼
                                          Google Drive: Japa Counter/samples/*.wav + manifest.json
```

### Source layout

```
src/
  engine/     dsp.ts (FFT, mel, MFCC)  features.ts (resampler, FeatureStream)  matcher.ts (streaming DTW)
              takes.ts (trim + normalise a sample)  calibrate.ts (threshold, outliers)  counter.ts (live counting)
              floor.ts (noise floor)  version.ts (ENGINE_VERSION)
  audio/      worklet.ts  engine.worker.ts  engine-core.ts (worker logic, testable in Node)  mic.ts  protocol.ts
              wav.ts  waveform.ts  bell.ts
  recording/  autostop.ts (countdown, adaptive auto-stop)
  session/    session-logic.ts (count, bells, timer, formatting)
  storage/    db.ts (IndexedDB)  samples.ts (WAV ↔ sample, F16 re-extraction)
              drive.ts (REST client)  manifest.ts  sync.ts  auth.ts (GIS)
  state/      store.ts (signals store)  drive-controller.ts
  ui/         App  Setup  Recorder  SampleRow  Session  Settings  DriveSection  styles.css
tests/
  unit/  harness/  e2e/  helpers/ (synth voice, fakes, v1 engine copy)
docs/
  DESIGN.md  DECISIONS.md  superpowers/plans/ (implementation plan)  reference/ (v1 prototype)
```

### Counting engine (summary)

- Resample to 16 kHz (windowed-sinc low-pass), frames of 512 samples every 320 (20 ms), pre-emphasis 0.97, Hamming window, 512-point FFT, 40 mel filters (60–7,600 Hz), log, DCT, keep c1–c12 (c0 dropped so loudness doesn't matter).
- Mean normalisation: samples use their own voiced-frame mean; live audio a running mean seeded from the samples.
- One streaming subsequence-DTW matcher per sample (open start and end; steps: advance 2c, hold c+0.03, skip 3c+0.03; 0.5M ≤ N ≤ 2M).
- Counter: candidate below threshold ending on a voiced frame, confirmed after max(8, 0.12M) frames with no better ending, ≥ 60% voiced frames, overlap with last count ≤ 40%, then drop paths that started before the end.
- Threshold = clamp(max(1.3·max pair, 2.2·mean pair), 0.26, 0.32) × strictness (0.85–1.10).
- The engine is behaviourally identical to the v1 prototype at 16 kHz input; `tests/harness/v1-parity.test.ts` proves it.

Full details: [docs/DESIGN.md](docs/DESIGN.md) (engine section).

### Data

- IndexedDB `japa-counter`: `samples` (WAV bytes, trim points, floor, cached features with `engineVersion`), `settings`, `history`, `pendingDeletes`, `meta`.
- Samples are 16 kHz, 16-bit mono WAV. Features are always derived from the stored WAV, so re-extraction is exact. Bump `ENGINE_VERSION` when feature extraction changes; samples are rebuilt on next load (and flagged if they can't be).
- Drive: `Japa Counter/samples/` in My Drive holds `sample-<date>-<id>.wav` and `manifest.json` (sample id, file id, created time, duration, trim, floor, engine version).

## Testing

- **Unit** (`tests/unit/`): DSP maths, resampler, matcher, counter rules, auto-stop, WAV, storage (fake-indexeddb), Drive client (mocked fetch), sync (in-memory FakeDrive), auth (fake GIS), UI components (happy-dom with a FakeEngine).
- **Harness** (`tests/harness/`): `v1-parity` compares frames, takes, calibration and counts with the original v1 engine (`tests/helpers/v1/core.js`, a verbatim copy). The synthetic suite synthesises chants with varied tempo, pitch and loudness, plus distractor phrases and noise: expected 30/30, 0 false counts, latency < 1 s, on seeds 7, 23, 1, 2, 3.
- **E2E** (`tests/e2e/`): Chrome launched with `--use-fake-device-for-media-stream --use-file-for-fake-audio-capture=<wav>%noloop`. One test records a sample through the guided flow; the other seeds three samples and plays 20 continuous chants, expecting `20` counted, the chime, and a history entry.

Real-voice fixtures (M5) will go in `tests/fixtures/` (git LFS or kept outside the repo).

## Deploying

The app is static. `npm run build` produces `dist/`, which can be hosted on any HTTPS static host (e.g. GitHub Pages). Add the hosted origin as an Authorized JavaScript origin on the OAuth client. Today it's only run locally.

## Privacy rules (enforced by design)

- Audio is processed only in the browser. It leaves only as sample WAVs uploaded to the user's own Drive, and only after they press Connect.
- Sessions never touch the network.
- No analytics. The only third-party script is Google Identity Services, loaded on demand.
- The OAuth token is held in memory only; requests go only to `www.googleapis.com`.
