# Decisions, considerations and trade-offs

A log of the choices made while building v2 (M0–M4), on top of the locked decisions in [DESIGN.md](DESIGN.md) ("User feedback and decisions so far"). Each entry says what was decided, why, and what it costs.

## Scope and process

| Decision | Why | Trade-off |
| --- | --- | --- |
| Build M0–M4 now; M5 (real-voice tuning, calibration trial F15) later | M5 needs the user's own recordings (8 samples, a 108-chant mala run, 10 min of room noise) | Accuracy so far is proven only on synthetic voices |
| Test-driven, with a fresh implementer and a separate reviewer per task, plus a final whole-branch review | Locked requirement (TDD); independent review caught real bugs in 9 of 18 tasks | Slower than writing it in one pass |
| Open questions answered with the doc's defaults: WAV only (no MP3), history local only, bell every 108 on by default, roman line shown smaller in the session, Preact + signals | User accepted the defaults | MP3 download and cross-device history are not available |
| Code on a private GitHub repo, run on localhost | User preference | No hosted URL yet; hosting needs a new OAuth origin |

## Engine

| Decision | Why | Trade-off |
| --- | --- | --- |
| Port the v1 engine unchanged and prove it with a parity test against the verbatim v1 code | v1 already counted 30/30 with 0 false counts; changes should be measured, not assumed | Known v1 weaknesses (no CMVN, no negative examples) stay until M5 |
| Replace v1's box-average decimation with a windowed-sinc (Blackman) resampler, pass-through at 16 kHz | Box averaging aliases high frequencies; pass-through keeps v1 parity exact at 16 kHz | Slightly more CPU per frame (still tiny) |
| Engine in a Web Worker fed by an AudioWorklet over a MessagePort | ScriptProcessorNode is deprecated and runs on the main thread; keeps the UI smooth | More moving parts; browser glue is covered only by e2e tests |
| Mic constraints: echo cancellation, noise suppression, auto gain all off, for recording and sessions | Samples and live audio must be processed identically; AGC changes levels mid-session | Room noise isn't suppressed by the browser |
| Strictness: 6 steps 0.85–1.10, default 1.00, labelled Strictest … Most relaxed | Spec: base × strictness; lower = stricter | Labels are new copy |
| Outlier ("sounds different") flag: a sample whose average pairwise score is over 1.5× the median | Spec F6 gave no rule; 1.5× flagged a different phrase and spared normal variation in tests | Threshold untested on real voice |

## Recording flow

| Decision | Why | Trade-off |
| --- | --- | --- |
| 3-2-1 countdown measures the noise floor; the take stores the **countdown median** as its floor (as v1 did) | A late fix: the drifted chant-phase floor was being stored, which weakened the overcount guard in sessions | — |
| Auto-stop: ≥ 0.8 s voiced, then 0.8 s below a quiet line; 15 s hard limit; Stop always visible; nothing saved before Keep | Spec redesign after v1 missed 20–30% of stops | — |
| Quiet line = max(floor + 8 dB, **median** speech level − 25 dB) (user-approved) | A lifetime-peak line let a cough or a loud opening "Om" end the take mid-chant | 25 dB was sized for a peak; may need retuning on real audio |
| Loud bursts under 5 frames (0.1 s) don't restart the quiet wait | Breaths and clicks shouldn't keep a take running | Longer noises (e.g. barking) do keep it running — see [#2](https://github.com/jatinnsharmaa/japa-counter/issues/2) |
| Floor may only drift down, and never more than 10 dB below the countdown floor | A muted mic or digital silence could otherwise drag it to −120 dB | — |
| One mic stream per setup visit, opened once (guarded against double clicks and unmount while opening) | Locked: permission asked once; no new prompt between recordings | — |
| Cap at 10 samples, enforced in the store | Spec caps matchers at 10 for CPU | An 11th sample is refused |

## Storage and engine updates (F16)

| Decision | Why | Trade-off |
| --- | --- | --- |
| Keep the full chant-phase WAV plus trim points; derive features from the 16-bit WAV, never from the float recording | Re-extraction after an engine change must match exactly | Slightly larger files |
| **Skip & flag** (user-approved): if a sample can't be rebuilt for a new engine version, keep it on disk, leave it out of counting, show "Couldn't update this sample. Record it again." | One bad sample shouldn't block the others or crash startup, and nothing should be silently deleted | The user must re-record flagged samples |

## Session

| Decision | Why | Trade-off |
| --- | --- | --- |
| Fullscreen and wake lock requested straight from the Start click, before the mic opens | Browsers only grant fullscreen right after a user gesture | — |
| Timer from `performance.now()`; display refresh every 500 ms | Spec N5: no drift over 3 hours | — |
| Esc, or leaving fullscreen, ends the session; any key after the summary returns to setup | No on-screen End button (locked) | Chrome uses the first Esc to leave fullscreen |
| Mic failure at start, or an engine crash, ends with "Microphone unavailable. Press any key to go back." | Previously the screen could sit on "Stay quiet" forever | — |
| A session ended before the mic finished opening closes the late engine and ignores a late "ready" | Final review found the screen could get stuck with the mic on | — |
| History saved only when at least one chant was counted | Avoid empty entries | — |

## Google Drive

| Decision | Why | Trade-off |
| --- | --- | --- |
| Scope `drive.file`; folder `Japa Counter/samples`; manifest also stores each sample's floor | Least privilege; the floor is needed to rebuild a sample on a fresh profile | — |
| No background sync until the user presses Connect; the connection is remembered (user-approved) | Avoided a false "Saved to Drive" message before connecting | — |
| Background token refresh never opens a popup; after a reload, sync needs one click (Sync now) | Browsers block popups without a click; surprise popups are bad | A "paused" note after each reload until clicked |
| Sessions never touch the network: Start waits for a running sync, and sync stops between steps if a session starts; returning to setup syncs again | Locked rule | Start can be held briefly (bounded by timeouts) |
| Deletes made during a sync stick (`markSynced` transaction; pending deletes re-read before downloads) | Deleted samples were coming back | — |
| Samples whose Drive file has gone are uploaded again (user-approved) | Trashing the folder or switching accounts left samples falsely marked synced | Can undo a delete made on another device |
| Live files win manifest conflicts | A failed sync after a re-upload left the manifest pointing at a missing file | — |
| Downloads stop at 10 local samples, with a "not downloaded" note (user-approved) | Respect the 10-template cap | Extra samples stay in Drive only |
| Unreadable Drive samples are skipped and reported; network/timeout/auth errors end the sync instead | One bad file shouldn't stop sync forever; a stalled network shouldn't hold Start for minutes | Corrupt files are re-checked each sync |
| A corrupt remote `manifest.json` aborts sync instead of being overwritten | Never drop remote entries | Needs manual repair if it happens |
| Drive requests time out at 30 s; sign-in at 120 s | Bound how long Start can be held | A very slow download is retried next time |
| OAuth client is a dedicated **Web application** client | The existing Desktop client can't have JavaScript origins | — |

## UI and privacy

| Decision | Why | Trade-off |
| --- | --- | --- |
| Fonts self-hosted (`@fontsource`), no Google Fonts link | Spec N1: no third-party runtime requests beyond sign-in | Larger install |
| Service worker precaches the app only; no runtime caching | Offline use (F18) without caching Drive or token responses | No icons yet, so the app isn't installable |
| Extra copy added during the build: "Connecting…", "Could not connect to Google Drive. Try again.", "Finishing Drive sync…", "Couldn't save this sample. Try again.", storage-unavailable line | Real states the spec didn't cover | — |
| Security review before the PR: no findings | — | Defence-in-depth: file IDs in Drive URLs aren't URI-encoded (not exploitable) |

## Known follow-ups

- [#2](https://github.com/jatinnsharmaa/japa-counter/issues/2) Auto-stop keeps running when dogs bark after the chant.
- M5: real-voice fixtures, threshold and floor tuning, CMVN, negative recording, calibration trial (F15).
- Minor items from reviews: invalid target values are saved without a message; a stalled Google sign-in script can leave a duplicate script tag; corrupt Drive files are re-downloaded each sync; Safari may block the Connect popup.
