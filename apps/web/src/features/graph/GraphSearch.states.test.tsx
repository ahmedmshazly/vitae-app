/**
 * ⌘F over the map, and the readable twin of the canvas beside it.
 *
 * The list was a ul role="listbox" whose children were not options, driven by
 * an input that declared no combobox role, so arrowing changed a background
 * tone and announced nothing. Nothing spoke the hit count either, and the
 * twelve row cap was invisible.
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithApp } from '../../test/render.js';
import { ConnectedList, GraphSearch } from './GraphSearch.js';
import type { FgNode } from './types.js';

const nodes = [
  { id: '1', title: 'Ada Lovelace', type: 'person' },
  { id: '2', title: 'Analytical Engine', type: 'project' },
  { id: '3', title: 'Grace Hopper', type: 'person' },
] as FgNode[];

const many = Array.from({ length: 20 }, (_, i) => ({
  id: `n${i}`,
  title: `Record ${i}`,
  type: 'person',
})) as FgNode[];

describe('GraphSearch combobox', () => {
  it('owns the listbox and names the row Enter will take', async () => {
    const user = userEvent.setup();
    renderWithApp(<GraphSearch open nodes={nodes} onClose={() => {}} onPick={() => {}} />);

    const input = screen.getByRole('combobox', { name: 'Search nodes in graph' });
    await waitFor(() => expect(input).toHaveFocus());
    expect(input).toHaveAttribute('aria-autocomplete', 'list');
    expect(input).toHaveAttribute('aria-expanded', 'true');

    const listbox = screen.getByRole('listbox', { name: 'Records in view' });
    expect(input).toHaveAttribute('aria-controls', listbox.id);

    const options = within(listbox).getAllByRole('option');
    expect(options).toHaveLength(3);
    expect(options[0]).toHaveAttribute('aria-selected', 'true');
    expect(input).toHaveAttribute('aria-activedescendant', options[0]!.id);

    await user.keyboard('{ArrowDown}');
    expect(options[1]).toHaveAttribute('aria-selected', 'true');
    expect(options[0]).toHaveAttribute('aria-selected', 'false');
    expect(input).toHaveAttribute('aria-activedescendant', options[1]!.id);
  });

  it('speaks the hit count as the query narrows', async () => {
    const user = userEvent.setup();
    renderWithApp(<GraphSearch open nodes={nodes} onClose={() => {}} onPick={() => {}} />);

    const input = screen.getByRole('combobox', { name: 'Search nodes in graph' });
    expect(screen.getByRole('status')).toHaveTextContent('3 records in view');

    await user.type(input, 'Ada');
    expect(screen.getByRole('status')).toHaveTextContent('1 match');
  });

  it('says when it is showing only the first twelve of a longer list', () => {
    renderWithApp(<GraphSearch open nodes={many} onClose={() => {}} onPick={() => {}} />);
    expect(screen.getAllByRole('option')).toHaveLength(12);
    expect(screen.getByRole('status')).toHaveTextContent('Showing 12 of 20 records in view');
  });

  it('keeps the empty message out of the listbox', async () => {
    const user = userEvent.setup();
    renderWithApp(<GraphSearch open nodes={nodes} onClose={() => {}} onPick={() => {}} />);

    await user.type(screen.getByRole('combobox', { name: 'Search nodes in graph' }), 'zzz');
    expect(screen.getByRole('status')).toHaveTextContent('No matches in view');
    expect(screen.queryByRole('listbox')).toBeEmptyDOMElement();
    expect(screen.getByRole('combobox')).not.toHaveAttribute('aria-activedescendant');
  });

  it('hands focus back to whoever pressed the shortcut', async () => {
    function Harness({ open }: { open: boolean }) {
      return (
        <>
          <button type="button">Canvas</button>
          <GraphSearch open={open} nodes={nodes} onClose={() => {}} onPick={() => {}} />
        </>
      );
    }
    const user = userEvent.setup();
    const { rerender } = renderWithApp(<Harness open={false} />);
    const canvas = screen.getByRole('button', { name: 'Canvas' });
    await user.click(canvas);
    expect(canvas).toHaveFocus();

    rerender(<Harness open />);
    await waitFor(() => expect(screen.getByRole('combobox')).toHaveFocus());

    rerender(<Harness open={false} />);
    await waitFor(() => expect(canvas).toHaveFocus());
  });
});

describe('ConnectedList', () => {
  it('invites a selection instead of a faint sentence', () => {
    renderWithApp(
      <ConnectedList open selected={null} rows={[]} onSelect={() => {}} onToggle={() => {}} />,
    );
    expect(screen.getByText('Nothing selected')).toBeInTheDocument();
    expect(screen.getByText(/press ⌘F to find one/)).toBeInTheDocument();
  });

  it('offers a way out when the filters hid every neighbour', () => {
    renderWithApp(
      <ConnectedList
        open
        selected={nodes[0]!}
        rows={[]}
        onSelect={() => {}}
        onToggle={() => {}}
      />,
    );
    expect(screen.getByText('No neighbors in view')).toBeInTheDocument();
    expect(screen.getByText(/Widen the record filters/)).toBeInTheDocument();
  });

  it('names its own toggle and reports the panel state', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    renderWithApp(
      <ConnectedList
        open
        selected={nodes[0]!}
        rows={[{ node: nodes[2]!, edgeLabel: 'knows' }]}
        onSelect={() => {}}
        onToggle={onToggle}
      />,
    );
    const hide = screen.getByRole('button', { name: 'Hide connected list' });
    expect(hide).toHaveAttribute('aria-expanded', 'true');
    await user.click(hide);
    expect(onToggle).toHaveBeenCalled();
  });
});
