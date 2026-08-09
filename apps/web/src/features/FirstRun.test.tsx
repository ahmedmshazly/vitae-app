/**
 * First-run welcome modal: keyboard moves and Start exploring.
 */
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithApp } from '../test/render.js';
import { FirstRun } from './FirstRun.js';

describe('FirstRun', () => {
  it('lists the three keyboard moves and calls onDone from Start exploring', async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    renderWithApp(<FirstRun onDone={onDone} />);

    expect(screen.getByRole('heading', { name: 'Welcome to Vitae' })).toBeInTheDocument();
    expect(screen.getByText('Capture anything')).toBeInTheDocument();
    expect(screen.getByText('Create any record')).toBeInTheDocument();
    expect(screen.getByText('Jump anywhere')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Start exploring' }));
    expect(onDone).toHaveBeenCalledOnce();
  });
});
