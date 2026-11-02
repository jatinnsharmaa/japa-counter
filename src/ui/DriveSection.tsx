import { useDrive } from '../state/drive-controller';
import { MAX_SAMPLES } from '../state/store';

const timeFmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });

export function DriveSection() {
  const drive = useDrive();
  if (!drive || drive.status.value === 'off') {
    return <p class="hint">Drive backup is off. Set VITE_GOOGLE_CLIENT_ID to turn it on.</p>;
  }
  const syncing = drive.status.value === 'syncing';
  if (!drive.connected.value) {
    const note = syncing ? 'Connecting…' : drive.message.value;
    return (
      <div class="drive">
        <button type="button" disabled={syncing} onClick={() => void drive.connect()}>Connect Google Drive</button>
        <p class="hint">Samples are saved as WAV files in Japa Counter/samples in your Drive.</p>
        {note && <p class="hint" role="status">{note}</p>}
      </div>
    );
  }
  const line = syncing ? 'Syncing…' : drive.message.value ?? (drive.lastSync.value ? `Last synced ${timeFmt.format(drive.lastSync.value)}` : '');
  const left = drive.notDownloaded.value;
  return (
    <div class="drive">
      <p>Saved to Drive: Japa Counter/samples.</p>
      {line && <p class="hint" role="status">{line}</p>}
      {left > 0 && <p class="hint">{`${left === 1 ? '1 sample in Drive wasn’t' : `${left} samples in Drive weren’t`} downloaded. ${MAX_SAMPLES} is the most the counter uses.`}</p>}
      <button type="button" disabled={syncing} onClick={() => void drive.syncNow()}>Sync now</button>
    </div>
  );
}
