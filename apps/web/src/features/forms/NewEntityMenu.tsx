/**
 * Global "+ New" entry point: a grouped type picker (Career / Job search /
 * Life / Long-tail) that opens the structured form dialog, the second capture
 * path beside ⌘K (FR-CAP-002). Bound to the `n` shortcut in the Shell.
 */
import { useState } from 'react';
import { Button, Menu, NODE_GLYPH, type MenuGroup } from '@vitae/ui';
import { type NodeType } from '@vitae/core';
import { NodeFormDialog } from './NodeFormDialog.js';

/**
 * Every creatable graph type, grouped for scanning.
 *
 * Keep this exported: the coverage test compares it with the canonical
 * NODE_TYPES catalog so adding a schema can never leave a hidden, import-only
 * entity again (the original `post` defect).
 */
export const NEW_ENTITY_MENU_GROUPS: ReadonlyArray<{
  label: string;
  types: readonly NodeType[];
}> = [
  {
    label: 'Career',
    types: [
      'person',
      'organization',
      'role',
      'project',
      'skill',
      'education',
      'certification',
      'course',
      'award',
    ],
  },
  {
    label: 'Content',
    types: ['post', 'publication', 'talk', 'repository', 'link', 'document', 'media_item', 'highlight'],
  },
  {
    label: 'Job search',
    types: ['job_posting', 'application', 'interview', 'reference'],
  },
  {
    label: 'Life',
    types: ['event', 'interaction', 'task', 'goal', 'habit', 'journal_entry', 'idea'],
  },
  {
    label: 'Long tail',
    types: ['location', 'trip', 'asset', 'health_log', 'account', 'subscription'],
  },
];

const GROUPS: MenuGroup[] = NEW_ENTITY_MENU_GROUPS.map(({ label, types }) => ({
  label,
  items: types.map((t) => ({ key: t, label: t.replace(/_/g, ' '), glyph: NODE_GLYPH[t] ?? 'dot' })),
}));

export function NewEntityMenu({
  open,
  onOpenChange,
}: {
  /** Controlled menu open state (the `n` shortcut drives this). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [formType, setFormType] = useState<NodeType | null>(null);

  return (
    <>
      <Menu
        open={open}
        onOpenChange={onOpenChange}
        trigger={
          <Button size="sm" glyph="plus" aria-label="New record (n)" title="New record (n)">
            <span className="topbar__action-label">New</span>
          </Button>
        }
        groups={GROUPS}
        columns
        onSelect={(key) => setFormType(key as NodeType)}
      />
      {formType && (
        <NodeFormDialog
          open
          onOpenChange={(o) => {
            if (!o) setFormType(null);
          }}
          type={formType}
        />
      )}
    </>
  );
}
