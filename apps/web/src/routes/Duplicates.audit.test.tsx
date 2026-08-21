import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithApp } from '../test/render.js';
import { Duplicates, type DupCluster, type MemberSummary } from './Duplicates.js';

const get = vi.fn();
const post = vi.fn();
const patch = vi.fn();
const del = vi.fn();

vi.mock('../lib/api.js', () => ({
  api: {
    get: (...args: unknown[]) => get(...args),
    post: (...args: unknown[]) => post(...args),
    patch: (...args: unknown[]) => patch(...args),
    del: (...args: unknown[]) => del(...args),
  },
}));

function member(id: string, title: string): MemberSummary {
  return { id, type: 'person', title, meta: `${title.toLowerCase()}@example.com`, rev: 1 };
}

function node(id: string, title: string) {
  return {
    node: {
      id,
      type: 'person' as const,
      title,
      notes_md: '',
      source: 'manual',
      confidence: 0.9,
      rev: 1,
      created_at: '2026-08-20T00:00:00.000Z',
      updated_at: '2026-08-20T00:00:00.000Z',
      props: {},
    },
    edges: [],
    neighbors: {},
  };
}

function duplicateCluster(members: MemberSummary[]): DupCluster {
  return {
    id: 'cluster-1',
    type: 'person',
    verdict: 'probable',
    score: 94,
    members,
    pairs: [],
  };
}

function arrange(cluster: DupCluster) {
  const records = new Map(cluster.members.map((item) => [item.id, node(item.id, item.title)]));
  get.mockImplementation((path: string) => {
    if (path === '/duplicates') return Promise.resolve({ pairs: [], clusters: [cluster] });
    if (path === '/duplicates/merges') return Promise.resolve({ merges: [] });
    if (path === '/duplicates/aliases') return Promise.resolve({ aliases: [] });
    if (path.startsWith('/nodes/'))
      return Promise.resolve(records.get(path.slice('/nodes/'.length)));
    return Promise.reject(new Error(`Unexpected GET ${path}`));
  });

  return renderWithApp(<Duplicates />, { route: '/data/duplicates' });
}

beforeEach(() => {
  get.mockReset();
  post.mockReset();
  patch.mockReset();
  del.mockReset();
  post.mockResolvedValue({});
  patch.mockResolvedValue({});
  del.mockResolvedValue({});
});

describe('duplicate audit survivor invariant', () => {
  it('selects the first remaining member as survivor and completes a sparse-field merge', async () => {
    const user = userEvent.setup();
    arrange(
      duplicateCluster([
        member('alpha', 'Alpha Person'),
        member('beta', 'Beta Person'),
        member('gamma', 'Gamma Person'),
      ]),
    );

    await user.click(
      await screen.findByRole('button', {
        name: 'Audit cluster: Alpha Person · Beta Person +1',
      }),
    );
    await user.click(
      await screen.findByRole('checkbox', { name: 'Include Alpha Person in this merge' }),
    );

    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(
      await screen.findByRole('button', { name: 'Keep Beta Person as survivor' }),
    ).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('heading', { name: 'Audit every field' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(await screen.findByRole('button', { name: 'Merge 2 records' }));

    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith(
        '/nodes/beta',
        expect.objectContaining({ title: 'Beta Person', props: {} }),
      ),
    );
    expect(post).toHaveBeenCalledWith('/duplicates/merge', {
      keepId: 'beta',
      dropId: 'gamma',
      fields: {},
    });
  });

  it('blocks forward progress when fewer than two selected records remain', async () => {
    const user = userEvent.setup();
    arrange(
      duplicateCluster([
        member('alpha', 'Alpha Person'),
        member('beta', 'Beta Person'),
        member('gamma', 'Gamma Person'),
      ]),
    );

    await user.click(
      await screen.findByRole('button', {
        name: 'Audit cluster: Alpha Person · Beta Person +1',
      }),
    );
    await user.click(
      await screen.findByRole('checkbox', { name: 'Include Alpha Person in this merge' }),
    );
    await user.click(screen.getByRole('checkbox', { name: 'Include Beta Person in this merge' }));

    const continueButton = screen.getByRole('button', { name: 'Continue' });
    expect(continueButton).toBeDisabled();
    expect(
      screen.getByRole('checkbox', { name: 'Include Gamma Person in this merge' }),
    ).toBeChecked();
    expect(patch).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
  });
});
