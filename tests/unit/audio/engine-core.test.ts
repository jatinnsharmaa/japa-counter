import { beforeAll, describe, expect, it } from 'vitest';
import { EngineCore } from '../../../src/audio/engine-core';
import type { FromEngine } from '../../../src/audio/protocol';
import { calibrate } from '../../../src/engine/calibrate';
import { FRAME, HOP, SR } from '../../../src/engine/constants';
import { processTake } from '../../../src/engine/takes';
import type { Take } from '../../../src/engine/types';
import { append, floorOf, framesOf, MANTRA, Synth } from '../../helpers/synth';

function harness() {
  const out: FromEngine[] = [];
  const core = new EngineCore((m) => out.push(m));
  return { core, out, of: (t: FromEngine['type']) => out.filter((m) => m.type === t) };
}
function feedChunks(core: EngineCore, pcm: Float32Array, size = 1024) {
  for (let i = 0; i < pcm.length; i += size) core.audio(pcm.slice(i, i + size));
}

let takes: Take[];
let floor: number;
let thr: number;
let session: Float32Array;

beforeAll(() => {
  const s = new Synth(7);
  floor = floorOf(framesOf(s.addNoise(s.silence(1))));
  takes = [];
  for (let i = 0; i < 4; i++) takes.push(processTake(framesOf(s.addNoise(append(append(s.silence(0.6), s.chant(MANTRA, s.vary())), s.silence(0.8)))), floor)!);
  thr = calibrate(takes)!.base;
  session = Float32Array.from(s.addNoise(append(append(append(s.silence(2), s.chant(MANTRA, s.vary())), s.chant(MANTRA, s.vary())), s.silence(1))));
});

describe('EngineCore', () => {
  it('ignores audio until a mode is started', () => {
    const { core, out } = harness();
    core.handle({ type: 'init', inRate: SR });
    core.audio(new Float32Array(4096));
    expect(out).toEqual([]);
  });

  it('recording posts one frame level per hop and returns the 16 kHz PCM on stop', () => {
    const { core, of } = harness();
    core.handle({ type: 'init', inRate: SR });
    core.handle({ type: 'rec-start' });
    feedChunks(core, new Float32Array(SR).fill(0.01));
    core.handle({ type: 'rec-stop' });
    expect(of('frame')).toHaveLength(Math.floor((SR - FRAME) / HOP) + 1);
    const pcm = (of('rec-pcm')[0] as { pcm: Float32Array }).pcm;
    expect(pcm.length).toBe(SR);
  });

  it('resamples 48 kHz input to 16 kHz for recordings', () => {
    const { core, of } = harness();
    core.handle({ type: 'init', inRate: 48000 });
    core.handle({ type: 'rec-start' });
    feedChunks(core, new Float32Array(48000));
    core.handle({ type: 'rec-stop' });
    expect(Math.abs((of('rec-pcm')[0] as { pcm: Float32Array }).pcm.length - SR)).toBeLessThanOrEqual(1);
  });

  it('a new recording starts empty', () => {
    const { core, of } = harness();
    core.handle({ type: 'init', inRate: SR });
    core.handle({ type: 'rec-start' });
    feedChunks(core, new Float32Array(SR));
    core.handle({ type: 'rec-stop' });
    core.handle({ type: 'rec-start' });
    feedChunks(core, new Float32Array(SR / 2));
    core.handle({ type: 'rec-stop' });
    expect((of('rec-pcm')[1] as { pcm: Float32Array }).pcm.length).toBe(SR / 2);
  });

  it('session: measures 1.5 s of quiet, then counts chants', () => {
    const { core, of } = harness();
    core.handle({ type: 'init', inRate: SR });
    core.handle({ type: 'session-start', takes, thr, sampleFloor: floor });
    feedChunks(core, session);
    expect(of('session-ready')).toHaveLength(1);
    expect(of('count')).toHaveLength(2);
  });

  it('session-stop silences the engine', () => {
    const { core, out } = harness();
    core.handle({ type: 'init', inRate: SR });
    core.handle({ type: 'session-start', takes, thr, sampleFloor: floor });
    core.handle({ type: 'session-stop' });
    feedChunks(core, session);
    expect(out).toEqual([]);
  });
});
