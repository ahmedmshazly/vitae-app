/**
 * Graph search typeahead over in-view nodes.
 */
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithApp } from '../../test/render.js';
import { GraphSearch } from './GraphSearch.js';
import type { FgNode } from './types.js';

const nodes = [
  { id: '1', title: 'Ada Lovelace', type: 'person' },
  { id: '2', title: 'Analytical Engine', type: 'project' },
] as FgNode[];

describe('GraphSearch', () => {
  it('filters hits, picks on Enter, and shows empty state', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    const onClose = vi.fn();
    renderWithApp(<GraphSearch open nodes={nodes} onClose={onClose} onPick={onPick} />);

    const input = screen.getByLabelText('Search nodes in graph');
    await waitFor(() => expect(input).toHaveFocus());
    await user.type(input, 'zzz');
    expect(screen.getByText('No matches in view')).toBeInTheDocument();

    await user.clear(input);
    await user.type(input, 'Ada');
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    await user.keyboard('{Enter}');
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: '1' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('renders nothing when closed', () => {
    const { container } = renderWithApp(
      <GraphSearch open={false} nodes={nodes} onClose={() => {}} onPick={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
