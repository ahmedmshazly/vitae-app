/**
 * The relation matrix as a thing that can be walked and read, not only looked
 * at: one tab stop rather than a thousand, rows a screen reader can count, and
 * a cell that says what it holds instead of only shading itself.
 */
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EntityObservatoryMatrix } from './EntityObservatoryMatrix.js';
import { cloneObservatoryState, type ObservatoryWorkspaceState } from './entityObservatoryModel.js';

/** One group, alphabetical, no wildcard row, so the grid is small and its
 * order is fixed whatever the catalog gains later. */
function state(over: Partial<ObservatoryWorkspaceState['display']> = {}): ObservatoryWorkspaceState {
  const base = cloneObservatoryState();
  base.filters.groups = ['Career'];
  base.filters.showWildcard = false;
  base.display = { ...base.display, sort: 'alpha', ...over };
  return base;
}

function renderMatrix(over: Partial<ObservatoryWorkspaceState['display']> = {}) {
  const onSelect = vi.fn();
  const view = render(<EntityObservatoryMatrix state={state(over)} onSelect={onSelect} />);
  return { ...view, onSelect };
}

function at(r: number, c: number): HTMLElement {
  const el = document.querySelector<HTMLElement>(`[data-r="${r}"][data-c="${c}"]`);
  if (!el) throw new Error(`no grid element at ${r},${c}`);
  return el;
}

/** Populated cells are the ones offering a detail to open. */
function populatedCells(): HTMLElement[] {
  return screen.getAllByRole('gridcell').filter((cell) => cell.hasAttribute('aria-expanded'));
}

describe('the relation matrix', () => {
  it('offers rows a screen reader can count instead of a wall of buttons', () => {
    renderMatrix();
    const rows = screen.getAllByRole('row');
    const headers = screen.getAllByRole('rowheader');
    // Every entity row, plus the one header row that carries the corner.
    expect(rows).toHaveLength(headers.length + 1);
    expect(within(rows[0]).getAllByRole('columnheader').length).toBe(headers.length + 1);
    expect(within(rows[1]).getAllByRole('rowheader')).toHaveLength(1);
  });

  it('holds a single tab stop and moves it with the arrow keys', async () => {
    const user = userEvent.setup();
    const { container } = renderMatrix();
    const stops = () => container.querySelectorAll('[data-r][tabindex="0"]');
    expect(stops()).toHaveLength(1);

    act(() => at(1, 1).focus());
    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(at(1, 2));
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(at(2, 2));
    await user.keyboard('{Home}');
    expect(document.activeElement).toBe(at(2, 0));
    expect(stops()).toHaveLength(1);
  });

  it('keeps a cell with no relation reachable rather than a hole to fall through', async () => {
    const user = userEvent.setup();
    renderMatrix();
    const empty = screen
      .getAllByRole('gridcell')
      .filter((cell) => cell.getAttribute('aria-disabled') === 'true');
    expect(empty.length).toBeGreaterThan(0);
    // `disabled` would take it out of the focus order and the arrow walk would
    // stop dead on it.
    expect(empty[0]).not.toBeDisabled();
    act(() => empty[0].focus());
    expect(document.activeElement).toBe(empty[0]);
    await user.click(empty[0]);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('says how many relations a cell holds and names them', () => {
    renderMatrix();
    const cells = populatedCells();
    expect(cells.length).toBeGreaterThan(0);
    expect(cells[0]).toHaveAccessibleName(/\d+ relations?: /);
    expect(cells[0]).toHaveAccessibleName(/ to /);
  });

  it('hands focus to the relations a cell opens, and gives it back on Escape', async () => {
    const user = userEvent.setup();
    const { onSelect } = renderMatrix();
    const cell = populatedCells()[0];
    await user.click(cell);

    const detail = await screen.findByRole('dialog');
    expect(document.activeElement).toBe(detail);
    expect(cell).toHaveAttribute('aria-expanded', 'true');

    const relations = within(detail).getAllByRole('listitem');
    await user.click(within(relations[0]).getByRole('button'));
    expect(onSelect).toHaveBeenCalledWith(expect.stringMatching(/^relation:/), false);

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.activeElement).toBe(cell);
  });

  it('puts the group in each header name, not only in its colour', () => {
    renderMatrix();
    expect(screen.getAllByRole('rowheader')[0]).toHaveAccessibleName(/Career group/);
    const columns = screen.getAllByRole('columnheader');
    expect(columns[1]).toHaveAccessibleName(/Career group/);
  });

  it('swaps the axes when transposed instead of reversing the columns', () => {
    const { rerender, unmount } = renderMatrix();
    const names = () => screen.getAllByRole('columnheader').map((el) => el.getAttribute('title'));
    const upright = names();
    expect(screen.getByText(/source ↓ · target →/)).toBeInTheDocument();

    rerender(<EntityObservatoryMatrix state={state({ transpose: true })} onSelect={vi.fn()} />);
    expect(names()).toEqual(upright);
    expect(screen.getByText(/target ↓ · source →/)).toBeInTheDocument();
    unmount();
  });
});
