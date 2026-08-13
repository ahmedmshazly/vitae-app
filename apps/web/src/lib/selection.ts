/**
 * One selection model for every multi-select surface in the app.
 *
 * Four hand-rolled `Set` togglers existed before this: the two bulk-delete
 * hooks, the life map's active types and the atlas's active filters. All four
 * wrote the same six lines of `new Set(prev)` and all four disagreed about the
 * one thing that actually matters, what happens to a selected id when it stops
 * being visible.
 *
 * The answer this hook commits to: **it is dropped**. Selection is a statement
 * about the collection in front of you, so when the collection changes, ids
 * that left it leave the selection with it. That is the fix for the bug the
 * audit found, where filtering People to Family, selecting three, and switching
 * the filter back left three records the user could no longer see queued for
 * deletion. The pruning is a commit, not a display filter: switching the filter
 * away and back does not resurrect what was pruned, because a selection that
 * reappears when you retrace your steps is a selection nobody can reason about.
 *
 * Pruning happens during render, via the "adjust state when the input changes"
 * pattern, so the very first render after the collection changes already
 * reports the pruned selection. An effect would report the stale one for a
 * frame, and a frame is enough for a click on Delete to use it.
 */
import { useState } from 'react';

/**
 * What the hook can key on its own. Anything else passes `getId`; the
 * constraint stays so that omitting `getId` is a type error rather than a
 * runtime surprise.
 */
export type SelectableItem = string | { id: string };

export interface UseSelectionOptions<T> {
  /** Key for an item. Defaults to the string itself, or its `id`. */
  getId?: (item: T) => string;
}

/** Anything carrying a `shiftKey` flag, which every React mouse and keyboard
 * event does, so a caller can hand its event straight to `toggle`. */
export interface SelectionModifiers {
  shiftKey?: boolean;
}

export interface Selection<T> {
  /** The selected ids. Never holds an id outside the visible collection. */
  selected: ReadonlySet<string>;
  /** Selected ids in the collection's own order, which is display order. */
  selectedIds: string[];
  /** The selected items themselves, in the collection's order. */
  selectedItems: T[];
  count: number;
  isSelected: (id: string) => boolean;
  /** True only when the collection is non-empty and every item is selected. */
  allSelected: boolean;
  /** Some but not all: what an indeterminate checkbox would report. */
  someSelected: boolean;
  /**
   * Flip one id. Pass the event (or `{ shiftKey: true }`) to extend from the
   * anchor instead, which is the range select.
   */
  toggle: (id: string, modifiers?: SelectionModifiers) => void;
  /** Add every id between the anchor and this one, inclusive. */
  selectRange: (id: string) => void;
  selectAll: () => void;
  clear: () => void;
  /** Select all when some or none are selected, clear when all are. */
  toggleAll: () => void;
  /**
   * Where the next range select starts. Exposed because it is state a caller
   * may want to reflect (the row a range would grow from), not because the
   * hook needs anyone to manage it.
   */
  anchor: string | null;
}

interface SelectionState {
  ids: ReadonlySet<string>;
  anchor: string | null;
  /** The visible collection this state was last pruned against. */
  key: string;
}

const EMPTY: ReadonlySet<string> = new Set<string>();

/** Ids joined on NUL, which no id can contain, so `["a", "bc"]` and
 * `["ab", "c"]` key differently rather than colliding on one string. */
function keyOf(ids: readonly string[]): string {
  return ids.join('\u0000');
}

function defaultGetId(item: SelectableItem): string {
  return typeof item === 'string' ? item : item.id;
}

/**
 * Drops everything the collection no longer contains, anchor included: a range
 * cannot start from a row that is not on screen.
 */
function prune(prev: SelectionState, visible: ReadonlySet<string>, key: string): SelectionState {
  const kept = new Set<string>();
  for (const id of prev.ids) if (visible.has(id)) kept.add(id);
  const anchor = prev.anchor != null && visible.has(prev.anchor) ? prev.anchor : null;
  return {
    // Same identity when nothing was dropped, so an unrelated re-render of the
    // collection does not hand every consumer a new Set.
    ids: kept.size === prev.ids.size ? prev.ids : kept,
    anchor,
    key,
  };
}

/**
 * Selection over a keyed, visible collection.
 *
 * ```tsx
 * const sel = useSelection(visiblePeople);
 * <Checkbox checked={sel.allSelected} onChange={sel.toggleAll} label="Select all" />
 * <Row leading={<Checkbox checked={sel.isSelected(p.id)} onChange={() => sel.toggle(p.id)} />} />
 * ```
 *
 * `items` is the *visible* collection: the rows after search, filter and
 * pagination, not the full dataset. Handing it the full dataset switches the
 * pruning off, which is the one way to get the old bug back.
 */
export function useSelection<T extends SelectableItem>(
  items: readonly T[],
  options: UseSelectionOptions<T> = {},
): Selection<T> {
  const getId = options.getId ?? (defaultGetId as (item: T) => string);
  const ids = items.map(getId);
  const key = keyOf(ids);
  const visible = new Set(ids);

  const [state, setState] = useState<SelectionState>(() => ({ ids: EMPTY, anchor: null, key }));

  // Adjusting state during render, not in an effect. React re-runs this
  // component before touching the DOM, and the branch cannot repeat because it
  // writes the key it just compared. Reading `current` below rather than
  // `state` is what makes this render already correct.
  let current = state;
  if (state.key !== key) {
    current = prune(state, visible, key);
    setState(current);
  }

  const selected = current.ids;
  const selectedIds = ids.filter((id) => selected.has(id));

  function toggle(id: string, modifiers?: SelectionModifiers): void {
    if (!visible.has(id)) return;
    if (modifiers?.shiftKey) {
      selectRange(id);
      return;
    }
    setState((prev) => {
      const next = new Set(prev.ids);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      // The anchor is where you last acted, whether you added or removed.
      return { ids: next, anchor: id, key };
    });
  }

  function selectRange(id: string): void {
    if (!visible.has(id)) return;
    setState((prev) => {
      const from = prev.anchor == null ? -1 : ids.indexOf(prev.anchor);
      // Shift with nothing to extend from is just a select, and it plants the
      // anchor so the next shift has something to work with.
      if (from < 0) {
        const only = new Set(prev.ids);
        only.add(id);
        return { ids: only, anchor: id, key };
      }
      const to = ids.indexOf(id);
      const next = new Set(prev.ids);
      for (let i = Math.min(from, to); i <= Math.max(from, to); i += 1) {
        const at = ids[i];
        if (at != null) next.add(at);
      }
      // The anchor stays put, so a second shift click re-aims the same range
      // instead of chaining a new one off the last row.
      return { ids: next, anchor: prev.anchor, key };
    });
  }

  function selectAll(): void {
    setState((prev) => ({ ids: new Set(ids), anchor: prev.anchor, key }));
  }

  function clear(): void {
    setState({ ids: EMPTY, anchor: null, key });
  }

  const allSelected = ids.length > 0 && ids.every((id) => selected.has(id));

  function toggleAll(): void {
    if (allSelected) clear();
    else selectAll();
  }

  return {
    selected,
    selectedIds,
    selectedItems: items.filter((item) => selected.has(getId(item))),
    count: selected.size,
    isSelected: (id: string) => selected.has(id),
    allSelected,
    someSelected: selected.size > 0 && !allSelected,
    toggle,
    selectRange,
    selectAll,
    clear,
    toggleAll,
    anchor: current.anchor,
  };
}
