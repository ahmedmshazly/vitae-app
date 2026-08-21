/**
 * First-run welcome modal: keyboard moves and entry to Today.
 */
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithApp } from '../test/render.js';
import { FirstRun } from './FirstRun.js';

describe('FirstRun', () => {
  it('lists the three keyboard moves and calls onDone from Open Today', async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    renderWithApp(<FirstRun onDone={onDone} />);

    expect(screen.getByRole('heading', { name: 'Welcome to Vitae' })).toBeInTheDocument();
    expect(screen.getByText('Start with the next fact')).toBeInTheDocument();
    expect(screen.getByText('Create any record')).toBeInTheDocument();
    expect(screen.getByText('Find or act')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Open Today' }));
    expect(onDone).toHaveBeenCalledOnce();
  });
});
