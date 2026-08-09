import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Chip,
  EmptyState,
  EntityGlyph,
  ErrorState,
  Mono,
  PageHeader,
  RegisterRule,
  Section,
  SkeletonRows,
  StrengthBar,
} from '@vitae/ui';
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
import { entityHref } from '../lib/entity-href.js';

interface OrgItem {
  id: string;
  title: string;
  kind: string | null;
  domain: string | null;
  city: string | null;
  peopleCount: number;
  affinity: number;
  openRoles: number;
}

export function Orgs() {
  const bulk = useBulkNodeDelete({ noun: 'organization' });
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['orgs'],
    queryFn: () => api.get<{ orgs: OrgItem[] }>('/orgs'),
  });

  const orgs = data?.orgs ?? [];
  const visibleIds = useMemo(() => orgs.map((o) => o.id), [orgs]);
  const { allVisibleSelected } = useVisibleSelection(visibleIds, bulk.selected);
  const selectedTitles = useMemo(() => titlesForSelection(orgs, bulk.selected), [orgs, bulk.selected]);

  if (isError) {
    return (
      <div className="page">
        <PageHeader title="Organizations" />
        <RegisterRule />
        <ErrorState
          title="Couldn’t load your organizations"
          detail={(error as Error | null)?.message}
          onRetry={() => void refetch()}
        />
      </div>
    );
  }
  if (isLoading || !data) {
    return (
      <div className="page">
        <PageHeader title="Organizations" subtitle="Loading…" />
        <RegisterRule />
        <SkeletonRows rows={8} />
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader
        title="Organizations"
        subtitle={
          <>
            <Mono className="text-faint">{orgs.length}</Mono>{' '}
            {orgs.length === 1 ? 'organization' : 'organizations'} · sorted by affinity
          </>
        }
        actions={
          <>
            <BulkDeleteBar
              selectedCount={bulk.selectedCount}
              onClear={bulk.clear}
              onDelete={() => bulk.setConfirmDelete(true)}
            />
            <NewNodeButton type="organization" />
          </>
        }
      />
      <RegisterRule />

      <BulkDeleteConfirm
        open={bulk.confirmDelete}
        onOpenChange={bulk.setConfirmDelete}
        selectedCount={bulk.selectedCount}
        titles={selectedTitles}
        noun="organization"
        busy={bulk.deleting}
        onConfirm={() => {
          void bulk.deleteSelected();
        }}
      />

      <Section title="All organizations" meta={orgs.length}>
        {orgs.length === 0 ? (
          <EmptyState
            glyph="org"
            title="No organizations yet"
            hint="Companies, universities, and communities you're tied to. They anchor roles, applications, and warm intros. Capture with ⌘K (“o Nile Robotics #robotics”) or use the button."
            // Distinct from the header's "New organization" - both are on
            // screen at once when the list is empty.
            action={<NewNodeButton type="organization" label="Add your first organization" />}
          />
        ) : (
          <>
            <SelectAllRow
              allSelected={allVisibleSelected}
              onToggle={() => bulk.toggleAll(visibleIds, allVisibleSelected)}
            />
            {orgs.map((o) => {
              const isSelected = bulk.isSelected(o.id);
              return (
                <div key={o.id} className="row" data-selected={isSelected || undefined}>
                  <SelectCheckbox
                    checked={isSelected}
                    label={`Select ${o.title}`}
                    onToggle={() => bulk.toggleOne(o.id)}
                  />
                  <Link to={entityHref('organization', o.id)} className="people__link">
                    <EntityGlyph type="organization" />
                    <div className="row__main">
                      <div className="row__title">{o.title}</div>
                      <div className="row__sub">
                        {[o.kind, o.domain, o.city].filter(Boolean).join(' · ') || '—'}
                      </div>
                    </div>
                    {o.openRoles > 0 && (
                      <Chip tone="accent" mono>
                        {o.openRoles} open role{o.openRoles > 1 ? 's' : ''}
                      </Chip>
                    )}
                    <Chip mono glyph="person">
                      {o.peopleCount}
                    </Chip>
                    <StrengthBar value={o.affinity} label="affinity" />
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
