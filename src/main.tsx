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
