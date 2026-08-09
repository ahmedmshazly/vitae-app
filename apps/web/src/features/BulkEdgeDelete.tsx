/**
 * Multi-select soft-unlink for connection lists (Person + Record).
 */
import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button, ConfirmDialog, Mono } from '@vitae/ui';
import { api } from '../lib/api.js';
import { useToast } from './Toast.js';

export function useBulkEdgeDelete() {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [confirmUnlink, setConfirmUnlink] = useState(false);
  const [busy, setBusy] = useState(false);
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

  const unlinkSelected = useCallback(async () => {
    const ids = [...selected];
    if (ids.length === 0) return;
    setBusy(true);
    try {
      const results = await Promise.allSettled(ids.map((id) => api.del(`/edges/${id}`)));
      const succeeded = ids.filter((_, i) => results[i]?.status === 'fulfilled');
      const failed = ids.length - succeeded.length;
      await qc.invalidateQueries({ queryKey: ['node'] });
      setSelected(new Set());
      if (failed === 0) {
        flash(`Unlinked ${succeeded.length} ${succeeded.length === 1 ? 'connection' : 'connections'}`, {
          undo: async () => {
            await Promise.allSettled(succeeded.map((id) => api.post(`/edges/${id}/restore`)));
            await qc.invalidateQueries({ queryKey: ['node'] });
          },
        });
      } else {
        flash(`Unlinked ${succeeded.length} · ${failed} failed`);
      }
    } finally {
      setBusy(false);
      setConfirmUnlink(false);
    }
  }, [selected, qc, flash]);

  return {
    selected,
    selectedCount,
    busy,
    confirmUnlink,
    setConfirmUnlink,
    toggleOne,
    toggleAll,
    clear,
    unlinkSelected,
    isSelected: (id: string) => selected.has(id),
  };
}

export function BulkUnlinkBar({
  selectedCount,
  onClear,
  onUnlink,
}: {
  selectedCount: number;
  onClear: () => void;
  onUnlink: () => void;
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
      <Button variant="danger" size="sm" glyph="trash" onClick={onUnlink}>
        Unlink
      </Button>
    </>
  );
}

export function BulkUnlinkConfirm({
  open,
  onOpenChange,
  selectedCount,
  busy,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedCount: number;
  busy?: boolean;
  onConfirm: () => void;
}) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={
        selectedCount === 1
          ? 'Unlink this connection?'
          : `Unlink ${selectedCount} connections?`
      }
      body="Relationships are soft-deleted and recoverable with Undo. The records themselves stay."
      confirmLabel={selectedCount === 1 ? 'Unlink' : `Unlink ${selectedCount}`}
      destructive
      busy={busy}
      onConfirm={onConfirm}
    />
  );
}
