import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Chip,
  EmptyState,
  EntityGlyph,
  ErrorState,
  Mono,
  PageHeader,
  ProvenanceChip,
  RegisterRule,
  Section,
  SkeletonRows,
} from '@vitae/ui';
import { isNodeType } from '@vitae/core';
import { api } from '../lib/api.js';
import { NewNodeButton } from '../features/forms/NewNodeButton.js';
import {
  BulkDeleteBar,
  BulkDeleteConfirm,
  SelectAllRow,
  SelectCheckbox,
  titlesForSelection,
  useBulkNodeDelete,
  useVisibleSelection,
} from '../features/BulkNodeDelete.js';
import { entityHref, typeLabel } from '../lib/entity-href.js';

interface NodeLite {
  id: string;
  type: string;
  title: string;
  subtitle?: string;
  source: string;
  confidence: number;
  pinned: boolean;
  updated_at: string;
  /** Whose record this is, present when the list is asked for it. */
  owner?: { id: string; title: string; isSelf: boolean } | null;
}

export function Browse() {
  const { type = '' } = useParams();
  const valid = isNodeType(type);
  const bulk = useBulkNodeDelete({ noun: typeLabel(type) || 'record' });
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['nodes', type],
    queryFn: () => api.get<{ nodes: NodeLite[] }>(`/nodes?type=${type}&limit=200&withOwner=true`),
    enabled: valid,
  });

  const nodes = data?.nodes ?? [];
  const visibleIds = useMemo(() => nodes.map((n) => n.id), [nodes]);
  const { allVisibleSelected } = useVisibleSelection(visibleIds, bulk.selected);
  const selectedTitles = useMemo(() => titlesForSelection(nodes, bulk.selected), [nodes, bulk.selected]);

  if (!valid) {
    return (
      <div className="page">
        <PageHeader title="Unknown type" subtitle={`“${type}” is not a Vitae record type.`} />
        <RegisterRule />
        <EmptyState
          glyph="filter"
          title="Nothing to browse"
          hint="Pick a type from Collections, or capture one with ⌘K."
        />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="page">
        <PageHeader title={typeLabel(type)} />
        <RegisterRule />
        <ErrorState
          title={`Couldn’t load ${typeLabel(type)} records`}
          detail={(error as Error | null)?.message}
          onRetry={() => void refetch()}
        />
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="page">
        <PageHeader title={typeLabel(type)} subtitle="Loading…" />
        <RegisterRule />
        <SkeletonRows rows={8} />
      </div>
    );
  }

  const label = typeLabel(type);

  return (
    <div className="page">
      <PageHeader
        title={label}
        subtitle={
          <>
            <Mono className="text-faint">{data.nodes.length}</Mono>{' '}
            {data.nodes.length === 1 ? 'record' : 'records'}
          </>
        }
        actions={
          <>
            <BulkDeleteBar
              selectedCount={bulk.selectedCount}
              onClear={bulk.clear}
              onDelete={() => bulk.setConfirmDelete(true)}
            />
            <NewNodeButton type={type} />
          </>
        }
      />
      <RegisterRule />

      <BulkDeleteConfirm
        open={bulk.confirmDelete}
        onOpenChange={bulk.setConfirmDelete}
        selectedCount={bulk.selectedCount}
        titles={selectedTitles}
        noun={label}
        busy={bulk.deleting}
        onConfirm={() => {
          void bulk.deleteSelected();
        }}
      />

      <Section title={`All ${label}`} meta={nodes.length}>
        {nodes.length === 0 ? (
          <EmptyState
            glyph="document"
            title={`No ${label} records yet`}
            hint="Capture one with ⌘K, or use the button for the full form."
            // Distinct from the header's "New <type>", which is on screen too.
            action={<NewNodeButton type={type} label={`Add your first ${label}`} />}
          />
        ) : (
          <>
            <SelectAllRow
              allSelected={allVisibleSelected}
              onToggle={() => bulk.toggleAll(visibleIds, allVisibleSelected)}
            />
            {nodes.map((n) => {
              const isSelected = bulk.isSelected(n.id);
              return (
                <div key={n.id} className="row" data-selected={isSelected || undefined}>
                  <SelectCheckbox
                    checked={isSelected}
                    label={`Select ${n.title}`}
                    onToggle={() => bulk.toggleOne(n.id)}
                  />
                  <Link to={entityHref(n.type, n.id)} className="people__link">
                    <EntityGlyph type={n.type} size="sm" accent={n.pinned} />
                    <div className="row__main">
                      <div className="row__title">{n.title}</div>
                      {n.subtitle && <div className="row__sub">{n.subtitle}</div>}
                    </div>
                    {n.owner && (
                      <Chip tone={n.owner.isSelf ? 'accent' : 'default'}>
                        {n.owner.isSelf ? 'you' : n.owner.title}
                      </Chip>
                    )}
                    <ProvenanceChip source={n.source} confidence={n.confidence} />
                    <Mono className="u-faint" style={{ fontSize: 'var(--ae-text-xs)' }}>
                      {n.updated_at.slice(0, 10)}
                    </Mono>
                  </Link>
                </div>
              );
            })}
          </>
        )}
      </Section>
    </div>
  );
}
