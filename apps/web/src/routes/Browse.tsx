import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Chip,
  EmptyState,
  EntityGlyph,
  Mono,
  PageHeader,
  ProvenanceChip,
  RegisterRule,
  Section,
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
import { QueryBoundary } from '../components/QueryBoundary.js';
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

/**
 * The generic register for one record type.
 *
 * It used to be three whole-page early returns, one per state, each rebuilding
 * its own `.page`, its own PageHeader and its own rule. Two things followed
 * from that and neither was intentional: the `actions` slot existed only in the
 * resolved branch, so the New button vanished for the entire wait and stayed
 * gone after a failure that had nothing to do with creating a record; and the
 * header re-mounted through three different subtitles, so the page visibly
 * rebuilt itself rather than filling in. The shell is rendered once now and
 * only the list goes through `QueryBoundary`.
 */
export function Browse() {
  const { type = '' } = useParams();
  const valid = isNodeType(type);
  const bulk = useBulkNodeDelete({ noun: typeLabel(type) || 'record' });
  const listQuery = useQuery({
    queryKey: ['nodes', type],
    queryFn: () => api.get<{ nodes: NodeLite[] }>(`/nodes?type=${type}&limit=200&withOwner=true`),
    enabled: valid,
  });

  const nodes = useMemo(() => listQuery.data?.nodes ?? [], [listQuery.data]);
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

  const label = typeLabel(type);

  return (
    <div className="page">
      <PageHeader
        title={label}
        subtitle={
          // Undefined rather than the word "Loading…": a subtitle that counts
          // records has nothing honest to say before the records arrive, and
          // the skeleton below is already saying the same thing.
          listQuery.isPending ? undefined : (
            <>
              <Mono className="text-faint">{nodes.length}</Mono>{' '}
              {nodes.length === 1 ? 'record' : 'records'}
            </>
          )
        }
        actions={
          <>
            {/* Portalled to its own fixed layer, so it is in this slot in
                source only and cannot grow the header when a row is ticked. */}
            <BulkDeleteBar
              selectedCount={bulk.selectedCount}
              onClear={bulk.clear}
              onDelete={() => bulk.setConfirmDelete(true)}
              noun={label}
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

      <Section title={`All ${label}`} meta={listQuery.isSuccess ? nodes.length : undefined}>
        <QueryBoundary
          query={listQuery}
          skeletonRows={8}
          loadingLabel={`Loading ${label} records`}
          errorTitle={`Couldn’t load ${label} records`}
          empty={
            <EmptyState
              glyph="document"
              title={`No ${label} records yet`}
              hint="Capture one with ⌘K, or use the button for the full form."
              // Distinct from the header's "New <type>", which is on screen too.
              action={<NewNodeButton type={type} label={`Add your first ${label}`} />}
            />
          }
        >
          {(data) => (
            <>
              {/* Outside the list on purpose: it is chrome for the register,
                  not one of the records in it, and a `ul` whose children are
                  not all `li` is invalid. */}
              <SelectAllRow
                allSelected={allVisibleSelected}
                onToggle={() => bulk.toggleAll(visibleIds, allVisibleSelected)}
              />
              <ul className="browse-rows">
                {data.nodes.map((n) => {
                  const isSelected = bulk.isSelected(n.id);
                  return (
                    <li key={n.id} className="row" data-selected={isSelected || undefined}>
                      <SelectCheckbox
                        checked={isSelected}
                        label={`Select ${n.title}`}
                        onToggle={() => bulk.toggleOne(n.id)}
                      />
                      <EntityGlyph type={n.type} size="sm" accent={n.pinned} />
                      {/* Only the title and subtitle are inside the anchor. The
                          chips, provenance and date used to be inside it too,
                          so every row's link was announced as one run-on name
                          ending in a date, and the two facts that tell two
                          same-named records apart were unreachable as separate
                          things. */}
                      <Link to={entityHref(n.type, n.id)} className="people__link">
                        <div className="row__main">
                          <div className="row__title">{n.title}</div>
                          {n.subtitle && <div className="row__sub">{n.subtitle}</div>}
                        </div>
                      </Link>
                      {/* Pinned was carried by `accent` alone, which is a soft
                          ink change and nothing else: no word, no shape, and
                          nothing at all for anyone reading the row as text.
                          The accent stays; it just no longer carries the
                          meaning by itself. */}
                      {n.pinned && (
                        <Chip glyph="pin" tone="accent">
                          Pinned
                        </Chip>
                      )}
                      {n.owner && (
                        <Chip glyph="person" tone={n.owner.isSelf ? 'accent' : 'default'}>
                          {n.owner.isSelf ? 'you' : n.owner.title}
                        </Chip>
                      )}
                      <ProvenanceChip source={n.source} confidence={n.confidence} />
                      <Mono className="text-xs text-faint">{n.updated_at.slice(0, 10)}</Mono>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </QueryBoundary>
      </Section>
    </div>
  );
}
