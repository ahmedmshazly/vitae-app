/**
 * Shared multi-select soft-delete for entity list pages (People, Orgs, Browse,
 * Repositories). Soft-deletes via DELETE /nodes/:id and lands records in Trash.
 *
 * Three things it used to get wrong, all of them things the design system had
 * already solved somewhere else:
 *
 * - the bar was a bare fragment every caller dropped into `PageHeader`'s
 *   actions slot, so selecting the first row grew the header and the list
 *   jumped down under the cursor that was still selecting. It renders
 *   `components/BulkBar.tsx` now, portalled to the body so it lands in its own
 *   fixed layer no matter which slot the caller put it in. That also brings
 *   the polite live region the count never had, and Escape-to-clear.
 * - the row checkbox was a `<button aria-pressed>` wearing the `Checkbox`
 *   primitive's class, so a screen reader was told "toggle button" for the
 *   same act that announces "checkbox" everywhere else, and the target was
 *   18px on desktop and still 18px on touch. It is the real `Checkbox`.
 * - a partial failure went out on the neutral toast channel with no reason and
 *   no retry, and the selection was cleared including the records that failed,
 *   so the two that did not move to trash could not be re-targeted. Failures
 *   stay staged and the toast is an error.
 */
import { useCallback, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Checkbox, ConfirmDialog } from '@vitae/ui';
import { useCanWrite, WRITE_LOCK_HINT } from '../lib/auth.js';
import { api } from '../lib/api.js';
import { BulkBar } from '../components/BulkBar.js';
import { useToast } from './Toast.js';

/** Everything a single-row delete can invalidate, and nothing else. */
const AFFECTED_KEYS = [['people'], ['orgs'], ['nodes'], ['node'], ['browse'], ['trash']] as const;

export function useBulkNodeDelete(opts?: {
  /** Singular noun for toasts, e.g. "person" → "Moved 1 person to trash". */
  noun?: string;
  /** Plural noun; defaults to `${noun}s`. */
  nouns?: string;
}) {
  const noun = opts?.noun ?? 'record';
  const nouns = opts?.nouns ?? `${noun}s`;
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const qc = useQueryClient();
  const { flash } = useToast();

  const selectedCount = selected.size;

  const toggleOne = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback((ids: string[], allSelected: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        for (const id of ids) next.delete(id);
      } else {
        for (const id of ids) next.add(id);
      }
      return next;
    });
  }, []);

  const clear = useCallback(() => setSelected(new Set()), []);

  const deleteSelected = useCallback(async () => {
    const ids = [...selected];
    if (ids.length === 0) return;
    setDeleting(true);
    try {
      const results = await Promise.allSettled(ids.map((id) => api.del(`/nodes/${id}`)));
      const failedIds = ids.filter((_, i) => results[i]?.status === 'rejected');
      const ok = ids.length - failedIds.length;
      // Named keys rather than a bare invalidateQueries(): invalidating the
      // whole cache flips every mounted QueryBoundary to refreshing at once and
      // re-fires the lazy graph and map queries, so one row delete reads as the
      // whole app reloading.
      await Promise.all(AFFECTED_KEYS.map((queryKey) => qc.invalidateQueries({ queryKey: [...queryKey] })));
      // Keep the failures staged. Clearing them too means the records that did
      // not move have to be found by hand again.
      setSelected(new Set(failedIds));
      if (failedIds.length === 0) flash(`Moved ${ok} ${ok === 1 ? noun : nouns} to trash`);
      else
        flash(`Moved ${ok} to trash · ${failedIds.length} still selected and not deleted`, {
          variant: 'error',
        });
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  }, [selected, qc, flash, noun, nouns]);

  return {
    selected,
    selectedCount,
    deleting,
    confirmDelete,
    setConfirmDelete,
    toggleOne,
    toggleAll,
    clear,
    deleteSelected,
    isSelected: (id: string) => selected.has(id),
  };
}

/**
 * The selection bar. Render it unconditionally: it is `BulkBar` underneath, and
 * `BulkBar` owns the `count > 0` decision so the live region announcing the
 * count stays mounted whether or not the bar is showing.
 *
 * It portals to the body because callers pass it to a `PageHeader` `actions`
 * slot. `BulkBar` is a fixed layer, and a fixed layer inside a transformed or
 * clipped ancestor is neither fixed nor unclipped; the portal makes where the
 * caller mounted it irrelevant, and keeps `bulkBarIsDetached` true.
 */
export function BulkDeleteBar({
  selectedCount,
  onClear,
  onDelete,
  noun,
  nouns,
  allSelected,
  onToggleAll,
}: {
  selectedCount: number;
  onClear: () => void;
  onDelete: () => void;
  noun?: string;
  nouns?: string;
  /** Pass both to put select-all in the bar itself. */
  allSelected?: boolean;
  onToggleAll?: () => void;
}) {
  const canWrite = useCanWrite();
  if (typeof document === 'undefined') return null;
  return createPortal(
    <BulkBar
      count={selectedCount}
      noun={noun}
      nouns={nouns}
      allSelected={allSelected}
      onToggleAll={onToggleAll}
      onClear={onClear}
    >
      <Button
        variant="danger"
        size="sm"
        glyph="trash"
        onClick={onDelete}
        disabled={!canWrite}
        title={canWrite ? undefined : WRITE_LOCK_HINT}
      >
        Delete
      </Button>
    </BulkBar>,
    document.body,
  );
}

export function BulkDeleteConfirm({
  open,
  onOpenChange,
  selectedCount,
  titles,
  noun = 'record',
  nouns,
  busy,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedCount: number;
  titles: string[];
  noun?: string;
  nouns?: string;
  busy?: boolean;
  onConfirm: () => void;
}) {
  const plural = nouns ?? `${noun}s`;
  const title =
    selectedCount === 1
      ? `Move “${titles[0] ?? `this ${noun}`}” to trash?`
      : `Move ${selectedCount} ${plural} to trash?`;
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      body="They stay recoverable from Trash for 30 days; connections are preserved."
      confirmLabel={selectedCount === 1 ? 'Move to trash' : `Move ${selectedCount} to trash`}
      destructive
      busy={busy}
      onConfirm={onConfirm}
    />
  );
}

/**
 * The row selection control. One checkbox semantic for the whole app, and the
 * `<label class="vt-check">` wrapper is the hit target, which is what picks up
 * the 44px coarse-pointer minimum the bare box never had.
 */
export function SelectCheckbox({
  checked,
  label,
  onToggle,
}: {
  checked: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <Checkbox
      checked={checked}
      onChange={onToggle}
      label={<span className="u-visually-hidden">{label}</span>}
    />
  );
}

/**
 * Select-all for the visible page of a list.
 *
 * The words used to sit in a `row__sub` div beside the box, so clicking
 * "Select all" did nothing and a voice-control user asking for it got no
 * match. They are the checkbox's own label now, which makes them part of both
 * the accessible name and the target.
 */
export function SelectAllRow({
  allSelected,
  onToggle,
}: {
  allSelected: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="row people__selectrow">
      <Checkbox
        checked={allSelected}
        onChange={onToggle}
        label={allSelected ? 'Deselect all visible' : 'Select all visible'}
      />
    </div>
  );
}

/** Titles for the confirm dialog from a list of {id,title} items. */
export function titlesForSelection<T extends { id: string; title: string }>(
  items: T[],
  selected: Set<string>,
): string[] {
  return items.filter((item) => selected.has(item.id)).map((item) => item.title);
}

export function useVisibleSelection(visibleIds: string[], selected: Set<string>) {
  return useMemo(() => {
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
    return { allVisibleSelected };
  }, [visibleIds, selected]);
}
