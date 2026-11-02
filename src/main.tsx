import '@fontsource/hanken-grotesk/400.css';
import '@fontsource/hanken-grotesk/500.css';
import '@fontsource/tiro-devanagari-sanskrit/400.css';
import './ui/styles.css';
import { render } from 'preact';
import { openAudioEngine } from './audio/mic';
import { createDriveController } from './state/drive-controller';
import { createStore } from './state/store';
import { createGoogleTokenProvider } from './storage/auth';
import { openDb } from './storage/db';
import { DriveClient } from './storage/drive';
import { App } from './ui/App';

async function boot() {
  const store = createStore(await openDb());
  await store.load();
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
  const tokens = clientId ? createGoogleTokenProvider(clientId) : null;
  const drive = clientId
    ? createDriveController(store, { clientId, makeDrive: (interactive) => new DriveClient(tokens!, undefined, interactive) })
    : null;
  render(<App store={store} openEngine={openAudioEngine} drive={drive} />, document.getElementById('app')!);
}

void boot();
