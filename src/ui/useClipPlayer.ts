import { useEffect, useMemo, useState } from 'preact/hooks';

/** Plays a WAV buffer through an <audio> element; one player per clip. */
export function useClipPlayer(wav: ArrayBuffer): { playing: boolean; toggle(): void } {
  const audio = useMemo(() => {
    const el = new Audio(URL.createObjectURL(new Blob([wav], { type: 'audio/wav' })));
    el.preload = 'none';
    return el;
  }, [wav]);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    const on = () => setPlaying(true);
    const off = () => setPlaying(false);
    audio.addEventListener('play', on);
    audio.addEventListener('pause', off);
    audio.addEventListener('ended', off);
    return () => {
      audio.pause();
      audio.removeEventListener('play', on);
      audio.removeEventListener('pause', off);
      audio.removeEventListener('ended', off);
      URL.revokeObjectURL(audio.src);
    };
  }, [audio]);
  return {
    playing,
    toggle: () => {
      if (audio.paused) {
        audio.currentTime = 0;
        void audio.play();
      } else audio.pause();
    },
  };
}
