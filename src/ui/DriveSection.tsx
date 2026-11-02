import { useDrive } from '../state/drive-controller';

const timeFmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });

export function DriveSection() {
  const drive = useDrive();
  if (!drive || drive.status.value === 'off') {
    return <p class="hint">Drive backup is off. Set VITE_GOOGLE_CLIENT_ID to turn it on.</p>;
  }
  if (drive.status.value === 'disconnected') {
    return (
      <div class="drive">
        <button type="button" onClick={() => void drive.connect()}>Connect Google Drive</button>
        <p class="hint">Samples are saved as WAV files in Japa Counter/samples in your Drive.</p>
      </div>
    );
  }
  const line =
    drive.status.value === 'syncing'
      ? 'Syncing…'
      : drive.message.value ?? (drive.lastSync.value ? `Last synced ${timeFmt.format(drive.lastSync.value)}` : '');
  return (
    <div class="drive">
      <p>Saved to Drive: Japa Counter/samples.</p>
      {line && <p class="hint" role="status">{line}</p>}
      <button type="button" disabled={drive.status.value === 'syncing'} onClick={() => void drive.syncNow()}>Sync now</button>
    </div>
  );
}
