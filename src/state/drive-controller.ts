import { effect, signal, untracked, type ReadonlySignal, type Signal } from '@preact/signals';
import { createContext } from 'preact';
import { useContext } from 'preact/hooks';
import { getMeta, setMeta } from '../storage/db';
import type { DriveApi } from '../storage/drive';
import { startAutoSync, syncSamples } from '../storage/sync';
import { MAX_SAMPLES, type Store } from './store';

export type DriveStatus = 'off' | 'disconnected' | 'syncing' | 'idle' | 'error';

export interface DriveController {
  status: Signal<DriveStatus>;
  /** True once a click-started sync has succeeded on this device (remembered across reloads). */
  connected: ReadonlySignal<boolean>;
  lastSync: Signal<number | null>;
  message: Signal<string | null>;
  /** Drive samples not restored because the local store is at MAX_SAMPLES. */
  notDownloaded: Signal<number>;
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
const CONNECT_FAILED = 'Could not connect to Google Drive. Try again.';
const DEBOUNCE_MS = 1000;

export function createDriveController(store: Store, deps: Deps): DriveController {
  const status = signal<DriveStatus>(deps.clientId ? 'disconnected' : 'off');
  const connected = signal(false);
  const lastSync = signal<number | null>(null);
  const message = signal<string | null>(null);
  const notDownloaded = signal(0);
  const isOnline = deps.isOnline ?? (() => navigator.onLine);
  const cleanups: (() => void)[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running: { interactive: boolean; done: Promise<void> } | null = null;

  /** One sync; never rejects. */
  const execute = async (interactive: boolean): Promise<void> => {
    const before = status.value;
    status.value = 'syncing';
    try {
      const report = await syncSamples({
        db: store.db,
        drive: deps.makeDrive(interactive),
        isOnline,
        shouldContinue: () => store.screen.value !== 'session',
        maxLocalSamples: MAX_SAMPLES,
      });
      if (report.aborted) {
        status.value = before; // a session started; the sync resumes when the screen returns to setup
        return;
      }
      if (report.skipped) {
        message.value = connected.value ? null : CONNECT_FAILED;
        status.value = connected.value ? 'idle' : 'disconnected';
        return;
      }
      if (interactive) {
        connected.value = true;
        await setMeta(store.db, 'driveConnected', true);
      }
      lastSync.value = Date.now();
      notDownloaded.value = report.notDownloaded;
      message.value = null;
      status.value = 'idle';
    } catch {
      message.value = connected.value ? PAUSED : CONNECT_FAILED;
      status.value = connected.value ? 'error' : 'disconnected';
    } finally {
      await store.refreshSamples().catch(() => undefined);
    }
  };

  const run = async (interactive: boolean): Promise<void> => {
    if (status.value === 'off') return;
    while (running) {
      // Join a run that is at least as strong; a click waits out a background run, then runs itself.
      if (running.interactive || !interactive) return running.done;
      await running.done;
    }
    if (!interactive && !connected.value) return;
    if (store.screen.value === 'session') return;
    const done = execute(interactive).finally(() => {
      running = null;
    });
    running = { interactive, done };
    return done;
  };

  return {
    status,
    connected,
    lastSync,
    message,
    notDownloaded,
    connect: () => run(true),
    syncNow: () => run(true),
    async start() {
      if (status.value === 'off') return;
      if ((await getMeta<boolean>(store.db, 'driveConnected')) === true && !connected.value) {
        connected.value = true;
        if (status.value === 'disconnected') status.value = 'idle';
      }
      cleanups.push(startAutoSync(() => run(false), deps.events ?? window));
      cleanups.push(
        store.onLocalChange(() => {
          clearTimeout(timer);
          timer = setTimeout(() => void run(false), DEBOUNCE_MS);
        }),
      );
      let screen = store.screen.peek();
      cleanups.push(
        effect(() => {
          const next = store.screen.value;
          // untracked: the effect should depend on the screen only, not on what run() reads and writes.
          if (screen === 'session' && next === 'setup') untracked(() => void run(false));
          screen = next;
        }),
      );
      if (connected.value) await run(false);
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
