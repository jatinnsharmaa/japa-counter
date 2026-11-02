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
