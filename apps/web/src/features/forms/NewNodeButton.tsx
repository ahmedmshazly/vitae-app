/** "New <type>" button + form dialog, the per-page create entry point. */
import { useState } from 'react';
import { Button } from '@vitae/ui';
import { isNodeType, type NodeType } from '@vitae/core';
import { NodeFormDialog } from './NodeFormDialog.js';

export function NewNodeButton({ type, label }: { type: string; label?: string }) {
  const [open, setOpen] = useState(false);
  if (!isNodeType(type)) return null;
  const nodeType = type as NodeType;
  return (
    <>
      <Button size="sm" glyph="plus" onClick={() => setOpen(true)}>
        {label ?? `New ${nodeType.replace(/_/g, ' ')}`}
      </Button>
      {open && <NodeFormDialog open onOpenChange={setOpen} type={nodeType} />}
    </>
  );
}
