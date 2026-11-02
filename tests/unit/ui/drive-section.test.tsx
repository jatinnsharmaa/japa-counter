// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
import { render, screen } from '@testing-library/preact';
import { describe, expect, it } from 'vitest';
import { createDriveController, DriveContext, type DriveController } from '../../../src/state/drive-controller';
import { DriveSection } from '../../../src/ui/DriveSection';
import { FakeDrive } from '../../helpers/fake-drive';
import { makeStore } from '../../helpers/store';

async function makeController(): Promise<DriveController> {
  return createDriveController(await makeStore(), { clientId: 'cid', makeDrive: () => new FakeDrive(), isOnline: () => true, events: new EventTarget() });
}

const renderSection = (drive: DriveController) => render(<DriveContext.Provider value={drive}><DriveSection /></DriveContext.Provider>);

describe('DriveSection', () => {
  it('keeps the Connect button, not "Saved to Drive", while the first connect runs', async () => {
    const drive = await makeController();
    drive.status.value = 'syncing';
    renderSection(drive);
    expect(screen.getByRole('button', { name: 'Connect Google Drive' })).toHaveProperty('disabled', true);
    expect(screen.queryByText(/Saved to Drive/)).toBeNull();
  });

  it('shows why a connect failed under the Connect button', async () => {
    const drive = await makeController();
    drive.message.value = 'Could not connect to Google Drive. Try again.';
    renderSection(drive);
    expect(screen.getByRole('button', { name: 'Connect Google Drive' })).toHaveProperty('disabled', false);
    expect(screen.getByText('Could not connect to Google Drive. Try again.')).toBeTruthy();
  });

  it('says how many Drive samples were left out by the cap', async () => {
    const drive = await makeController();
    await drive.syncNow();
    drive.notDownloaded.value = 2;
    renderSection(drive);
    expect(screen.getByText('Saved to Drive: Japa Counter/samples.')).toBeTruthy();
    expect(screen.getByText('2 samples in Drive weren’t downloaded. 10 is the most the counter uses.')).toBeTruthy();
  });

  it('uses the singular when one Drive sample was left out', async () => {
    const drive = await makeController();
    await drive.syncNow();
    drive.notDownloaded.value = 1;
    renderSection(drive);
    expect(screen.getByText('1 sample in Drive wasn’t downloaded. 10 is the most the counter uses.')).toBeTruthy();
  });

  it('says how many Drive samples could not be read', async () => {
    const drive = await makeController();
    await drive.syncNow();
    drive.unreadable.value = 2;
    const view = renderSection(drive);
    expect(screen.getByText('2 samples in Drive couldn’t be read.')).toBeTruthy();
    view.unmount();
    drive.unreadable.value = 1;
    renderSection(drive);
    expect(screen.getByText('1 sample in Drive couldn’t be read.')).toBeTruthy();
  });
});
