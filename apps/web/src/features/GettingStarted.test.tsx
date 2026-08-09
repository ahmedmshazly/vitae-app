/**
 * Getting-started checklist: progress, incomplete links, dismiss.
 */
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithApp } from '../test/render.js';
import { GettingStarted, type SetupState } from './GettingStarted.js';

const partial: SetupState = {
  self: true,
  people: false,
  interactions: false,
  github: false,
  atoms: false,
  resume: false,
  done: 1,
  total: 6,
};

describe('GettingStarted', () => {
  it('shows progress and links for incomplete steps', () => {
    renderWithApp(<GettingStarted setup={partial} onDismiss={vi.fn()} />);
    expect(screen.getByText('1/6')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Setup progress' })).toHaveAttribute(
      'aria-valuenow',
      '17',
    );
    expect(screen.getByRole('link', { name: /Add someone you know/ })).toHaveAttribute(
      'href',
      '/people',
    );
    expect(screen.getByRole('link', { name: /Set up your profile/ })).toBeInTheDocument();
  });

  it('calls onDismiss when Dismiss is clicked', async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    renderWithApp(<GettingStarted setup={partial} onDismiss={onDismiss} />);
    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
