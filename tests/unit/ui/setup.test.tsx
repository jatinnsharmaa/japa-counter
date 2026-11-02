// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
import { fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { describe, expect, it } from 'vitest';
import { StoreContext, type Store } from '../../../src/state/store';
import { getSettings } from '../../../src/storage/db';
import { Setup } from '../../../src/ui/Setup';
import { makeStore } from '../../helpers/store';

const renderSetup = (store: Store) => render(<StoreContext.Provider value={store}><Setup /></StoreContext.Provider>);

describe('Setup', () => {
  it('shows the default mantra and target 108', async () => {
    renderSetup(await makeStore());
    expect(screen.getByLabelText('Mantra (Devanagari)')).toHaveProperty('value', 'ॐ नमः शिवाय');
    expect(screen.getByLabelText('Mantra (roman)')).toHaveProperty('value', 'om namah shivaya');
    expect(screen.getByLabelText('Target')).toHaveProperty('value', '108');
  });

  it('disables Start until 3 samples exist', async () => {
    renderSetup(await makeStore([41, 42]));
    expect(screen.getByRole('button', { name: 'Start' })).toHaveProperty('disabled', true);
    expect(screen.getByText('Record at least 3 samples to start. 6 to 8 work best.')).toBeTruthy();
  });

  it('enables Start with 3 samples and a valid target; Start switches to the session screen', async () => {
    const store = await makeStore([41, 42, 43]);
    renderSetup(store);
    const start = screen.getByRole('button', { name: 'Start' });
    expect(start).toHaveProperty('disabled', false);
    fireEvent.click(start);
    expect(store.screen.value).toBe('session');
  });

  it('presets set and persist the target', async () => {
    const store = await makeStore();
    renderSetup(store);
    fireEvent.click(screen.getByRole('button', { name: '1008' }));
    await waitFor(async () => expect((await getSettings(store.db)).target).toBe(1008));
    expect(screen.getByLabelText('Target')).toHaveProperty('value', '1008');
  });

  it('rejects targets outside 1 to 100,000', async () => {
    const store = await makeStore([41, 42, 43]);
    renderSetup(store);
    fireEvent.input(screen.getByLabelText('Target'), { target: { value: '100001' } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Start' })).toHaveProperty('disabled', true));
    fireEvent.input(screen.getByLabelText('Target'), { target: { value: '27' } });
    await waitFor(() => expect(store.settings.value.target).toBe(27));
  });

  it('persists mantra edits', async () => {
    const store = await makeStore();
    renderSetup(store);
    fireEvent.change(screen.getByLabelText('Mantra (roman)'), { target: { value: 'om namah shivaya' } });
    await waitFor(async () => expect((await getSettings(store.db)).mantraRoman).toBe('om namah shivaya'));
  });

  it('Settings link reveals strictness, bell and history; changing strictness persists', async () => {
    const store = await makeStore();
    renderSetup(store);
    expect(screen.queryByRole('radio', { name: 'Strictest' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(screen.getAllByRole('radio')).toHaveLength(6);
    expect(screen.getByRole('radio', { name: 'Strict (default)' })).toHaveProperty('checked', true);
    expect(screen.getByRole('checkbox', { name: 'Soft bell every 108' })).toHaveProperty('checked', true);
    expect(screen.getByText('No sessions yet.')).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: 'Relaxed' }));
    await waitFor(async () => expect((await getSettings(store.db)).strictness).toBe(1.05));
  });
});
