/**
 * The selection dossier and the path story under the map.
 *
 * PathStory used to hand-roll four dialects: a loading div with no role, an
 * error panel with no retry, a roleless "no path" line and a status that came
 * into existence in the same commit as its text, which screen readers miss.
 * The dossier said role="dialog" while nothing ever focused it, listed its
 * connections as divs, and encoded each neighbour's type as a coloured dot.
 */
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { GraphPalette } from '../../lib/graph-palette.js';
import { renderWithApp } from '../../test/render.js';
import { GraphPeek, PathStory, type PeekLink } from './GraphPeek.js';
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
  fontMono: 'mono',
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

const links: PeekLink[] = [
  {
    neighbor: { id: 'x1', title: 'Analytical Engine', type: 'project' } as FgNode,
    edgeType: 'WORKED_ON',
    direction: 'out',
  },
];

function renderPeek(over: Partial<Parameters<typeof GraphPeek>[0]> = {}) {
  return renderWithApp(
    <GraphPeek
      selected={selected}
      links={[]}
      palette={palette}
      onClose={() => {}}
      onSelectNeighbor={() => {}}
      onOpen={() => {}}
      onMakeFocus={() => {}}
      onFindPath={() => {}}
      onCopyLink={() => {}}
      recordHref="/people/p1"
      {...over}
    />,
  );
}

describe('GraphPeek dossier', () => {
  it('is an inspector, not a dialog it never focuses', () => {
    renderPeek();
    expect(screen.getByRole('region', { name: 'Alice details' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('explains the hole where the connection ledger would be', () => {
    renderPeek();
    expect(screen.getByText('No connections in view')).toBeInTheDocument();
    expect(screen.getByText(/Widen the record filters above/)).toBeInTheDocument();
  });

  it('lists connections as a named group of rows', () => {
    renderPeek({ links });
    const group = screen.getByRole('group', { name: /worked on/i });
    const list = within(group).getByRole('list');
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
    expect(within(list).getByRole('link', { name: 'Open Analytical Engine' })).toBeInTheDocument();
  });

  it('names the neighbour type instead of tinting a dot', () => {
    renderPeek({ links });
    const row = screen.getByRole('button', { name: /Analytical Engine/ });
    expect(within(row).getByTitle('project')).toBeInTheDocument();
  });

  it('shows the record path as evidence rather than a second link to it', () => {
    renderPeek();
    expect(screen.getByText('/people/p1')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '/people/p1' })).not.toBeInTheDocument();
  });

  it('closes from a control that carries a name, not a glyph alone', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderPeek({ onClose });
    await user.click(screen.getByRole('button', { name: 'Close peek' }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe('PathStory', () => {
  const found = {
    from: 'a',
    to: 'b',
    found: true,
    hops: [
      { nodeId: 'a', title: 'Ada', type: 'person' },
      { nodeId: 'b', title: 'Grace', type: 'person', viaEdgeType: 'KNOWS' },
    ],
    edges: [],
  };

  it('keeps one live region across the whole lookup', () => {
    const { rerender } = renderWithApp(
      <PathStory path={undefined} loading emptyHint="Pick endpoints" />,
    );
    const region = screen.getByRole('status');
    expect(region).toHaveTextContent('Finding path');

    rerender(<PathStory path={found} loading={false} emptyHint="Pick endpoints" />);
    expect(screen.getByRole('status')).toBe(region);
    expect(region).toHaveTextContent('Ada');
    expect(region).toHaveTextContent('Grace');
  });

  it('offers a retry when the lookup itself fails', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    renderWithApp(
      <PathStory
        path={undefined}
        loading={false}
        emptyHint="Pick endpoints"
        failed
        onRetry={onRetry}
      />,
    );
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/Couldn.t work out a path/);
    await user.click(within(alert).getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalled();
  });

  it('refetches the path query when the caller gives no retry of its own', async () => {
    const user = userEvent.setup();
    const { queryClient } = renderWithApp(
      <PathStory path={undefined} loading={false} emptyHint="Pick endpoints" failed />,
    );
    const spy = vi.spyOn(queryClient, 'refetchQueries').mockResolvedValue(undefined);
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(spy).toHaveBeenCalledWith({ queryKey: ['graph-path'] });
  });

  it('separates having no path from the lookup having failed', () => {
    renderWithApp(
      <PathStory
        path={{ from: 'a', to: 'b', found: false, hops: [], edges: [] }}
        loading={false}
        emptyHint="No path within current depth"
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('No path within current depth');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('stays out of the way with nothing to report', () => {
    renderWithApp(<PathStory path={null} loading={false} emptyHint="Pick endpoints" />);
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });
});
