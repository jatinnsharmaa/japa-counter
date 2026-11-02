// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { describe, expect, it, vi } from 'vitest';
import { COUNTDOWN_FRAMES } from '../../../src/recording/autostop';
import { StoreContext, type Store } from '../../../src/state/store';
import { Recorder } from '../../../src/ui/Recorder';
import { FakeEngine } from '../../helpers/fake-engine';
import { makeSamplePcm } from '../../helpers/samples';
import { makeStore } from '../../helpers/store';

function setup(store: Store, engine = new FakeEngine()) {
  const openEngine = vi.fn(async () => engine);
  render(<StoreContext.Provider value={store}><Recorder openEngine={openEngine} /></StoreContext.Provider>);
  return { engine, openEngine };
}
const frames = (engine: FakeEngine, db: number, n: number) => act(() => { for (let i = 0; i < n; i++) engine.emit({ type: 'frame', db }); });
/** 3 s of countdown audio followed by a real chant-phase recording. */
function recordingPcm(seed = 51) {
  const { pcm } = makeSamplePcm(seed);
  const out = new Float32Array(COUNTDOWN_FRAMES * 320 + pcm.length);
  out.set(pcm, COUNTDOWN_FRAMES * 320);
  return out;
}
async function runTake(engine: FakeEngine, pcm = recordingPcm()) {
  await frames(engine, -60, COUNTDOWN_FRAMES);
  await frames(engine, -20, 100);
  await frames(engine, -60, 40);
  expect(engine.sentTypes()).toContain('rec-stop');
  await act(() => engine.emit({ type: 'rec-pcm', pcm }));
}

describe('Recorder', () => {
  it('explains before asking for the mic on the first visit, then counts down', async () => {
    const store = await makeStore();
    const { engine, openEngine } = setup(store);
    expect(screen.getByText('You’ll chant the mantra once. Recording stops when you go quiet.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Record a sample' }));
    expect(screen.getByText('Your browser will ask to use the microphone')).toBeTruthy();
    expect(openEngine).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(engine.sentTypes()).toEqual(['rec-start']));
    expect(screen.getByText('Stay quiet…')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
    expect(store.micExplained.value).toBe(true);
  });

  it('switches to "Chant once now." after the countdown, auto-stops and shows the review', async () => {
    const store = await makeStore();
    await store.markMicExplained();
    const { engine } = setup(store);
    fireEvent.click(screen.getByRole('button', { name: 'Record a sample' }));
    await waitFor(() => expect(engine.sentTypes()).toEqual(['rec-start']));
    await frames(engine, -60, COUNTDOWN_FRAMES);
    expect(screen.getByText('Chant once now.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Stop' })).toBeTruthy();
    await frames(engine, -20, 100);
    await frames(engine, -60, 40);
    await act(() => engine.emit({ type: 'rec-pcm', pcm: recordingPcm() }));
    expect(screen.getByRole('button', { name: 'Keep' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Redo' })).toBeTruthy();
    expect(screen.getByLabelText('Waveform')).toBeTruthy();
    expect(store.samples.value).toHaveLength(0); // nothing saved before Keep
  });

  it('Keep saves the sample; the next take reuses the open mic without re-explaining', async () => {
    const store = await makeStore();
    await store.markMicExplained();
    const { engine, openEngine } = setup(store);
    fireEvent.click(screen.getByRole('button', { name: 'Record a sample' }));
    await waitFor(() => expect(engine.sentTypes()).toEqual(['rec-start']));
    await runTake(engine);
    fireEvent.click(screen.getByRole('button', { name: 'Keep' }));
    await waitFor(() => expect(store.samples.value).toHaveLength(1));
    expect(screen.getByText('Sample 1 saved.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Record a sample' }));
    await waitFor(() => expect(engine.sentTypes().filter((t) => t === 'rec-start')).toHaveLength(2));
    expect(openEngine).toHaveBeenCalledTimes(1);
  });

  it('Redo goes straight back to the countdown', async () => {
    const store = await makeStore();
    await store.markMicExplained();
    const { engine } = setup(store);
    fireEvent.click(screen.getByRole('button', { name: 'Record a sample' }));
    await waitFor(() => expect(engine.sentTypes()).toEqual(['rec-start']));
    await runTake(engine);
    fireEvent.click(screen.getByRole('button', { name: 'Redo' }));
    await waitFor(() => expect(screen.getByText('Stay quiet…')).toBeTruthy());
    expect(engine.sentTypes().filter((t) => t === 'rec-start')).toHaveLength(2);
  });

  it('Stop ends the take early', async () => {
    const store = await makeStore();
    await store.markMicExplained();
    const { engine } = setup(store);
    fireEvent.click(screen.getByRole('button', { name: 'Record a sample' }));
    await waitFor(() => expect(engine.sentTypes()).toEqual(['rec-start']));
    await frames(engine, -60, COUNTDOWN_FRAMES);
    await frames(engine, -20, 10);
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(engine.sentTypes()).toEqual(['rec-start', 'rec-stop']);
  });

  it('explains when no full chant was caught', async () => {
    const store = await makeStore();
    await store.markMicExplained();
    const { engine } = setup(store);
    fireEvent.click(screen.getByRole('button', { name: 'Record a sample' }));
    await waitFor(() => expect(engine.sentTypes()).toEqual(['rec-start']));
    await runTake(engine, new Float32Array(COUNTDOWN_FRAMES * 320 + 32000));
    expect(screen.getByText('Didn’t catch a full chant. Try again, a little closer to the mic.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Redo' })).toBeTruthy();
  });

  it('shows a clear message when the mic is blocked', async () => {
    const store = await makeStore();
    await store.markMicExplained();
    render(
      <StoreContext.Provider value={store}>
        <Recorder openEngine={async () => { throw new DOMException('denied', 'NotAllowedError'); }} />
      </StoreContext.Provider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Record a sample' }));
    await waitFor(() => expect(screen.getByText('Microphone blocked. Allow it from the address bar, then try again.')).toBeTruthy());
  });

  it('closes the mic when the setup screen goes away', async () => {
    const store = await makeStore();
    await store.markMicExplained();
    const engine = new FakeEngine();
    const view = render(<StoreContext.Provider value={store}><Recorder openEngine={async () => engine} /></StoreContext.Provider>);
    fireEvent.click(screen.getByRole('button', { name: 'Record a sample' }));
    await waitFor(() => expect(engine.sentTypes()).toEqual(['rec-start']));
    view.unmount();
    expect(engine.closed).toBe(true);
  });

  it('caps samples at 10', async () => {
    const store = await makeStore([61, 62, 63, 64, 65, 66, 67, 68, 69, 70]);
    setup(store);
    expect(screen.getByRole('button', { name: 'Record a sample' })).toHaveProperty('disabled', true);
    expect(screen.getByText('10 samples is the most the counter uses. Delete one to record another.')).toBeTruthy();
  });
});
