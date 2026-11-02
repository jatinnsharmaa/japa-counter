import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import { createDriveController } from '../../../src/state/drive-controller';
import { getMeta } from '../../../src/storage/db';
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

  it('reports a paused sync on failure', async () => {
    const store = await makeStore([114]);
    const drive = new FakeDrive();
    vi.spyOn(drive, 'ensureSamplesFolder').mockRejectedValue(new Error('boom'));
    const c = createDriveController(store, { clientId: 'cid', makeDrive: () => drive, isOnline: () => true, events: new EventTarget() });
    await c.syncNow();
    expect(c.status.value).toBe('error');
    expect(c.message.value).toBe('Drive sync paused. Use Sync now to retry.');
  });
});
