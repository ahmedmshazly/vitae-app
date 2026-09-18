/**
 * Multi-select soft-unlink for connection lists (Person + Record).
 *
 * Two defects of the same shape as its node sibling. The bar was a bare
 * fragment the callers put in a `Section`'s actions slot, so staging the first
 * connection grew the "Connections" heading and pushed the list down mid
 * gesture, and the count sat in no live region: a screen-reader user could not
 * tell how many connections were staged before confirming a destructive act.
 * And a partial failure went out on the neutral toast channel with no Undo, no
 * retry and the whole selection cleared, so eight unlinks with two failures
 * looked exactly like eight unlinks that worked.
 */
import { useCallback, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Button, ConfirmDialog } from '@vitae/ui';
import { api } from '../lib/api.js';
import { refreshConnections } from '../lib/refresh-connections.js';
import { useCanWrite, WRITE_LOCK_HINT } from '../lib/auth.js';
import { BulkBar } from '../components/BulkBar.js';
import { useToast } from './Toast.js';

export function useBulkEdgeDelete() {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [confirmUnlink, setConfirmUnlink] = useState(false);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const canWrite = useCanWrite();
  const qc = useQueryClient();
  const { flash } = useToast();

  const selectedCount = selected.size;

  const toggleOne = useCallback((id: string) => {
    if (inFlight.current) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback((ids: string[], allSelected: boolean) => {
    if (inFlight.current) return;
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

  const clear = useCallback(() => {
    if (!inFlight.current) setSelected(new Set());
  }, []);
  const changeConfirmation = useCallback((open: boolean) => {
    if (!inFlight.current) setConfirmUnlink(open);
  }, []);
  const reconcile = useCallback((ids: string[]) => {
    if (inFlight.current) return;
    const live = new Set(ids);
    setSelected((previous) => {
      const next = new Set([...previous].filter((id) => live.has(id)));
      return next.size === previous.size ? previous : next;
    });
  }, []);

  const unlinkSelected = useCallback(async () => {
    const ids = [...selected];
    if (ids.length === 0 || inFlight.current) return;
    if (!canWrite) {
      flash(WRITE_LOCK_HINT, { variant: 'error' });
      return;
    }
    inFlight.current = true;
    setBusy(true);
    try {
      const results = await Promise.allSettled(ids.map((id) => api.del(`/edges/${id}`)));
      const succeeded = ids.filter((_, i) => results[i]?.status === 'fulfilled');
      const failedIds = ids.filter((_, i) => results[i]?.status === 'rejected');
      await refreshConnections(qc);
      let remainingToRestore = succeeded;
      const undo = async () => {
        const restored = await Promise.allSettled(
          remainingToRestore.map((id) => api.post(`/edges/${id}/restore`)),
        );
        remainingToRestore = remainingToRestore.filter(
          (_, i) => restored[i]?.status === 'rejected',
        );
        await refreshConnections(qc);
        if (remainingToRestore.length > 0)
          throw new Error('Some connections could not be restored. Retry Undo.');
      };
      if (failedIds.length === 0) {
        setSelected(new Set());
        flash(
          `Unlinked ${succeeded.length} ${succeeded.length === 1 ? 'connection' : 'connections'}`,
          {
            undo,
          },
        );
      } else {
        // The ones that failed stay staged so the retry is one click. Undo
        // stays on offer either way, attached to the ids that actually moved:
        // a half-finished unlink is exactly the outcome somebody wants to back
        // out of, and it was the one case that offered no way back.
        setSelected(new Set(failedIds));
        flash(
          `Unlinked ${succeeded.length} · ${failedIds.length} still selected and not unlinked`,
          {
            variant: 'error',
            ...(succeeded.length > 0 ? { undo } : {}),
          },
        );
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
      setConfirmUnlink(false);
    }
  }, [selected, qc, flash, canWrite]);

  return {
    selected,
    selectedCount,
    busy,
    confirmUnlink,
    setConfirmUnlink: changeConfirmation,
    toggleOne,
    toggleAll,
    clear,
    reconcile,
    unlinkSelected,
    isSelected: (id: string) => selected.has(id),
  };
}

/**
 * The staging bar for connections. Render it unconditionally; `BulkBar` owns
 * the `count > 0` decision, which is what keeps its live region mounted before
 * there is anything to announce. Portalled for the reason `BulkDeleteBar`
 * documents: the callers pass it to a `Section` actions slot, and a fixed layer
 * has to escape whatever that slot is nested in.
 */
export function BulkUnlinkBar({
  selectedCount,
  onClear,
  onUnlink,
  allSelected,
  onToggleAll,
  busy = false,
}: {
  selectedCount: number;
  onClear: () => void;
  onUnlink: () => void;
  /** Pass both to put select-all in the bar itself. */
  allSelected?: boolean;
  onToggleAll?: () => void;
  busy?: boolean;
}) {
  const canWrite = useCanWrite();
  if (typeof document === 'undefined') return null;
  return createPortal(
    <BulkBar
      count={selectedCount}
      noun="connection"
      label="Connection bulk actions"
      allSelected={allSelected}
      onToggleAll={onToggleAll}
      onClear={onClear}
      busy={busy}
    >
      <Button
        variant="danger"
        size="sm"
        glyph="trash"
        onClick={onUnlink}
        disabled={!canWrite || busy}
        title={canWrite ? undefined : WRITE_LOCK_HINT}
      >
        {busy ? 'Unlinking…' : 'Unlink'}
      </Button>
    </BulkBar>,
    document.body,
  );
}

export function BulkUnlinkConfirm({
  open,
  onOpenChange,
  selectedCount,
  busy,
  onConfirm,
  titles = [],
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedCount: number;
  busy?: boolean;
  onConfirm: () => void;
  titles?: string[];
}) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        if (!busy) onOpenChange(next);
      }}
      title={
        selectedCount === 1 ? 'Unlink this connection?' : `Unlink ${selectedCount} connections?`
      }
      body={
        <>
          <p>
            Only the selected relationships will be removed. The records themselves stay. Undo is
            available after unlinking.
          </p>
          {titles.length > 0 && (
            <ul className="bulk-unlink-preview">
              {titles.slice(0, 5).map((title, index) => (
                <li key={index}>{title}</li>
              ))}
            </ul>
          )}
          {selectedCount > 5 && titles.length > 0 && (
            <p>And {selectedCount - 5} more selected connections.</p>
          )}
        </>
      }
      confirmLabel={selectedCount === 1 ? 'Unlink' : `Unlink ${selectedCount}`}
      destructive
      initialFocus="cancel"
      busy={busy}
      onConfirm={onConfirm}
    />
  );
}
