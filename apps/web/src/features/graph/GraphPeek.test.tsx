/**
 * Peek dossier actions and PathStory states.
 */
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { GraphPalette } from '../../lib/graph-palette.js';
import { renderWithApp } from '../../test/render.js';
import { GraphPeek, PathStory } from './GraphPeek.js';
import type { FgNode } from './types.js';

const palette: GraphPalette = {
  bg: '#000',
  border: '#111',
  borderStrong: '#222',
  muted: '#888',
  faint: '#666',
  fg: '#fff',
  accent: '#eee',
  accentSoft: '#ccc',
  plate: '#000',
  dim: '#333',
  fontSans: 'sans-serif',
  slots: Array(8).fill('#0f0') as string[],
};

const selected = {
  id: 'p1',
  title: 'Alice',
  type: 'person',
  degree: 2,
  hop: 0,
  isSelf: false,
} as FgNode;

describe('GraphPeek', () => {
  it('exposes dialog actions that notify the parent', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onOpen = vi.fn();
    const onMakeFocus = vi.fn();
    renderWithApp(
      <GraphPeek
        selected={selected}
        links={[]}
        palette={palette}
        onClose={onClose}
        onSelectNeighbor={() => {}}
        onOpen={onOpen}
        onMakeFocus={onMakeFocus}
        onFindPath={() => {}}
        onCopyLink={() => {}}
        recordHref="/people/p1"
      />,
    );
    expect(screen.getByRole('dialog', { name: 'Alice details' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close peek' }));
    expect(onClose).toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Open record' }));
    expect(onOpen).toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Make focus' }));
    expect(onMakeFocus).toHaveBeenCalled();
  });
});

describe('PathStory', () => {
  it('shows loading text while a path is fetched', () => {
    renderWithApp(<PathStory path={undefined} loading emptyHint="Pick endpoints" />);
    expect(screen.getByText('Finding path…')).toBeInTheDocument();
  });

  it('surfaces a failed lookup as an alert', () => {
    renderWithApp(<PathStory path={undefined} loading={false} emptyHint="Pick endpoints" failed />);
    expect(screen.getByRole('alert')).toHaveTextContent(/Couldn.t work out a path/);
  });

  it('announces found hops as status', () => {
    renderWithApp(
      <PathStory
        loading={false}
        emptyHint="Pick endpoints"
        path={{
          from: 'a',
          to: 'b',
          found: true,
          hops: [
            { nodeId: 'a', title: 'Ada', type: 'person' },
            { nodeId: 'b', title: 'Grace', type: 'person', viaEdgeType: 'KNOWS' },
          ],
          edges: [],
        }}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent(/Ada/);
    expect(screen.getByRole('status')).toHaveTextContent(/Grace/);
  });
});
