# Japa Counter: Product & Technical Design (v2)

Nov 2, 2026 · @Jatin Sharma

## Summary

v2 rebuilds the working v1 prototype as a proper web app: hosted on a fixed origin, recordings saved as audio files in Google Drive, a redesigned recording flow, and a near-empty session screen where the mantra dominates.

The counting engine from v1 carries over unchanged as the starting point. It counted 30 of 30 continuous chants with zero false counts on a synthetic test, and the user confirmed real recording works on a laptop.

**How to use this doc with Claude Code**

1. Export this doc as Markdown and place it in the repo as `docs/DESIGN.md`.
2. Ask Claude Code to read it fully, then build milestone by milestone (Build plan section), writing tests first.
3. The Appendix holds the full v1 source. Port the engine code into TypeScript modules; do not reuse the v1 UI.
4. Every decision marked **Locked** comes from the user. Items marked **Open** need the user's answer before that milestone.

| Version | State | Where |
| --- | --- | --- |
| v1 | Working prototype, single HTML file | claude.ai artifact + local `japa-counter.html` |
| v2 | This spec | To be built with Claude Code |

## Problem, user and goals

The user chants a mantra hundreds or thousands of times in a dark room and wants the count kept for him, by voice alone, so he never breaks focus.

**User:** one person (the owner), on a Mac laptop with Chrome. No other users in v2.

**Example mantra (default text):**

```
ॐ नमः शिवाय
om namah shivaya
```

**How he chants:** continuously, rolling one repetition into the next with no breath gap. About 2.6 to 3.3 seconds per repetition (from his six real samples).

| Goal | Measure |
| --- | --- |
| Count every chant without touching anything | Zero interactions between Start and target |
| Never stop short of the target | Overcounts: 0 per session |
| Rarely make him chant extra | Undercount at most 1% (about 10 per 1,008) |
| Total privacy of the voice | Audio only in his browser and his own Google Drive |
| Know how long it took | Elapsed time shown and saved per session |

**Non-goals for v2**

- Accounts, login for other users, sharing, multi-device sync of sessions (Drive holds samples only).
- Word or syllable highlighting while chanting. **Locked:** the user said the yes/no count per chant is enough.
- Manual +1 / −1 correction during a session. **Locked:** the user cannot touch or look at the screen while chanting.
- Mobile app. Laptop browser only.
- Silent (mental) japa. No microphone can hear it.

## User feedback and decisions so far

Every input the user gave, in order, with the decision it drove. v2 must honour all rows marked Locked.

| # | User input | Decision | Status |
| --- | --- | --- | --- |
| 1 | Count chants by voice against my own recording; show the mantra; track time; announce target | Core product | Locked |
| 2 | Voice must not leave my laptop to an outside server | Fully local processing, no cloud speech model | Locked |
| 3 | Low fidelity, no auth for other users | Single-user app | Locked |
| 4 | Yes/no count per chant is enough; no word highlights | Drop karaoke highlighting | Locked |
| 5 | I roll the chant continuously, no gaps | Streaming subsequence matching, not gap-based splitting | Locked |
| 6 | No manual +1/−1; I can only chant and rarely look | Zero-touch session; audio cues; strict matching (undercount over overcount) | Locked |
| 7 | User defines the target | Free number input, presets 108 and 1008 | Locked |
| 8 | Default words: ॐ नमः शिवाय / om namah shivaya | Default mantra text | Locked |
| 9 | Mic blocked on hosted claude.ai page | Hosted artifact frame blocks mic; v1 moved to a local file | Done |
| 10 | Move off a single HTML file; save recordings to Google Drive (or MP3); Drive first | Real app + Drive storage of audio files | Locked |
| 11 | Play, pause and download each recording | Sample player per row | Locked |
| 12 | Mic permission asked again on every recording | Serve from a fixed origin; keep one mic stream open per screen | Locked |
| 13 | Unclear what happens before recording; prompt appears only after permission | Explain first, then ask permission, then a clear countdown | Locked |
| 14 | Auto-stop catches the end only 70 to 80% of the time | New end detection plus always-available Stop, plus review before save | Locked |
| 15 | Design looks AI-generated; wants super minimal. Mantra first, count second (small), timer third (small) | Remove mala ring and decoration; new hierarchy | Locked |
| 16 | Recording experience is clunky; redesign it | New recording flow (UX section) | Locked |
| 17 | Build test-driven | TDD with unit, accuracy and end-to-end tests | Locked |

## Requirements

**Functional**

| ID | Requirement | Priority |
| --- | --- | --- |
| F1 | Edit and save the mantra text (Devanagari + roman lines); default per feedback row 8 | Must |
| F2 | Record a voice sample through the guided flow (UX section) | Must |
| F3 | Save each sample as an audio file in a Google Drive folder the user can see, plus its extracted features | Must |
| F4 | Play, pause and download any sample | Must |
| F5 | Delete a sample (removes from Drive and local cache, after confirm) | Must |
| F6 | Flag a sample that sounds unlike the others and suggest re-recording | Should |
| F7 | Minimum 3 samples to start; recommend 6 to 8 | Must |
| F8 | Set any target (1 to 100,000), presets 108 and 1008 | Must |
| F9 | Start a session with one action; no further input until it ends | Must |
| F10 | Count each continuous chant automatically | Must |
| F11 | Soft bell every 108 chants (toggle, default on) | Must |
| F12 | Three-bell chime at target; session ends by itself | Must |
| F13 | Show elapsed time; save session history (date, count, target, duration, average seconds per chant) | Must |
| F14 | Strictness setting with 6 steps, default strict | Must |
| F15 | Calibration trial mode: chant N times against a physical mala, enter the true number, app suggests a strictness step | Should |
| F16 | Re-extract features from stored audio when the engine version changes | Must |
| F17 | Keep the screen awake during a session | Must |
| F18 | Works offline once loaded; Drive sync resumes when back online | Should |

**Non-functional**

| ID | Requirement |
| --- | --- |
| N1 | Audio never sent anywhere except the user's own Google Drive. No analytics, no third-party scripts at runtime beyond Google sign-in. |
| N2 | Mic permission asked once per origin; never re-asked between recordings in one visit. |
| N3 | Count appears within 1 second of a chant ending. |
| N4 | CPU under 15% of one core during a session on a recent Mac. |
| N5 | 3-hour session without memory growth or timer drift (timer from a monotonic clock). |
| N6 | Session screen pure black, no motion except a soft count change. |
| N7 | Keyboard accessible setup screens; visible focus; respects reduced motion. |

**Success metrics**

| Metric | Target | How measured |
| --- | --- | --- |
| Overcount | 0 per session | Trial against physical mala; accuracy harness |
| Undercount | ≤ 1% | Same |
| False counts in non-chant audio | 0 in 10 minutes of fan, TV, talking | Accuracy harness noise fixtures |
| End-of-recording detection | ≥ 98% of samples stop correctly on their own | 50 recorded attempts |
| Permission prompts | 1 per origin, ever | Manual check |
| Count latency | < 1 s after chant ends | Harness timestamps |

## UX and design

The design rule for v2 is subtraction: the mantra is the only thing that commands attention; everything else whispers.

**Visual hierarchy (Locked, feedback row 15)**

| Rank | Element | Treatment |
| --- | --- | --- |
| 1 | Mantra | Large, centred, one Devanagari serif (Tiro Devanagari Sanskrit), warm off-white on pure black |
| 2 | Count | Small, e.g. 14 to 16 px, low contrast, bottom centre: `247 / 1008` |
| 3 | Timer | Smaller and dimmer than the count, beside or under it: `18:40` |

Removed from v1: the mala bead ring, glow effects, round labels, cards, coloured accents, the “End session” button on screen (Esc ends instead).

**Session screen**

```


           ॐ नमः शिवाय
        om namah shivaya



                     247 / 1008
                       18:40
```

- On each count, the count number fades from slightly brighter back to its rest tone over about 600 ms. No other motion. Off under reduced motion.
- Fullscreen and screen wake lock on Start. Cursor hidden.
- Start sequence: screen goes black, a single line “Stay quiet” for 1.5 s while the noise floor is measured, then it fades and the mantra appears. Counting begins.
- End: three-bell chime, then a quiet summary in the same layout: `1,008 chants  ·  1h 12m 04s`. Any key returns to setup.

**Setup screen**

One narrow column, no cards, no shadows, no section labels in caps. Four plain blocks top to bottom: Mantra (editable text), Voice samples, Target, Start. Strictness, bell toggle and history sit behind a small “Settings” text link.

**Recording flow (Locked redesign, feedback rows 12, 13, 14, 16)**

Why v1 felt clunky: the prompt to chant only appeared after the permission dialog; the first second was silently used to measure room noise, so starting early broke it; and auto-stop needed 1.2 s of near-silence, which a fan, reverb or a breath often prevented (about 20 to 30% misses reported).

1. **Before anything:** a one-line explanation under the button: “You’ll chant the mantra once. Recording stops when you go quiet.”
2. **First visit only:** a short note “Your browser will ask to use the microphone”, then the permission request. The granted stream is kept open for the rest of the setup visit.
3. **Get ready:** a live level line shows the mic is working. Text: “Stay quiet…” with a 3-2-1 countdown (measures noise during the countdown).
4. **Chant:** text changes to “Chant once now.” Level line keeps moving.
5. **Auto-stop:** ends when speech has been heard and the level stays near the floor for 0.8 s, using an adaptive floor (see Engine section). Stop button always visible as a fallback. Hard limit 15 s.
6. **Review:** the clip appears with a waveform, trimmed to the voiced part. Play/pause, “Keep” and “Redo”. Nothing is saved until Keep.
7. **Save:** upload to Drive in the background; row shows a small synced tick when done.

**Sample list row**

`Sample 3   2.6 s   ▶ / ❚❚   Download   Delete   ✓ synced` plus the “sounds different” note when flagged (F6).

**Visual tokens (starting point)**

| Token | Value |
| --- | --- |
| Session background | #000000 |
| Mantra text | #E6DCCB |
| Count | #6F675C |
| Timer | #4A443C |
| Setup background (light / dark) | #F5F4F2 / #0A0A0A |
| Body font | Hanken Grotesk, system-ui fallback |
| Mantra font | Tiro Devanagari Sanskrit, Noto Serif Devanagari fallback |

## Architecture

A static TypeScript web app on a fixed HTTPS origin, with all audio processing in the browser, IndexedDB as the local store, and Google Drive as the home for sample recordings. No backend server.

```
┌─────────────────────── Browser (Chrome, one origin) ────────────────────────┐
│                                                                    │
│  Mic ─► AudioWorklet ──PCM chunks──► Engine Web Worker              │
│            │                       (resample 16 kHz → MFCC →        │
│            │                        matchers → counter)            │
│            ▼                              │ count / level events   │
│       WAV encoder (recording only)        ▼                        │
│            │                         UI (Preact)                   │
│            ▼                              │                        │
│       IndexedDB  ◄───────────────────────────┘                        │
│  (samples, features, settings, history)                            │
│            │  sync (setup screen only)                              │
└────────────┼───────────────────────────────────────────────────┘
             ▼
   Google Drive (user's account)  /Japa Counter/samples/*.wav + manifest.json
```

**Stack**

| Layer | Choice | Why |
| --- | --- | --- |
| Language | TypeScript (strict) | Engine has numeric code where type errors hide bugs |
| Build | Vite | Fast dev server on localhost; static build output |
| UI | Preact + signals (or vanilla TS) | Two screens; a full framework is overhead |
| Audio capture | `getUserMedia` + AudioWorklet | ScriptProcessorNode (used in v1) is deprecated and runs on the main thread |
| Engine | Web Worker, pure TS, zero dependencies | Keeps UI smooth; same code runs in Node for tests |
| Local store | IndexedDB via `idb` | Holds audio blobs; localStorage (v1) caps near 5 MB and is strings only |
| Cloud store | Google Drive REST v3 | User requirement (feedback row 10) |
| Auth | Google Identity Services token client, scope `drive.file` | Browser-only OAuth; `drive.file` limits access to files this app creates |
| Tests | Vitest, Playwright | See Test strategy |
| Hosting | Static HTTPS host (GitHub Pages, Netlify or Vercel) or `localhost` | Needed for persistent mic permission and OAuth origins |

**Why a fixed origin fixes the permission prompts (feedback row 12)**

Chrome remembers “Allow” per origin. A local `file://` page has no stable origin, so the grant does not stick. Serving the app from one HTTPS URL (or `http://localhost:5173` in development) lets Chrome remember it. In addition, the app opens one mic stream per screen visit and reuses it for every recording, so there is no new request between samples.

**Google Drive design**

| Item | Decision |
| --- | --- |
| Folder | `Japa Counter/samples/` in My Drive, visible to the user |
| Audio format | WAV, 16 kHz, 16-bit, mono (about 32 KB per second; 8 samples ≈ 0.8 MB) |
| Why WAV over MP3/Opus | Lossless, so features re-extracted later match the live pipeline exactly; plays and downloads everywhere; no encoder library |
| Metadata | `manifest.json` in the folder: sample id, file id, created time, duration, trim start/end, engine version |
| Features | Not stored in Drive. Derived from WAV and cached in IndexedDB |
| Sync | On setup screen load: list folder, download missing WAVs, upload unsynced ones. Sessions never touch the network |
| Token | Access token lives 1 hour; refresh silently via the token client when the setup screen needs Drive |
| Offline | Recording works offline; upload queues until online |

**Audio settings (same for recording and sessions)**

`getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 } })`. Identical processing on both sides keeps samples and live audio comparable. Automatic gain control in particular would change levels mid-session.

**Engine versioning**

Each cached feature set carries `engineVersion`. On load, if it differs from the app's, features are re-extracted from the stored WAVs (F16). This is the main reason to keep raw audio.

## Counting engine

The engine matches the live mic stream against the user's own recorded samples using MFCC features and streaming subsequence dynamic time warping (DTW). It never transcribes speech.

**Why matching, not speech recognition**

| Option considered | Verdict | Reason |
| --- | --- | --- |
| Cloud speech-to-text (Google, Whisper API) | Rejected | Voice leaves the laptop; mantra syllables are often not dictionary words |
| Chrome Web Speech API | Rejected | Sends audio to Google servers by default |
| Local Whisper | Rejected | Weak on Sanskrit even when fine-tuned; heavy; transcription is more than the task needs |
| Gap-based splitting (count voice bursts) | Rejected | User chants continuously with no gaps (feedback row 5) |
| **Query-by-example matching (MFCC + DTW)** | **Chosen** | Fully local, language-agnostic, speaker-matched by design, tolerant of tempo changes |

**Pipeline per 20 ms frame**

1. Downsample mic audio to 16 kHz (box-average decimation in v1; use a proper low-pass in v2).
2. Frame of 512 samples (32 ms), hop 320 (20 ms), pre-emphasis 0.97, Hamming window, 512-point FFT.
3. 40 mel filters, 60 to 7,600 Hz; log energies; DCT; keep coefficients 1 to 12 (drop c0 so loudness does not matter).
4. Also compute frame energy in dB for voice activity.
5. Mean normalisation: samples use their own mean over voiced frames; live audio uses a running mean over voiced frames (time constant 150 frames ≈ 3 s), seeded with the average sample mean.
6. Unit-normalise the vector; frame distance = 1 − cosine similarity.
7. One streaming matcher per sample template; each finds the template anywhere in the stream (open start, open end).
8. Counter: confirms a match, checks it, removes overlaps, emits one count.

**Matcher (streaming subsequence DTW)**

Per live frame t and template frame i, with cost c = 1 − cos:

```latex
D_t(i) = \min\begin{cases} D_{t-1}(i-1) + 2c & \text{advance 1 (diagonal)}\\ D_{t-1}(i) + c + p & \text{hold}\\ D_{t-1}(i-2) + 3c + p & \text{skip one}\end{cases}
```

The start of each path is carried alongside D. A new path can start at template frame 0 on every live frame (cost 2c). Penalty p = 0.03. Match score at template end = D / (N + M), with N live frames and M template frames. Allowed duration: 0.5M ≤ N ≤ 2M.

**Counter rules**

| Rule | Value | Why |
| --- | --- | --- |
| Voiced frame | energy > floor + 8 dB | Separates chant from room noise |
| Candidate | score below threshold, ending on a voiced frame | v1 bug: ends drifted into trailing silence and the last chant was missed. Requiring a voiced end fixed it |
| Confirm | no better ending within max(8 frames, 0.12M) ≈ 0.5 s | Lets the best alignment win |
| Voiced ratio | ≥ 60% of frames in the match | Rejects matches across silence |
| Overlap | reject if overlap with last count > 40% of the shorter span, or it ends earlier | One count per chant even with 6 to 8 templates |
| After a count | drop all paths starting before (end − 0.2M) in every matcher | Stops double counting the same chant |
| Noise floor | median of 1.5 s quiet at session start; only moves down; capped at sample floor + 10 dB | Continuous chanting has no silences to re-learn from |

**Threshold**

From the samples: score every sample against every other sample (same matcher), giving pairwise best scores.

```latex
\text{base} = \operatorname{clamp}\big(\max(1.3\cdot \text{max}_{pair},\; 2.2\cdot \text{mean}_{pair}),\; 0.26,\; 0.32\big)
```

Live threshold = base × strictness (0.85 to 1.10, default 1.0). The clamp came from sweeps (below): below 0.24 the engine undercounts badly; above 0.36 it starts counting a different phrase.

**Evidence from v1 testing (synthetic voice)**

Test stream: 20 continuous chants, 6 different phrases, 10 chants at varied pace (0.75 to 1.3×), with noise. Five random voices (seeds).

| Threshold | Typical result |
| --- | --- |
| 0.24 | 28 of 30, 0 false |
| 0.27 to 0.33 | 29 to 30 of 30, 0 false |
| 0.36 | 29 to 30 of 30, 1 to 3 false |
| max\_pair × 1.3 (first v1 rule) | 34 counts, 7 false on one seed |

Result shipped in v1: 30 of 30, 0 false on seeds 7 and 23. Synthetic voice is not a real voice; real-audio fixtures are the first job in v2 (Test strategy).

**Known engine weaknesses to address in v2**

- Box-average resampling aliases high frequencies; replace with a windowed-sinc or biquad low-pass.
- No liftering or variance normalisation; c1 to c3 dominate cosine distance. Try cepstral mean and variance normalisation, and measure.
- Threshold is set without negative examples. Add an optional 20-second “room and speech” negative recording to place the threshold between positives and negatives.
- One full matcher per template costs O(templates × frames). Fine for 8 templates; cap at 10.
- Whispered chanting untested.

## Test strategy

Build test-first (Locked, feedback row 17): write the failing test, make it pass, refactor. The accuracy harness is the product’s real acceptance test and gates every engine change.

| Layer | Tool | What it proves | Examples |
| --- | --- | --- | --- |
| Unit: DSP | Vitest | Math is right | FFT of a 1 kHz sine peaks at bin 32; mel filters cover 60 to 7,600 Hz and sum sensibly; MFCC of silence is finite; resampler output length = input × 16000 / rate |
| Unit: matcher | Vitest | Alignment logic | Identical sequence scores ≈ 0; sequence at 0.6× and 1.6× speed still matches; reversed sequence does not; duration bounds enforced |
| Unit: counter | Vitest | Counting rules | Two back-to-back templates give 2 counts; overlap gives 1; NaN frame ignored; match across silence rejected |
| Unit: storage | Vitest + fake-indexeddb | Persistence | Save, load, delete sample; engine version bump triggers re-extraction |
| Unit: Drive client | Vitest + mocked fetch | Sync logic | Upload queue drains when online; 401 triggers token refresh; manifest merge keeps both sides |
| Accuracy harness | Vitest (Node) | Counting quality | See below. Fails the build on any overcount |
| End to end | Playwright + Chrome fake mic | Whole flow | Record 3 samples from WAV files, start session, feed a 20-chant WAV, expect `20 / 20` and the chime state |

**Accuracy harness**

1. **Synthetic suite** (port `test.js` from the Appendix): formant-synthesised chants with tempo, pitch and loudness variation, 5 seeds, distractor phrases, noise. Runs in seconds.
2. **Real fixture suite** (needs the user, once): record in his room
   1. 8 single-chant samples (these become templates),
   2. one continuous run of exactly 108 chants counted on a physical mala,
   3. 10 minutes of non-chant audio: fan, TV, talking, phone.
3. Store fixtures as WAV in `tests/fixtures/` (git LFS or kept outside the repo, never in Drive by default).
4. Report per run: true count, engine count, overcounts, undercounts, false counts in noise, latency per count.
5. **Pass bar:** 0 overcounts, ≤ 1% undercount, 0 counts in noise, every count under 1 s.

**Playwright fake mic**

Launch Chrome with `--use-fake-ui-for-media-stream --use-fake-device-for-media-stream --use-file-for-fake-audio-capture=<fixture.wav>` so the mic plays a known file and permission is auto-granted. Mock Google Drive with route interception.

**Manual checks before each release**

- [ ] One real 27-chant trial with a mala matches exactly
- [ ] Mic permission asked once, then never again across reloads
- [ ] Recording auto-stop works 10 of 10 times
- [ ] Session runs 30 minutes with stable CPU and memory

## Build plan

Six milestones, each ending in green tests and something the user can try. Drive comes after local recording works, so storage problems never block counting.

1. **M0 Scaffold:** Vite + TS + Vitest + Playwright, lint, CI. Folder layout below. Done when an empty test suite runs in CI.
2. **M1 Engine port:** port the Appendix engine to `src/engine/*.ts` with unit tests and the synthetic harness. Done when the harness matches v1 results (30 of 30, 0 false, seeds 7 and 23).
3. **M2 Audio + recording flow:** AudioWorklet, engine worker, WAV encoder, new recording flow with review, IndexedDB. Done when 10 of 10 recordings auto-stop and samples play, pause and download.
4. **M3 Session screen:** minimal screen, fullscreen, wake lock, bells, history. Done when the Playwright fake-mic test counts 20 of 20.
5. **M4 Google Drive:** OAuth, folder, upload/download, manifest, offline queue. Done when samples recorded on one browser profile restore on a fresh one.
6. **M5 Real-voice tuning:** user records fixtures; tune threshold, normalisation and floor until the pass bar holds; add calibration trial (F15). Done when the user’s 108-chant mala run matches.

**Suggested repo layout**

```
src/
  engine/   dsp.ts  features.ts  matcher.ts  counter.ts  calibrate.ts  version.ts
  audio/    worklet.ts  engine.worker.ts  wav.ts  mic.ts
  storage/  db.ts  drive.ts  sync.ts
  ui/       Setup.tsx  Recorder.tsx  SampleRow.tsx  Session.tsx  Settings.tsx
tests/
  unit/  harness/  e2e/  fixtures/
docs/DESIGN.md
```

**Open questions for the user**

| # | Question | Default if no answer |
| --- | --- | --- |
| Q1 | Host on a public static URL, or only run on `localhost`? | GitHub Pages under the user’s account |
| Q2 | Download format: WAV only, or also MP3? | WAV only |
| Q3 | Should session history also sync to Drive? | Local only |
| Q4 | Keep the soft bell every 108 on by default? | On |
| Q5 | Show the roman transliteration line on the session screen? | Show, smaller than Devanagari |

**Risks**

| Risk | Effect | Mitigation |
| --- | --- | --- |
| Real voice behaves unlike synthetic tests | Undercount or false counts | M5 real fixtures gate release |
| Room noise changes mid-session (fan switched on) | Missed counts | Floor capped; strictness steps; negative-sample calibration |
| Pace drifts over long sessions | Rising scores | Record samples at slow and normal pace |
| Google OAuth app in “testing” mode expires refresh every 7 days | Re-consent prompts | Single user can stay in testing mode; token client prompts only on setup |
| Browser throttles a background tab | Missed audio frames | Session is fullscreen and foreground; warn if tab hidden |

## Appendix: v1 source

The complete v1 code, as shipped in `japa-counter.html` (one file: markup, CSS, engine, app). Port **A** and **D** into v2; treat **B** and **C** as reference for behaviour only, since the UI is being redesigned.

| Part | What it is | v2 use |
| --- | --- | --- |
| A | Engine: DSP, MFCC, matcher, calibration, counter | Port to TypeScript, keep behaviour, add tests |
| B | App logic: mic, recording, session, storage | Reference only |
| C | Markup and CSS | Do not reuse |
| D | Synthetic accuracy harness (Node) | Port to Vitest harness |

### A. Engine (pure JS, no dependencies)

```javascript
const SR = 16000, FRAME = 512, HOP = 320, NFFT = 512, NMEL = 40, NCEP = 12;
const FPS = SR / HOP; // 50 frames per second

const DSP = (() => {
  const half = NFFT / 2;
  const cosT = new Float64Array(half), sinT = new Float64Array(half);
  for (let k = 0; k < half; k++) { cosT[k] = Math.cos(2 * Math.PI * k / NFFT); sinT[k] = Math.sin(2 * Math.PI * k / NFFT); }
  const bits = Math.log2(NFFT);
  const rev = new Uint16Array(NFFT);
  for (let i = 0; i < NFFT; i++) { let r = 0; for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b); rev[i] = r; }
  const win = new Float64Array(FRAME);
  for (let i = 0; i < FRAME; i++) win[i] = 0.54 - 0.46 * Math.cos(2 * Math.PI * i / (FRAME - 1));
  const mel = f => 2595 * Math.log10(1 + f / 700), imel = m => 700 * (Math.pow(10, m / 2595) - 1);
  const lo = mel(60), hi = mel(7600), pts = [];
  for (let i = 0; i < NMEL + 2; i++) pts.push(Math.floor((NFFT + 1) * imel(lo + (hi - lo) * i / (NMEL + 1)) / SR));
  const filters = [];
  for (let m = 1; m <= NMEL; m++) {
    const a = pts[m - 1], b = pts[m], c = pts[m + 1], w = [];
    for (let k = a; k <= c; k++) {
      const v = k < b ? (k - a) / Math.max(1, b - a) : (c - k) / Math.max(1, c - b);
      w.push(Math.max(0, v));
    }
    filters.push({ a, w });
  }
  const dct = [];
  for (let k = 1; k <= NCEP; k++) {
    const row = new Float64Array(NMEL);
    for (let n = 0; n < NMEL; n++) row[n] = Math.cos(Math.PI * k * (n + 0.5) / NMEL);
    dct.push(row);
  }
  const re = new Float64Array(NFFT), im = new Float64Array(NFFT), logm = new Float64Array(NMEL);

  function frame(x) {
    let e = 0;
    for (let i = 0; i < FRAME; i++) e += x[i] * x[i];
    const db = 10 * Math.log10(e / FRAME + 1e-12);
    im.fill(0);
    let prev = x[0];
    for (let i = 0; i < FRAME; i++) { const s = x[i] - 0.97 * prev; prev = x[i]; re[rev[i]] = s * win[i]; }
    for (let size = 2; size <= NFFT; size <<= 1) {
      const h = size >> 1, step = NFFT / size;
      for (let i = 0; i < NFFT; i += size) for (let j = 0; j < h; j++) {
        const k = j * step, a = i + j, b = a + h;
        const tr = re[b] * cosT[k] + im[b] * sinT[k], ti = -re[b] * sinT[k] + im[b] * cosT[k];
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
      }
    }
    for (let m = 0; m < NMEL; m++) {
      const f = filters[m]; let s = 0;
      for (let j = 0; j < f.w.length; j++) { const k = f.a + j; if (k > half) break; s += f.w[j] * (re[k] * re[k] + im[k] * im[k]); }
      logm[m] = Math.log(s + 1e-10);
    }
    const v = new Float32Array(NCEP);
    for (let k = 0; k < NCEP; k++) { let s = 0; const row = dct[k]; for (let n = 0; n < NMEL; n++) s += row[n] * logm[n]; v[k] = s; }
    return { v, db };
  }
  return { frame };
})();

// Downsamples any input rate to 16 kHz and emits one feature frame every 20 ms.
class FeatureStream {
  constructor(inRate, onFrame) {
    this.r = inRate / SR; this.acc = 0; this.cnt = 0; this.pos = 0;
    this.buf = new Float32Array(SR); this.n = 0; this.onFrame = onFrame;
  }
  push(input) {
    for (let i = 0; i < input.length; i++) {
      this.acc += input[i]; this.cnt++; this.pos += 1;
      if (this.pos >= this.r) {
        this.buf[this.n++] = this.acc / this.cnt; this.acc = 0; this.cnt = 0; this.pos -= this.r;
        if (this.n >= FRAME) {
          this.onFrame(DSP.frame(this.buf.subarray(0, FRAME)));
          this.buf.copyWithin(0, HOP, this.n); this.n -= HOP;
        }
      }
    }
  }
}

function vsub(v, m) { const o = new Float32Array(v.length); for (let i = 0; i < v.length; i++) o[i] = v[i] - m[i]; return o; }
function unit(v) {
  let s = 0; for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  s = Math.sqrt(s) || 1; const o = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) o[i] = v[i] / s; return o;
}

// Streaming subsequence DTW: finds the template anywhere inside a continuous stream.
class Matcher {
  constructor(tpl) {
    this.T = tpl; const M = this.M = tpl.length;
    this.D = new Float64Array(M).fill(Infinity); this.S = new Int32Array(M).fill(-1);
    this.nD = new Float64Array(M); this.nS = new Int32Array(M); this.cand = null;
  }
  reset() { this.D.fill(Infinity); this.cand = null; }
  step(x, t) {
    const T = this.T, M = this.M, D = this.D, S = this.S, nD = this.nD, nS = this.nS, PEN = 0.03;
    for (let i = 0; i < M; i++) {
      const ti = T[i]; let d = 0;
      for (let k = 0; k < x.length; k++) d += ti[k] * x[k];
      const c = d >= 1 ? 0 : 1 - d;
      let best, bs;
      if (i === 0) {
        best = 2 * c; bs = t;
        const h = D[0] + c + PEN; if (h < best) { best = h; bs = S[0]; }
      } else {
        best = D[i - 1] + 2 * c; bs = S[i - 1];
        const h = D[i] + c + PEN; if (h < best) { best = h; bs = S[i]; }
        if (i >= 2) { const s2 = D[i - 2] + 3 * c + PEN; if (s2 < best) { best = s2; bs = S[i - 2]; } }
      }
      nD[i] = best; nS[i] = bs;
    }
    this.D = nD; this.nD = D; this.S = nS; this.nS = S;
    const e = this.D[M - 1];
    if (!isFinite(e)) return null;
    const ts = this.S[M - 1], N = t - ts + 1;
    if (N < 0.5 * M || N > 2 * M) return null;
    return { score: e / (N + M), ts, te: t };
  }
  dropUpTo(f) { const D = this.D, S = this.S; for (let i = 0; i < this.M; i++) if (S[i] <= f) D[i] = Infinity; }
}

// Turns one recorded sample (frames of {v, db}) into a trimmed, mean-normalised template.
function processTake(frames, floor) {
  const thr = floor + 8; let a = -1, b = -1;
  for (let i = 0; i < frames.length; i++) if (frames[i].db > thr) { if (a < 0) a = i; b = i; }
  if (a < 0 || b - a < 40) return null;
  a = Math.max(0, a - 1); b = Math.min(frames.length - 1, b + 1);
  const seg = frames.slice(a, b + 1), mean = new Float32Array(NCEP); let n = 0;
  for (const f of seg) if (f.db > thr) { for (let k = 0; k < NCEP; k++) mean[k] += f.v[k]; n++; }
  for (let k = 0; k < NCEP; k++) mean[k] /= n;
  return { frames: seg.map(f => vsub(f.v, mean)), mean, dur: seg.length / FPS };
}

function bestScore(tpl, frames) {
  const m = new Matcher(tpl); let best = Infinity;
  for (let t = 0; t < frames.length; t++) { const r = m.step(frames[t], t); if (r && r.score < best) best = r.score; }
  return best;
}

// Compares every sample against every other to set the match limit.
function calibrate(takes) {
  const n = takes.length; if (n < 2) return null;
  const U = takes.map(tk => tk.frames.map(unit));
  const per = U.map(() => []), all = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    if (i === j) continue;
    const s = bestScore(U[i], U[j]);
    if (isFinite(s)) { all.push(s); per[i].push(s); per[j].push(s); }
  }
  if (!all.length) return null;
  const mean = all.reduce((a, b) => a + b, 0) / all.length;
  const sd = Math.sqrt(all.reduce((acc, b) => acc + (b - mean) ** 2, 0) / all.length);
  const max = Math.max(...all);
  const perAvg = per.map(p => p.length ? p.reduce((a, b) => a + b, 0) / p.length : Infinity);
  return { base: Math.min(0.32, Math.max(0.26, max * 1.3, mean * 2.2)), mean, sd, max, perAvg };
}

// Live counter: feeds frames through every template matcher and emits one count per chant.
class Counter {
  constructor(takes, opts) {
    this.matchers = takes.map(tk => new Matcher(tk.frames.map(unit)));
    this.Mavg = this.matchers.reduce((a, m) => a + m.M, 0) / this.matchers.length;
    this.mean = new Float32Array(NCEP);
    for (const tk of takes) for (let k = 0; k < NCEP; k++) this.mean[k] += tk.mean[k] / takes.length;
    this.thr = opts.thr; this.floor = opts.floor;
    this.onCount = opts.onCount; this.onScore = opts.onScore || null;
    this.t = 0; this.voiced = new Uint8Array(4096); this.last = null;
  }
  reset() { for (const m of this.matchers) m.reset(); this.last = null; }
  feed(fr) {
    if (!isFinite(fr.db)) return;
    const t = this.t++, v = fr.v, db = fr.db;
    if (db < this.floor) this.floor = 0.9 * this.floor + 0.1 * db;
    const isV = db > this.floor + 8;
    this.voiced[t & 4095] = isV ? 1 : 0;
    if (isV) for (let k = 0; k < NCEP; k++) this.mean[k] += (v[k] - this.mean[k]) / 150;
    const x = unit(vsub(v, this.mean));
    let bestNow = Infinity;
    for (const m of this.matchers) {
      const r = m.step(x, t);
      if (r) {
        if (r.score < bestNow) bestNow = r.score;
        if (isV && r.score < this.thr && (!m.cand || r.score < m.cand.score)) m.cand = r;
      }
      if (m.cand && t - m.cand.te >= Math.max(8, Math.round(0.12 * m.M))) {
        const c = m.cand; m.cand = null; this.emit(c);
      }
    }
    if (this.onScore) this.onScore(bestNow, this.thr, isV);
  }
  emit(c) {
    const n = c.te - c.ts + 1; let v = 0;
    for (let f = c.ts; f <= c.te; f++) v += this.voiced[f & 4095];
    if (v / n < 0.6) return;
    if (this.last) {
      const ov = Math.min(c.te, this.last.te) - Math.max(c.ts, this.last.ts);
      if (c.te <= this.last.te || ov > 0.4 * Math.min(n, this.last.te - this.last.ts + 1)) return;
    }
    this.last = c;
    const cut = c.te - Math.round(0.2 * this.Mavg);
    for (const m of this.matchers) { m.dropUpTo(cut); if (m.cand && m.cand.ts <= cut) m.cand = null; }
    this.onCount(c);
  }
}
```

### B. App logic (reference only)

```javascript
const $ = id => document.getElementById(id);
const K = { set: 'japa.v1.settings', samples: 'japa.v1.samples', hist: 'japa.v1.history' };
const load = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };

const settings = Object.assign({ mantra: 'ॐ नमः शिवाय\nom namah shivaya', target: 108, strict: 1, bell: true }, load(K.set, {}));
let stored = load(K.samples, { floor: -60, items: [] });
let takes = [], cal = null;

function hydrate() {
  takes = stored.items.map(it => ({ frames: it.frames.map(f => Float32Array.from(f)), mean: Float32Array.from(it.mean), dur: it.dur }));
  cal = takes.length >= 3 ? calibrate(takes) : null;
}
function persistSamples() {
  const r = x => Math.round(x * 1000) / 1000;
  stored.items = takes.map(t => ({ frames: t.frames.map(f => Array.from(f, r)), mean: Array.from(t.mean, r), dur: t.dur }));
  if (!save(K.samples, stored)) $('calStatus').textContent = 'Couldn’t save samples in this browser.';
}
const median = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

// ----- Microphone (v2: replace ScriptProcessor with AudioWorklet + Worker) -----
const Mic = {
  ctx: null, stream: null, node: null,
  async start(onFrame) {
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    await this.ctx.resume();
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    const src = this.ctx.createMediaStreamSource(this.stream);
    this.node = this.ctx.createScriptProcessor(2048, 1, 1);
    const fs = new FeatureStream(this.ctx.sampleRate, onFrame);
    this.node.onaudioprocess = e => fs.push(e.inputBuffer.getChannelData(0));
    const g = this.ctx.createGain(); g.gain.value = 0;
    src.connect(this.node); this.node.connect(g); g.connect(this.ctx.destination);
  },
  stop() {
    try { this.node && (this.node.onaudioprocess = null); this.stream && this.stream.getTracks().forEach(t => t.stop()); } catch (e) {}
    const c = this.ctx; this.ctx = null; this.stream = null; this.node = null;
    if (c) setTimeout(() => { try { c.close(); } catch (e) {} }, 4000);
  }
};

// Bell: three sine partials with exponential decay
function bell(ctx, when = 0, freq = 528, vol = 0.12) {
  if (!ctx) return;
  const t = ctx.currentTime + when;
  [[1, 1], [2.76, 0.35], [5.4, 0.12]].forEach(([m, a]) => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = freq * m; o.type = 'sine';
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol * a, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.6);
    o.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t + 2.7);
  });
}

// ----- Recording a sample (v1 flow; replaced in v2) -----
// 1. 50 frames (1 s) of quiet -> noise floor = median dB
// 2. collect frames; voiced = dB > floor + 8
// 3. auto-stop when voiced >= 40 frames AND 60 consecutive unvoiced frames, or 25 s
// 4. processTake(frames, floor) -> template; save; recalibrate
let recording = null;
$('recBtn').onclick = async () => {
  if (recording) { recording.finish(); return; }
  const btn = $('recBtn'), st = $('recState');
  const r = recording = { phase: 'quiet', dbs: [], frames: [], voiced: 0, silentRun: 0, floor: -60 };
  r.finish = () => {
    if (recording !== r) return; recording = null; Mic.stop(); btn.textContent = 'Record a sample';
    if (r.phase !== 'chant') { st.textContent = ''; return; }
    const tk = processTake(r.frames, r.floor);
    if (!tk) { st.textContent = 'Didn’t catch a full chant. Try again, a little closer to the mic.'; return; }
    takes.push(tk); stored.floor = r.floor; cal = takes.length >= 3 ? calibrate(takes) : null;
    persistSamples(); renderSamples(); st.textContent = `Sample ${takes.length} saved.`;
  };
  btn.textContent = 'Stop'; st.textContent = 'Stay quiet for a moment…';
  try {
    await Mic.start(fr => {
      if (recording !== r || !isFinite(fr.db)) return;
      if (r.phase === 'quiet') {
        r.dbs.push(fr.db);
        if (r.dbs.length >= 50) { r.floor = median(r.dbs); r.phase = 'chant'; st.textContent = 'Chant the mantra once now.'; }
        return;
      }
      r.frames.push(fr);
      if (fr.db > r.floor + 8) { r.voiced++; r.silentRun = 0; } else r.silentRun++;
      if ((r.voiced >= 40 && r.silentRun >= 60) || r.frames.length > 25 * FPS) r.finish();
    });
  } catch (e) { recording = null; Mic.stop(); btn.textContent = 'Record a sample'; st.textContent = micError(e); }
};

// ----- Session -----
// 1. fullscreen + wake lock
// 2. 75 frames (1.5 s) quiet -> floor = min(median, enrolment floor + 10)
// 3. new Counter(takes, { thr: cal.base * settings.strict, floor, onCount })
// 4. onCount: count++; bell every 108; at target -> three bells, stop mic, save history
const S = { on: false, count: 0, target: 108, start: 0, timerId: 0, counter: null, wake: null, finished: false };
async function startSession() {
  if (!cal) return;
  Object.assign(S, { on: true, count: 0, target: settings.target, start: 0, finished: false });
  const el = $('session'); el.classList.remove('done'); el.classList.add('on');
  try { if (el.requestFullscreen && !document.fullscreenElement) await el.requestFullscreen(); } catch (e) {}
  try { if (navigator.wakeLock) S.wake = await navigator.wakeLock.request('screen'); } catch (e) {}
  const dbs = []; let phase = 'quiet';
  await Mic.start(fr => {
    if (!S.on || S.finished || !isFinite(fr.db)) return;
    if (phase === 'quiet') {
      dbs.push(fr.db);
      if (dbs.length >= 75) {
        const floor = Math.min(median(dbs), stored.floor + 10);
        S.counter = new Counter(takes, { thr: cal.base * settings.strict, floor, onCount });
        phase = 'live'; S.start = performance.now();
        S.timerId = setInterval(() => { $('sTimer').textContent = fmtTime((performance.now() - S.start) / 1000); }, 500);
      }
      return;
    }
    S.counter.feed(fr);
  });
}
function onCount() {
  if (S.finished) return;
  S.count++; renderCount(true);
  if (S.count >= S.target) { finishSession(true); return; }
  if (settings.bell && S.count % 108 === 0) bell(Mic.ctx);
}
function finishSession(reached) {
  if (S.finished) return; S.finished = true;
  clearInterval(S.timerId);
  const secs = S.start ? (performance.now() - S.start) / 1000 : 0;
  if (reached && Mic.ctx) { bell(Mic.ctx, 0, 528, 0.16); bell(Mic.ctx, 0.9, 660, 0.14); bell(Mic.ctx, 1.8, 792, 0.12); }
  Mic.stop();
  try { S.wake && S.wake.release(); } catch (e) {} S.wake = null;
  if (S.count > 0) { const h = load(K.hist, []); h.unshift({ at: Date.now(), count: S.count, target: S.target, secs }); save(K.hist, h.slice(0, 200)); }
}
// Rendering helpers (renderSamples, renderCount, buildMala, fmtTime) omitted: UI is redesigned in v2.
```

### C. Markup and CSS (do not reuse)

v1 used a light/dark token set for setup (`--bg #F1EFF4 / #130F1B`, accent `#9A5508 / #F2A43A`) and a pure black session overlay with a 108-bead SVG mala ring, a large serif count and glow animation on each count. The user rejected this look as too decorated (feedback row 15). v2 follows the UX section instead. The full v1 file stays available as `japa-counter.html` for reference.

### D. Synthetic accuracy harness (Node)

Generates formant-synthesised chants, enrols 6 samples, streams 20 continuous chants + 6 distractor phrases + 10 chants at varied pace, and reports counts. Run: `node test.js` with the engine in `core.js`.

```javascript
const fs = require('fs');
eval(fs.readFileSync('core.js', 'utf8') + ';global.X={FeatureStream,processTake,calibrate,Counter,FPS,SR};');
const SRr = 16000;
let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
// [duration s, formant1 Hz, formant2 Hz, voiced 1/0]
const MANTRA = [[0.55,600,1000,1],[0.22,300,900,1],[0.35,700,1800,1],[0.07,0,0,0],[0.4,300,2300,1],[0.06,0,0,0],[0.3,280,2400,1],[0.4,700,1200,1],[0.3,400,800,1],[0.35,650,1700,1],[0.07,0,0,0],[0.35,320,2200,1],[0.3,500,1000,1]];
const OTHER  = [[0.4,350,2100,1],[0.3,650,1100,1],[0.07,0,0,0],[0.5,450,900,1],[0.35,300,2400,1],[0.4,700,1300,1],[0.3,380,1900,1],[0.45,560,850,1],[0.3,300,2300,1]];
function synth(spec, { tempo = 1, f0 = 140, shift = 1, amp = 0.3 } = {}) {
  const out = []; const ph = []; for (let h = 0; h < 90; h++) ph.push(rnd() * 6.28);
  for (const [d, f1, f2, v] of spec) {
    const n = Math.round(d * tempo * (0.9 + 0.2 * rnd()) * SRr); const F1 = f1 * shift, F2 = f2 * shift;
    for (let i = 0; i < n; i++) {
      let s = 0; const t = out.length / SRr;
      if (v) { const f = f0 * (1 + 0.02 * Math.sin(2 * Math.PI * 5 * t));
        for (let h = 1; h * f < 7500; h++) { const fh = h * f; const g = 1 / (1 + ((fh - F1) / 90) ** 2) + 0.7 / (1 + ((fh - F2) / 130) ** 2) + 0.02; s += g * Math.sin(2 * Math.PI * fh * t + ph[h]); }
        s *= 0.25; }
      else s = (rnd() * 2 - 1) * 0.4;
      const env = Math.min(1, i / 160, (n - i) / 160); out.push(s * amp * (0.6 + 0.4 * env));
    }
  }
  return out;
}
const sil = s => Array.from({ length: Math.round(s * SRr) }, () => 0);
const addNoise = a => a.map(x => x + (rnd() * 2 - 1) * 0.002);
const vary = () => ({ tempo: 0.85 + 0.3 * rnd(), f0: 125 + 30 * rnd(), shift: 0.96 + 0.08 * rnd(), amp: 0.15 + 0.3 * rnd() });
function feats(a) { const fr = []; const fs = new X.FeatureStream(SRr, f => fr.push(f)); fs.push(Float32Array.from(a)); return fr; }

// Enrol 6 samples
const quiet = feats(addNoise(sil(1)));
const floor = quiet.map(f => f.db).sort((a, b) => a - b)[Math.floor(quiet.length / 2)];
const takes = [];
for (let i = 0; i < 6; i++) takes.push(processTake(feats(addNoise([...sil(0.6), ...synth(MANTRA, vary()), ...sil(0.8)])), floor));
const cal = calibrate(takes);

// Continuous stream: 20 chants, 2 s gap, 6 distractors, 1 s gap, 10 chants at 0.75-1.3x pace
let stream = [...sil(1)]; const marks = [];
const addReps = (spec, n, v) => { for (let i = 0; i < n; i++) { stream.push(...synth(spec, v())); marks.push([spec === MANTRA ? 'M' : 'O', stream.length / SRr]); } };
addReps(MANTRA, 20, vary); stream.push(...sil(2)); addReps(OTHER, 6, vary); stream.push(...sil(1));
addReps(MANTRA, 10, () => ({ ...vary(), tempo: 0.75 + 0.55 * rnd() })); stream.push(...sil(2));
stream = addNoise(stream);

const counts = [];
const c = new X.Counter(takes, { thr: cal.base, floor, onCount: x => counts.push(x.te / 50) });
feats(stream).forEach(f => c.feed(f));
console.log('counted', counts.length, 'expected 30');
const otherStart = marks[19][1] + 2, otherEnd = marks[25][1];
console.log('false counts in distractor region', counts.filter(t => t > otherStart && t <= otherEnd + 0.5).length);
```
