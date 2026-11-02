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

/** Only rendered for usable samples: building the clip decodes the WAV, which a corrupt one cannot survive. */
function ClipButton({ sample, n }: { sample: SampleRecord; n: number }) {
  const clip = useClipPlayer(useMemo(() => trimmedWav(sample), [sample]));
  return (
    <button type="button" class="icon" aria-label={clip.playing ? `Pause sample ${n}` : `Play sample ${n}`} onClick={clip.toggle}>
      {clip.playing ? '❚❚' : '▶'}
    </button>
  );
}

export function SampleRow({ sample, index, flagged, onDelete }: Props) {
  const n = index + 1;
  const usable = isUsable(sample);
  const downloadUrl = useMemo(() => URL.createObjectURL(new Blob([sample.wav], { type: 'audio/wav' })), [sample]);
  useEffect(() => () => URL.revokeObjectURL(downloadUrl), [downloadUrl]);
  const [confirming, setConfirming] = useState(false);

  return (
    <li class="sample-row" data-testid="sample-row">
      <span class="sample-name">Sample {n}</span>
      <span class="sample-dur">{sample.durationSec.toFixed(1)} s</span>
      {usable && <ClipButton sample={sample} n={n} />}
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
      {!usable && <p class="hint flag">Couldn’t update this sample. Record it again.</p>}
    </li>
  );
}
