export type BellContext = Pick<BaseAudioContext, 'currentTime' | 'createOscillator' | 'createGain' | 'destination'>;

/** Soft bell: three sine partials with exponential decay. */
export function bell(ctx: BellContext, when = 0, freq = 528, vol = 0.12): void {
  const t = ctx.currentTime + when;
  for (const [mult, amp] of [[1, 1], [2.76, 0.35], [5.4, 0.12]] as const) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = freq * mult;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol * amp, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.6);
    o.connect(g);
    g.connect(ctx.destination);
    o.start(t);
    o.stop(t + 2.7);
  }
}

/** Three-bell chime at target. */
export function chime(ctx: BellContext): void {
  bell(ctx, 0, 528, 0.16);
  bell(ctx, 0.9, 660, 0.14);
  bell(ctx, 1.8, 792, 0.12);
}
