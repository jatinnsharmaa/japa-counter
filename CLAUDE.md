# CLAUDE.md

Guidance for Claude Code (and other coding agents) working in this repository.

## What this is

Japa Counter: a client-only TypeScript web app that counts chanted mantras by voice by matching the live mic against the user's own recorded samples (MFCC + streaming subsequence DTW). Read [README.md](README.md) for the product, [SETUP.md](SETUP.md) for setup and architecture, [docs/DESIGN.md](docs/DESIGN.md) for the spec, and [docs/DECISIONS.md](docs/DECISIONS.md) for why things are the way they are.

## Commands

```bash
npm run dev            # http://localhost:5173 (strictPort; this exact origin matters)
npm test               # unit tests
npm run test:harness   # v1 parity + synthetic accuracy harness (must stay 30/30, 0 false)
npm run test:e2e       # Playwright, Chrome fake mic (slow: ~1.5 min)
npm run lint && npm run typecheck && npm run build
```

Run the harness after any change under `src/engine/` or `src/audio/engine-core.ts`.

## Rules that must not be broken

These come from the user (rows marked **Locked** in docs/DESIGN.md):

- **Privacy:** audio is processed only in the browser. It may leave only as sample WAVs uploaded to the user's own Google Drive, after they press Connect. No analytics, no cloud speech APIs, no third-party scripts except Google Identity Services. Fonts stay self-hosted.
- **Sessions never touch the network.**
- **Zero-touch session:** no on-screen buttons, no manual +1/−1. Esc ends.
- **Bias against overcounting:** an extra count is worse than a missed one. Never loosen the counter or the harness to make a test pass.
- **Mic constraints** stay `{ echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 }` for both recording and sessions.
- **Minimal design:** pure black session screen; mantra first, small dim count, dimmer timer. No cards, shadows, glow, mala ring or caps labels. UI copy in the spec is verbatim (curly apostrophes).
- **Engine parity:** at 16 kHz input the engine must match v1 (`tests/harness/v1-parity.test.ts`). If you change feature extraction, bump `ENGINE_VERSION` in `src/engine/version.ts`.

## How to work here

- **Test-driven:** write the failing test, see it fail, implement, see it pass.
- `src/engine/` is pure TypeScript with no DOM and no runtime dependencies, so it runs in Node tests.
- Preact 11 defers passive `useEffect` cleanups on unmount. Use `useLayoutEffect` where the mic or engine must be released synchronously (Recorder, Session, App already do).
- Components take an `openEngine` function; tests use `tests/helpers/fake-engine.ts`. Drive tests use `tests/helpers/fake-drive.ts`; storage tests use `fake-indexeddb`.
- Drive sync code can delete or overwrite the user's files. Treat every change there as data-safety work: add a test for the failure or race you're guarding against.
- Record new design choices and trade-offs in `docs/DECISIONS.md`.

## Commits

Conventional prefixes (`feat:`, `fix:`, `test:`, `docs:`, `chore:`). **Never add a `Co-Authored-By` line or any AI attribution** to commit messages or PR descriptions.

## Environment

- `.env.local` (git-ignored) holds `VITE_GOOGLE_CLIENT_ID`. Without it, Drive backup is off. Never commit a client secret.
- Open work: M5 real-voice tuning; [#2](https://github.com/jatinnsharmaa/japa-counter/issues/2) (barking keeps a recording running).
