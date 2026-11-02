# Japa Counter

Counts chanted mantras by voice, entirely in the browser. It matches the live mic against your own recorded samples (MFCC + streaming DTW). Audio never leaves your laptop except for sample WAVs saved to your own Google Drive.

Design: [docs/DESIGN.md](docs/DESIGN.md).

## Status

Milestones M0–M4 are built. M5 (tuning with real voice, using your own recordings) is next.

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

## Offline

`npm run build` emits a service worker (`dist/sw.js`) that precaches the app shell, workers and fonts, so the app loads without a network once visited. The service worker is off in the dev server.

## Google Drive backup (optional)

1. In Google Cloud Console create a project, then enable the **Google Drive API**.
2. **OAuth consent screen**: External, publishing status *Testing*, add your Google account as a test user.
3. **Credentials → Create credentials → OAuth client ID → Web application**. Authorised JavaScript origin: `http://localhost:5173`. No redirect URI is needed.
4. Copy `.env.example` to `.env.local` and set `VITE_GOOGLE_CLIENT_ID`.
5. Restart `npm run dev`, open Settings → Connect Google Drive.

Samples are stored as 16 kHz WAV files plus `manifest.json` in `Japa Counter/samples` in your Drive. The app only has `drive.file` access: it can see the files it created and nothing else.
