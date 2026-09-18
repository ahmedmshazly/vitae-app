import '../../test/api-mock.js';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runAxe } from '../../test/a11y.js';
import { renderWithApp } from '../../test/render.js';
import { NetworkHome } from './WorkspaceHomes.js';
import { mockApi, resetMockApi } from '../../test/api-mock.js';

const write = vi.hoisted(() => ({ allowed: true }));
vi.mock('../../lib/auth.js', () => ({
  useCanWrite: () => write.allowed,
  WRITE_LOCK_HINT: 'Read-only workspace.',
}));
beforeEach(() => {
  write.allowed = true;
  resetMockApi();
  mockApi.get.mockResolvedValue({ user: null, nodes: [], suggestions: [] });
  mockApi.post.mockResolvedValue({ fingerprint: 'check', candidates: [] });
});

describe('Workspace home semantics', () => {
  it('keeps every indexed destination a native link inside a semantic list', async () => {
    const { container } = renderWithApp(<NetworkHome />, { route: '/network' });
    const destinations = screen.getByRole('list', { name: 'Network discovery' });
    const directory = screen.getByRole('list', { name: 'Network directory' });

    expect(within(destinations).getAllByRole('listitem')).toHaveLength(4);
    expect(within(destinations).getByRole('link', { name: /Correspondence/ })).toHaveAttribute(
      'href',
      '/network/correspondence',
    );
    expect(within(directory).getByRole('link', { name: /^People/ })).toHaveAttribute(
      'href',
      '/network/people',
    );
    expect(within(directory).getByRole('link', { name: /^Organizations/ })).toHaveAttribute(
      'href',
      '/network/organizations',
    );
    expect(within(destinations).getByRole('link', { name: /Find a warm path/ })).toHaveAttribute(
      'href',
      '/network/intelligence?lens=reach',
    );

    expect(await runAxe(container)).toHaveNoViolations();
  });

  it('keeps the new person draft after cancelled dismissal', async () => {
    renderWithApp(<NetworkHome />);
    await userEvent.click(screen.getByRole('button', { name: 'Add person' }));
    await userEvent.type(screen.getByLabelText(/Full name/), 'Research partner');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await screen.findByRole('dialog', { name: 'Discard changes?' });
    await userEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.getByLabelText(/Full name/)).toHaveValue('Research partner');
  });

  it('keeps directory navigation available in a read-only workspace', () => {
    write.allowed = false;
    renderWithApp(<NetworkHome />);
    expect(screen.getByRole('button', { name: 'Add person' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Read-only workspace');
    expect(screen.getByRole('link', { name: /^People/ })).toHaveAttribute(
      'href',
      '/network/people',
    );
  });
});
