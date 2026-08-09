/**
 * Shared multi-select soft-delete for entity list pages (People, Orgs, Browse,
 * Repositories). Soft-deletes via DELETE /nodes/:id and lands records in Trash.
 */
import { useCallback, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button, ConfirmDialog, Glyph, Mono } from '@vitae/ui';
import { api } from '../lib/api.js';
import { useToast } from './Toast.js';

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
      const failed = results.filter((r) => r.status === 'rejected').length;
      const ok = ids.length - failed;
      await qc.invalidateQueries();
      setSelected(new Set());
      if (failed === 0) flash(`Moved ${ok} ${ok === 1 ? noun : nouns} to trash`);
      else flash(`Moved ${ok} to trash · ${failed} failed`);
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

export function BulkDeleteBar({
  selectedCount,
  onClear,
  onDelete,
}: {
  selectedCount: number;
  onClear: () => void;
  onDelete: () => void;
}) {
  if (selectedCount === 0) return null;
  return (
    <>
      <Mono className="u-muted" style={{ fontSize: 'var(--ae-text-sm)' }}>
        {selectedCount} selected
      </Mono>
      <Button size="sm" onClick={onClear}>
        Clear
      </Button>
      <Button variant="danger" size="sm" glyph="trash" onClick={onDelete}>
        Delete
      </Button>
    </>
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
    <button
      type="button"
      className="vt-check__box"
      data-state={checked ? 'checked' : 'unchecked'}
      aria-label={label}
      aria-pressed={checked}
      onClick={onToggle}
    >
      {checked && <Glyph name="check" size={12} className="vt-check__mark" />}
    </button>
  );
}

export function SelectAllRow({
  allSelected,
  onToggle,
}: {
  allSelected: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="row people__selectrow">
      <SelectCheckbox
        checked={allSelected}
        label={allSelected ? 'Deselect all visible' : 'Select all visible'}
        onToggle={onToggle}
      />
      <div className="row__main">
        <div className="row__sub">{allSelected ? 'Deselect all' : 'Select all'}</div>
      </div>
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
