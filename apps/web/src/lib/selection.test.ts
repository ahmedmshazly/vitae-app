/**
 * The behaviour that matters here is the one the four hand-rolled Set togglers
 * never had: an id that leaves the visible collection leaves the selection, and
 * it leaves permanently. Every other test in this file exists so the pruning
 * tests cannot pass by accident on a hook that selects nothing.
 */
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useSelection } from './selection.js';

interface Person {
  id: string;
  title: string;
}

const LINA: Person = { id: 'p1', title: 'Lina Farouk' };
const DANA: Person = { id: 'p2', title: 'Dana Okafor' };
const SAM: Person = { id: 'p3', title: 'Sam Okonkwo' };
const NADIA: Person = { id: 'p4', title: 'Nadia Farouk' };
const EVERYONE = [LINA, DANA, SAM, NADIA];

function renderSelection(items: Person[] = EVERYONE) {
  return renderHook(({ visible }) => useSelection(visible), {
    initialProps: { visible: items },
  });
}

describe('useSelection', () => {
  it('starts empty', () => {
    const { result } = renderSelection();
    expect(result.current.count).toBe(0);
    expect(result.current.selectedIds).toEqual([]);
    expect(result.current.allSelected).toBe(false);
    expect(result.current.someSelected).toBe(false);
    expect(result.current.anchor).toBeNull();
  });

  it('toggle adds an id and toggling the same id removes it', () => {
    const { result } = renderSelection();

    act(() => result.current.toggle('p2'));
    expect(result.current.isSelected('p2')).toBe(true);
    expect(result.current.count).toBe(1);

    act(() => result.current.toggle('p2'));
    expect(result.current.isSelected('p2')).toBe(false);
    expect(result.current.count).toBe(0);
  });

  it('reports selected ids and items in the collection order, not click order', () => {
    const { result } = renderSelection();

    act(() => result.current.toggle('p4'));
    act(() => result.current.toggle('p1'));

    expect(result.current.selectedIds).toEqual(['p1', 'p4']);
    expect(result.current.selectedItems).toEqual([LINA, NADIA]);
  });

  it('refuses an id that is not in the visible collection', () => {
    const { result } = renderSelection([LINA, DANA]);

    act(() => result.current.toggle('p3'));

    expect(result.current.count).toBe(0);
  });

  it('selectAll takes every visible id and clear drops them all', () => {
    const { result } = renderSelection();

    act(() => result.current.selectAll());
    expect(result.current.count).toBe(4);
    expect(result.current.allSelected).toBe(true);
    expect(result.current.someSelected).toBe(false);

    act(() => result.current.clear());
    expect(result.current.count).toBe(0);
    expect(result.current.anchor).toBeNull();
  });

  it('someSelected is true only between none and all', () => {
    const { result } = renderSelection();

    act(() => result.current.toggle('p1'));
    expect(result.current.someSelected).toBe(true);
    expect(result.current.allSelected).toBe(false);

    act(() => result.current.selectAll());
    expect(result.current.someSelected).toBe(false);
  });

  it('allSelected stays false for an empty collection', () => {
    const { result } = renderSelection([]);
    expect(result.current.allSelected).toBe(false);
  });

  it('toggleAll selects everything from partial, then clears from full', () => {
    const { result } = renderSelection();

    act(() => result.current.toggle('p1'));
    act(() => result.current.toggleAll());
    expect(result.current.count).toBe(4);

    act(() => result.current.toggleAll());
    expect(result.current.count).toBe(0);
  });

  it('shift extends from the anchor, inclusive of both ends', () => {
    const { result } = renderSelection();

    act(() => result.current.toggle('p1'));
    act(() => result.current.toggle('p3', { shiftKey: true }));

    expect(result.current.selectedIds).toEqual(['p1', 'p2', 'p3']);
  });

  it('shift extends backwards too', () => {
    const { result } = renderSelection();

    act(() => result.current.toggle('p4'));
    act(() => result.current.toggle('p2', { shiftKey: true }));

    expect(result.current.selectedIds).toEqual(['p2', 'p3', 'p4']);
  });

  it('a second shift re-aims the range from the same anchor', () => {
    const { result } = renderSelection();

    act(() => result.current.toggle('p1'));
    act(() => result.current.toggle('p3', { shiftKey: true }));
    act(() => result.current.toggle('p4', { shiftKey: true }));

    expect(result.current.anchor).toBe('p1');
    expect(result.current.selectedIds).toEqual(['p1', 'p2', 'p3', 'p4']);
  });

  it('shift with no anchor yet selects the one row and plants the anchor', () => {
    const { result } = renderSelection();

    act(() => result.current.toggle('p3', { shiftKey: true }));

    expect(result.current.selectedIds).toEqual(['p3']);
    expect(result.current.anchor).toBe('p3');
  });

  it('selectRange can be called without an event', () => {
    const { result } = renderSelection();

    act(() => result.current.toggle('p2'));
    act(() => result.current.selectRange('p4'));

    expect(result.current.selectedIds).toEqual(['p2', 'p3', 'p4']);
  });

  it('selectRange refuses an id the collection does not hold', () => {
    const { result } = renderSelection();

    act(() => result.current.toggle('p3'));
    // Without the guard this is not a no-op, it is a mass selection: the id is
    // at index -1, so the range runs from row 0 up to the anchor and takes
    // every row on the way.
    act(() => result.current.selectRange('ghost'));

    expect(result.current.selectedIds).toEqual(['p3']);
    expect(result.current.anchor).toBe('p3');
  });

  it('shift refuses an id the collection does not hold', () => {
    const { result } = renderSelection();

    act(() => result.current.toggle('p3'));
    act(() => result.current.toggle('ghost', { shiftKey: true }));

    expect(result.current.selectedIds).toEqual(['p3']);
  });

  /* Pruning. ---------------------------------------------------------------- */

  it('drops selected ids that the collection no longer contains', () => {
    const { result, rerender } = renderSelection();

    act(() => result.current.selectAll());
    expect(result.current.count).toBe(4);

    // The filter narrows to two records. The other two are off screen, so they
    // are no longer queued for anything.
    rerender({ visible: [LINA, DANA] });

    expect(result.current.count).toBe(2);
    expect(result.current.selectedIds).toEqual(['p1', 'p2']);
    expect(result.current.isSelected('p3')).toBe(false);
  });

  it('prunes when the rows are swapped for others and the count stays the same', () => {
    const { result, rerender } = renderSelection([LINA, DANA]);

    act(() => result.current.selectAll());
    expect(result.current.count).toBe(2);

    // Page two of a fixed page size, and the shape of the bug the hook exists
    // to close: two filters can match the same number of records, so a change
    // detector that watches the count sees nothing happen here.
    rerender({ visible: [SAM, NADIA] });

    expect(result.current.count).toBe(0);
    expect(result.current.selectedIds).toEqual([]);
  });

  it('prunes the one row that left when another arrives in its place', () => {
    const { result, rerender } = renderSelection([LINA, DANA]);

    act(() => result.current.selectAll());
    rerender({ visible: [LINA, SAM] });

    expect(result.current.selectedIds).toEqual(['p1']);
    expect(result.current.isSelected('p2')).toBe(false);
  });

  it('drops an anchor whose row was swapped out at the same count', () => {
    const { result, rerender } = renderSelection([LINA, DANA]);

    act(() => result.current.toggle('p2'));
    expect(result.current.anchor).toBe('p2');

    rerender({ visible: [LINA, SAM] });

    expect(result.current.anchor).toBeNull();
  });

  it('tells two collections apart when their ids run together the same way', () => {
    const { result, rerender } = renderHook(({ visible }) => useSelection(visible), {
      initialProps: { visible: ['ab', 'c'] },
    });

    act(() => result.current.selectAll());
    // "ab" + "c" and "a" + "bc" are different collections that concatenate to
    // the same string, so the change detector has to separate them.
    rerender({ visible: ['a', 'bc'] });

    expect(result.current.count).toBe(0);
  });

  it('pruning is a commit: widening the collection again does not bring them back', () => {
    const { result, rerender } = renderSelection();

    act(() => result.current.selectAll());
    rerender({ visible: [LINA] });
    expect(result.current.count).toBe(1);

    rerender({ visible: EVERYONE });

    expect(result.current.count).toBe(1);
    expect(result.current.selectedIds).toEqual(['p1']);
  });

  it('reports the pruned count on the first render after the change', () => {
    const rendered: number[] = [];
    const { result, rerender } = renderHook(
      ({ visible }) => {
        const selection = useSelection(visible);
        rendered.push(selection.count);
        return selection;
      },
      { initialProps: { visible: EVERYONE } },
    );

    act(() => result.current.selectAll());
    rendered.length = 0;
    rerender({ visible: [LINA] });

    // Not one render reports the stale 4. A single frame of 4 is enough for a
    // click on Delete to act on records nobody can see.
    expect(rendered).not.toContain(4);
    expect(rendered.at(-1)).toBe(1);
  });

  it('drops the anchor when its row leaves, so a later shift cannot span the gap', () => {
    const { result, rerender } = renderSelection();

    act(() => result.current.toggle('p1'));
    rerender({ visible: [DANA, SAM, NADIA] });
    expect(result.current.anchor).toBeNull();

    act(() => result.current.toggle('p4', { shiftKey: true }));

    expect(result.current.selectedIds).toEqual(['p4']);
  });

  it('keeps the selection when the collection is rebuilt with the same ids', () => {
    const { result, rerender } = renderSelection();

    act(() => result.current.toggle('p2'));
    // A refetch hands back equal records in new objects, which is not a change
    // to what is visible and must not clear anything.
    rerender({ visible: EVERYONE.map((person) => ({ ...person })) });

    expect(result.current.selectedIds).toEqual(['p2']);
  });

  it('notices a reorder without dropping anything', () => {
    const { result, rerender } = renderSelection();

    act(() => result.current.selectAll());
    rerender({ visible: [NADIA, SAM, DANA, LINA] });

    expect(result.current.count).toBe(4);
    expect(result.current.selectedIds).toEqual(['p4', 'p3', 'p2', 'p1']);
  });

  it('clears everything when the collection empties', () => {
    const { result, rerender } = renderSelection();

    act(() => result.current.selectAll());
    rerender({ visible: [] });

    expect(result.current.count).toBe(0);
    expect(result.current.selectedItems).toEqual([]);
  });

  /* Other shapes of collection. --------------------------------------------- */

  it('keys a list of plain strings by the string itself', () => {
    const { result } = renderHook(() => useSelection(['person', 'org', 'project']));

    act(() => result.current.toggle('org'));

    expect(result.current.selectedItems).toEqual(['org']);
    expect(result.current.isSelected('org')).toBe(true);
  });

  it('takes a custom key when the id is not called id', () => {
    const rows = [{ id: 'ignored', edgeId: 'e1' }, { id: 'ignored', edgeId: 'e2' }];
    const { result } = renderHook(() =>
      useSelection(rows, { getId: (row: { edgeId: string }) => row.edgeId }),
    );

    act(() => result.current.toggle('e2'));

    expect(result.current.selectedIds).toEqual(['e2']);
  });
});
