import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import { createDriveController } from '../../../src/state/drive-controller';
import { getMeta, setMeta } from '../../../src/storage/db';
import { DriveClient } from '../../../src/storage/drive';
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

  it('reports a paused sync on failure once connected', async () => {
    const store = await makeStore([114]);
    const drive = new FakeDrive();
    const c = createDriveController(store, { clientId: 'cid', makeDrive: () => drive, isOnline: () => true, events: new EventTarget() });
    await c.connect();
    vi.spyOn(drive, 'ensureSamplesFolder').mockRejectedValue(new Error('boom'));
    await c.syncNow();
    expect(c.status.value).toBe('error');
    expect(c.message.value).toBe('Drive sync paused. Use Sync now to retry.');
  });

  it('stays disconnected when the first connect fails', async () => {
    const store = await makeStore([115]);
    const drive = new FakeDrive();
    vi.spyOn(drive, 'ensureSamplesFolder').mockRejectedValue(new Error('popup_closed'));
    const c = createDriveController(store, { clientId: 'cid', makeDrive: () => drive, isOnline: () => true, events: new EventTarget() });
    await c.connect();
    expect(c.status.value).toBe('disconnected');
    expect(c.connected.value).toBe(false);
    expect(c.message.value).toBe('Could not connect to Google Drive. Try again.');
    expect(await getMeta(store.db, 'driveConnected')).toBeUndefined();
  });

  it('does no background sync before the user connects', async () => {
    const store = await makeStore();
    const drive = new FakeDrive();
    const spy = vi.spyOn(drive, 'ensureSamplesFolder');
    const events = new EventTarget();
    const c = createDriveController(store, { clientId: 'cid', makeDrive: () => drive, isOnline: () => true, events });
    await c.start();
    await store.addSample(makeSampleRecord(116));
    events.dispatchEvent(new Event('online'));
    await new Promise((r) => setTimeout(r, 1500));
    expect(spy).not.toHaveBeenCalled();
    expect(c.status.value).toBe('disconnected');
    c.stop();
  });

  it('a successful Sync now remembers the connection', async () => {
    const store = await makeStore([117]);
    const c = createDriveController(store, { clientId: 'cid', makeDrive: () => new FakeDrive(), isOnline: () => true, events: new EventTarget() });
    await c.syncNow();
    expect(c.connected.value).toBe(true);
    expect(await getMeta(store.db, 'driveConnected')).toBe(true);
  });

  it('start() syncs in the background when a connection is remembered, without connect()', async () => {
    const store = await makeStore([118]);
    await setMeta(store.db, 'driveConnected', true);
    const makeDrive = vi.fn(() => new FakeDrive());
    const c = createDriveController(store, { clientId: 'cid', makeDrive, isOnline: () => true, events: new EventTarget() });
    await c.start();
    expect(makeDrive.mock.calls).toEqual([[false]]);
    expect(c.status.value).toBe('idle');
    expect(store.samples.value[0].synced).toBe(true);
    c.stop();
  });

  it('connect() during a background sync waits for it, then runs interactively', async () => {
    const store = await makeStore([119]);
    await setMeta(store.db, 'driveConnected', true);
    const drive = new FakeDrive();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let entered!: () => void;
    const inFlight = new Promise<void>((r) => (entered = r));
    drive.onCall = async (op) => {
      if (op === 'listFiles' && drive.calls.filter((o) => o === 'listFiles').length === 1) {
        entered();
        await gate;
      }
    };
    const makeDrive = vi.fn(() => drive);
    const c = createDriveController(store, { clientId: 'cid', makeDrive, isOnline: () => true, events: new EventTarget() });
    const started = c.start();
    await inFlight;
    const connecting = c.connect();
    release();
    await Promise.all([started, connecting]);
    expect(makeDrive.mock.calls).toEqual([[false], [true]]);
    expect(drive.calls.filter((o) => o === 'ensureSamplesFolder')).toHaveLength(2);
    c.stop();
  });

  it('a session stops a running sync quietly, and returning to setup syncs again', async () => {
    const store = await makeStore([120, 121]);
    await setMeta(store.db, 'driveConnected', true);
    const drive = new FakeDrive();
    drive.onCall = (op) => {
      if (op === 'uploadFile' && store.screen.value === 'setup' && drive.uploads === 0) store.screen.value = 'session';
    };
    const c = createDriveController(store, { clientId: 'cid', makeDrive: () => drive, isOnline: () => true, events: new EventTarget() });
    await c.start();
    expect(drive.calls).toEqual(['ensureSamplesFolder', 'listFiles', 'uploadFile']);
    expect(c.status.value).toBe('idle');
    expect(c.message.value).toBeNull();
    expect(store.samples.value.map((s) => s.synced)).toEqual([true, false]); // refreshed after the partial run
    store.screen.value = 'setup';
    await vi.waitFor(() => expect(store.samples.value.every((s) => s.synced)).toBe(true), { timeout: 4000 });
    expect(drive.manifestText()).toBeDefined();
    c.stop();
  });

  it('refreshes samples after a partial failure', async () => {
    const store = await makeStore([122]);
    await setMeta(store.db, 'driveConnected', true);
    const drive = new FakeDrive();
    drive.onCall = (op, name) => {
      if (op === 'uploadFile' && name === 'manifest.json') throw new Error('network');
    };
    const c = createDriveController(store, { clientId: 'cid', makeDrive: () => drive, isOnline: () => true, events: new EventTarget() });
    await c.start();
    expect(c.status.value).toBe('error');
    expect(store.samples.value[0].synced).toBe(true);
    c.stop();
  });

  it('a stalled Drive request ends the sync in the paused state', async () => {
    const store = await makeStore([124]);
    await setMeta(store.db, 'driveConnected', true);
    const stalled = (() => new Promise<Response>(() => {})) as unknown as typeof fetch;
    const c = createDriveController(store, {
      clientId: 'cid',
      makeDrive: (interactive) => new DriveClient(async () => 'tok', stalled, interactive, 20),
      isOnline: () => true,
      events: new EventTarget(),
    });
    await c.start();
    expect(c.status.value).toBe('error');
    expect(c.message.value).toBe('Drive sync paused. Use Sync now to retry.');
    c.stop();
  });

  it('reports Drive samples left out by the 10-sample cap', async () => {
    const store = await makeStore();
    const rec = makeSampleRecord(123);
    const drive = new FakeDrive();
    drive.seedSamples(11, rec.wav, rec);
    const c = createDriveController(store, { clientId: 'cid', makeDrive: () => drive, isOnline: () => true, events: new EventTarget() });
    await c.syncNow();
    expect(store.samples.value).toHaveLength(10);
    expect(c.notDownloaded.value).toBe(1);
  });

  it('reports Drive samples that could not be read', async () => {
    const store = await makeStore();
    const rec = makeSampleRecord(124);
    const drive = new FakeDrive();
    drive.seedSamples(3, rec.wav, rec);
    drive.files.set('SEED1', { ...drive.files.get('SEED1')!, body: 'garbage' });
    const c = createDriveController(store, { clientId: 'cid', makeDrive: () => drive, isOnline: () => true, events: new EventTarget() });
    await c.syncNow();
    expect(c.status.value).toBe('idle');
    expect(store.samples.value).toHaveLength(2);
    expect(c.unreadable.value).toBe(1);
  });

  it('pauses on a sample download that fails, instead of reporting it unreadable', async () => {
    const store = await makeStore();
    const rec = makeSampleRecord(125);
    const drive = new FakeDrive();
    drive.seedSamples(2, rec.wav, rec);
    const c = createDriveController(store, { clientId: 'cid', makeDrive: () => drive, isOnline: () => true, events: new EventTarget() });
    await c.syncNow();
    drive.files.set('SEED2', { name: 'seed-2.wav', folderId: drive.folderId, body: rec.wav });
    const m = JSON.parse(drive.manifestText()!) as { version: 1; samples: Record<string, unknown>[] };
    m.samples.push({ ...m.samples[0], sampleId: 'seed-2', fileId: 'SEED2' });
    drive.files.set('MANIFEST', { ...drive.files.get('MANIFEST')!, body: JSON.stringify(m) });
    drive.onCall = (op, id) => {
      if (op === 'downloadFile' && id === 'SEED2') throw new TypeError('Failed to fetch');
    };
    await c.syncNow();
    expect(c.status.value).toBe('error');
    expect(c.message.value).toBe('Drive sync paused. Use Sync now to retry.');
    expect(c.unreadable.value).toBe(0);
  });
});
