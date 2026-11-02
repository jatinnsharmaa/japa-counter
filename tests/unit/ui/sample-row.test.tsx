// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/preact';
import { describe, expect, it, vi } from 'vitest';
import { SampleRow } from '../../../src/ui/SampleRow';
import { makeSampleRecord } from '../../helpers/samples';

const sample = makeSampleRecord(71);

describe('SampleRow', () => {
  it('shows name, trimmed duration and a download link for the WAV', () => {
    render(<ul><SampleRow sample={sample} index={2} flagged={false} onDelete={() => {}} /></ul>);
    expect(screen.getByText('Sample 3')).toBeTruthy();
    expect(screen.getByText(`${sample.durationSec.toFixed(1)} s`)).toBeTruthy();
    const link = screen.getByRole('link', { name: 'Download' });
    expect(link.getAttribute('download')).toBe('japa-sample-3.wav');
  });

  it('play toggles to pause', async () => {
    render(<ul><SampleRow sample={sample} index={0} flagged={false} onDelete={() => {}} /></ul>);
    fireEvent.click(screen.getByRole('button', { name: 'Play sample 1' }));
    expect(await screen.findByRole('button', { name: 'Pause sample 1' })).toBeTruthy();
  });

  it('asks before deleting', () => {
    const onDelete = vi.fn();
    render(<ul><SampleRow sample={sample} index={0} flagged={false} onDelete={onDelete} /></ul>);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onDelete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Yes, delete' }));
    expect(onDelete).toHaveBeenCalledOnce();
  });

  it('flags a sample the current engine could not rebuild', () => {
    render(<ul><SampleRow sample={{ ...sample, engineVersion: 0 }} index={0} flagged={false} onDelete={() => {}} /></ul>);
    expect(screen.getByText('Couldn’t update this sample. Record it again.')).toBeTruthy();
  });

  it('shows the synced tick and the "sounds different" note', () => {
    render(<ul><SampleRow sample={{ ...sample, synced: true }} index={0} flagged={true} onDelete={() => {}} /></ul>);
    expect(screen.getByText('✓ synced')).toBeTruthy();
    expect(screen.getByText('Sounds different from the others. Consider recording it again.')).toBeTruthy();
  });
});
