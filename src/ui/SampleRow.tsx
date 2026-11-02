import { useEffect, useMemo, useState } from 'preact/hooks';
import type { SampleRecord } from '../storage/db';
import { isUsable, trimmedWav } from '../storage/samples';
import { useClipPlayer } from './useClipPlayer';

interface Props {
  sample: SampleRecord;
  index: number;
  flagged: boolean;
  onDelete: () => void;
}

export function SampleRow({ sample, index, flagged, onDelete }: Props) {
  const n = index + 1;
  const clip = useClipPlayer(useMemo(() => trimmedWav(sample), [sample]));
  const downloadUrl = useMemo(() => URL.createObjectURL(new Blob([sample.wav], { type: 'audio/wav' })), [sample]);
  useEffect(() => () => URL.revokeObjectURL(downloadUrl), [downloadUrl]);
  const [confirming, setConfirming] = useState(false);

  return (
    <li class="sample-row" data-testid="sample-row">
      <span class="sample-name">Sample {n}</span>
      <span class="sample-dur">{sample.durationSec.toFixed(1)} s</span>
      <button type="button" class="icon" aria-label={clip.playing ? `Pause sample ${n}` : `Play sample ${n}`} onClick={clip.toggle}>
        {clip.playing ? '❚❚' : '▶'}
      </button>
      <a href={downloadUrl} download={`japa-sample-${n}.wav`}>Download</a>
      {confirming ? (
        <span class="confirm">
          <button type="button" onClick={onDelete}>Yes, delete</button>
          <button type="button" onClick={() => setConfirming(false)}>Cancel</button>
        </span>
      ) : (
        <button type="button" class="link" onClick={() => setConfirming(true)}>Delete</button>
      )}
      {sample.synced && <span class="synced">✓ synced</span>}
      {flagged && <p class="hint flag">Sounds different from the others. Consider recording it again.</p>}
      {!isUsable(sample) && <p class="hint flag">Couldn’t update this sample. Record it again.</p>}
    </li>
  );
}
