// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bell, chime } from '../../../src/audio/bell';
import type { EngineHandle } from '../../../src/audio/protocol';
import { StoreContext, type Store } from '../../../src/state/store';
import { Session } from '../../../src/ui/Session';
import { FakeEngine } from '../../helpers/fake-engine';
import { makeStore } from '../../helpers/store';

vi.mock('../../../src/audio/bell', () => ({ bell: vi.fn(), chime: vi.fn() }));

let store: Store;
beforeEach(async () => {
  vi.mocked(bell).mockClear();
  vi.mocked(chime).mockClear();
  store = await makeStore([81, 82, 83]);
});

async function start(target: number, bellOn = true) {
  await store.updateSettings({ target, bell: bellOn });
  const engine = new FakeEngine();
  const onExit = vi.fn();
  render(<StoreContext.Provider value={store}><Session openEngine={async () => engine} onExit={onExit} /></StoreContext.Provider>);
  await waitFor(() => expect(engine.sentTypes()).toEqual(['session-start']));
  return { engine, onExit, root: screen.getByTestId('session') };
}
const counts = (engine: FakeEngine, n: number) => act(() => { for (let i = 0; i < n; i++) engine.emit({ type: 'count', te: i }); });

describe('Session', () => {
  it('starts the engine with the samples, threshold and sample floor, showing "Stay quiet"', async () => {
    const { engine, root } = await start(108);
    const msg = engine.sent[0] as { type: 'session-start'; takes: unknown[]; thr: number; sampleFloor: number };
    expect(msg.takes).toHaveLength(3);
    expect(msg.thr).toBe(store.threshold.value);
    expect(msg.sampleFloor).toBe(store.sampleFloor.value);
    expect(root.dataset.phase).toBe('quiet');
    expect(screen.getByText('Stay quiet')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('shows the mantra, count and timer once the engine is ready', async () => {
    const { engine, root } = await start(1008);
    await act(() => engine.emit({ type: 'session-ready', floor: -60 }));
    expect(root.dataset.phase).toBe('live');
    expect(screen.getByText(store.settings.value.mantraDevanagari)).toBeTruthy();
    expect(screen.getByText(store.settings.value.mantraRoman)).toBeTruthy();
    await counts(engine, 3);
    expect(screen.getByText('3 / 1008')).toBeTruthy();
    expect(screen.getByText('0:00')).toBeTruthy();
  });

  it('rings a soft bell at 108', async () => {
    const { engine } = await start(1008);
    await act(() => engine.emit({ type: 'session-ready', floor: -60 }));
    await counts(engine, 108);
    expect(bell).toHaveBeenCalledTimes(1);
  });

  it('chimes at the target, ends by itself, saves history and shows the summary', async () => {
    const { engine, root } = await start(5);
    await act(() => engine.emit({ type: 'session-ready', floor: -60 }));
    await counts(engine, 6);
    expect(chime).toHaveBeenCalledTimes(1);
    expect(root.dataset.phase).toBe('done');
    expect(root.dataset.chimed).toBe('true');
    expect(root.dataset.count).toBe('5');
    expect(screen.getByTestId('summary').textContent).toMatch(/^5 chants {2}· {2}\d+s$/);
    expect(engine.sentTypes()).toContain('session-stop');
    await waitFor(() => expect(store.history.value[0]).toMatchObject({ count: 5, target: 5 }));
  });

  it('Escape ends the session early without a chime; then any key returns to setup', async () => {
    const { engine, root, onExit } = await start(108);
    await act(() => engine.emit({ type: 'session-ready', floor: -60 }));
    await counts(engine, 2);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(root.dataset.phase).toBe('done');
    expect(chime).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: 'a' });
    expect(onExit).toHaveBeenCalledOnce();
  });

  it('does not save history when nothing was counted', async () => {
    const { engine } = await start(108);
    await act(() => engine.emit({ type: 'session-ready', floor: -60 }));
    fireEvent.keyDown(window, { key: 'Escape' });
    await new Promise((r) => setTimeout(r, 20));
    expect(store.history.value).toHaveLength(0);
  });

  it('releases the engine synchronously on unmount while running', async () => {
    const engine = new FakeEngine();
    const view = render(
      <StoreContext.Provider value={store}><Session openEngine={async () => engine} onExit={vi.fn()} /></StoreContext.Provider>,
    );
    await waitFor(() => expect(engine.sentTypes()).toEqual(['session-start']));
    await act(() => engine.emit({ type: 'session-ready', floor: -60 }));
    view.unmount();
    expect(engine.closed).toBe(true);
    expect(engine.sentTypes()).toEqual(['session-start', 'session-stop']);
    expect(engine.listenerCount()).toBe(0);
  });

  it('closes a late-arriving engine without subscribing or sending when unmounted while opening', async () => {
    const engine = new FakeEngine();
    let resolveOpen!: (e: EngineHandle) => void;
    const opening = new Promise<EngineHandle>((r) => (resolveOpen = r));
    const view = render(
      <StoreContext.Provider value={store}><Session openEngine={() => opening} onExit={vi.fn()} /></StoreContext.Provider>,
    );
    view.unmount();
    resolveOpen(engine);
    await waitFor(() => expect(engine.closed).toBe(true));
    expect(engine.listenerCount()).toBe(0);
    expect(engine.sent).toEqual([]);
  });

  it('closes an engine that arrives after Escape ended the session, without starting it', async () => {
    const engine = new FakeEngine();
    let resolveOpen!: (e: EngineHandle) => void;
    const opening = new Promise<EngineHandle>((r) => (resolveOpen = r));
    const view = render(
      <StoreContext.Provider value={store}><Session openEngine={() => opening} onExit={vi.fn()} /></StoreContext.Provider>,
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.getByTestId('session').dataset.phase).toBe('done'));
    resolveOpen(engine);
    await waitFor(() => expect(engine.closed).toBe(true));
    expect(engine.sent).toEqual([]);
    expect(engine.listenerCount()).toBe(0);
    view.unmount();
    expect(engine.closed).toBe(true);
  });

  it('ignores a session-ready that arrives after the session ended; any key still exits once', async () => {
    const { engine, root, onExit } = await start(108);
    fireEvent.keyDown(window, { key: 'Escape' });
    await act(() => engine.emit({ type: 'session-ready', floor: -60 }));
    expect(root.dataset.phase).toBe('done');
    fireEvent.keyDown(window, { key: 'a' });
    expect(onExit).toHaveBeenCalledOnce();
  });

  it('shows a quiet message and saves nothing when the microphone cannot be opened', async () => {
    const onExit = vi.fn();
    render(
      <StoreContext.Provider value={store}>
        <Session openEngine={() => Promise.reject(new DOMException('denied', 'NotAllowedError'))} onExit={onExit} />
      </StoreContext.Provider>,
    );
    const root = screen.getByTestId('session');
    await waitFor(() => expect(root.dataset.phase).toBe('done'));
    expect(screen.getByTestId('summary').textContent).toBe('Microphone unavailable. Press any key to go back.');
    await new Promise((r) => setTimeout(r, 20));
    expect(store.history.value).toHaveLength(0);
    fireEvent.keyDown(window, { key: 'a' });
    expect(onExit).toHaveBeenCalledOnce();
  });

  it('still opens the engine when requestFullscreen returns undefined or throws', async () => {
    const original = HTMLElement.prototype.requestFullscreen;
    try {
      for (const impl of [() => undefined, () => { throw new Error('nope'); }]) {
        HTMLElement.prototype.requestFullscreen = impl as unknown as typeof original;
        const engine = new FakeEngine();
        const view = render(
          <StoreContext.Provider value={store}><Session openEngine={async () => engine} onExit={vi.fn()} /></StoreContext.Provider>,
        );
        await waitFor(() => expect(engine.sentTypes()).toEqual(['session-start']));
        view.unmount();
      }
    } finally {
      HTMLElement.prototype.requestFullscreen = original;
    }
  });

  it('ignores key repeat when dismissing the summary', async () => {
    const { engine, onExit } = await start(108);
    await act(() => engine.emit({ type: 'session-ready', floor: -60 }));
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.keyDown(window, { key: 'Escape', repeat: true });
    expect(onExit).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onExit).toHaveBeenCalledOnce();
  });
});
