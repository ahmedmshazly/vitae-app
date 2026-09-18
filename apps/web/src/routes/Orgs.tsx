import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Chip,
  Button,
  Field,
  Input,
  Select,
  EmptyState,
  EntityGlyph,
  Mono,
  PageHeader,
  Section,
  StrengthBar,
} from '@vitae/ui';
import { QueryBoundary } from '../components/QueryBoundary.js';
import { api } from '../lib/api.js';
import { useCanWrite, WRITE_LOCK_HINT } from '../lib/auth.js';
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

const SORTS = [
  { value: 'affinity', label: 'Network affinity' },
  { value: 'name', label: 'Name A–Z' },
  { value: 'people', label: 'Most known people' },
  { value: 'roles', label: 'Most open roles' },
];
const finiteScore = (value: number) => (Number.isFinite(value) ? value : -1);

export function Orgs() {
  const [params, setParams] = useSearchParams();
  const search = params.get('q') ?? '';
  const sort = SORTS.some((option) => option.value === params.get('sort'))
    ? params.get('sort')!
    : 'affinity';
  const viewKey = JSON.stringify([search, sort]);
  const [disclosure, setDisclosure] = useState({ key: viewKey, count: 20 });
  const limit = disclosure.key === viewKey ? disclosure.count : 20;
  const canWrite = useCanWrite();
  const latestParams = useRef(params);
  useEffect(() => {
    latestParams.current = params;
  }, [params]);
  const bulk = useBulkNodeDelete({ noun: 'organization' });
  const [bulkHeight, setBulkHeight] = useState(0);
  const hasSelection = bulk.selectedCount > 0;
  useLayoutEffect(() => {
    if (!hasSelection) return;
    const bar = document.querySelector('[data-bulkbar-layer] .bulkbar');
    if (!bar) return;
    const measure = () => setBulkHeight(Math.ceil(bar.getBoundingClientRect().height));
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(bar);
    return () => observer.disconnect();
  }, [hasSelection]);
  const orgsQuery = useQuery({
    queryKey: ['orgs'],
    queryFn: async () => {
      const result = await api.get<{ orgs: OrgItem[] }>('/orgs');
      if (!Array.isArray(result.orgs))
        throw new Error('The organization list was not returned. Try again.');
      return result;
    },
  });

  const orgs = useMemo(() => orgsQuery.data?.orgs ?? [], [orgsQuery.data?.orgs]);
  const matching = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return orgs
      .filter((org) =>
        [org.title, org.kind, org.domain, org.city]
          .filter(Boolean)
          .join(' ')
          .toLocaleLowerCase()
          .includes(query),
      )
      .sort((a, b) => {
        if (sort === 'name') return a.title.localeCompare(b.title);
        const metric =
          sort === 'people' ? 'peopleCount' : sort === 'roles' ? 'openRoles' : 'affinity';
        return finiteScore(b[metric]) - finiteScore(a[metric]) || a.title.localeCompare(b.title);
      });
  }, [orgs, search, sort]);
  const visible = matching.slice(0, limit);
  const visibleIds = visible.map((org) => org.id);
  const hiddenSelected = [...bulk.selected].filter((id) => !visibleIds.includes(id)).length;
  const { allVisibleSelected } = useVisibleSelection(visibleIds, bulk.selected);
  const selectedTitles = useMemo(
    () => titlesForSelection(orgs, bulk.selected),
    [orgs, bulk.selected],
  );

  function updateView(key: 'q' | 'sort', value: string) {
    const next = new URLSearchParams(latestParams.current);
    if (!value || (key === 'sort' && value === 'affinity')) next.delete(key);
    else next.set(key, value);
    latestParams.current = next;
    setParams(next, { replace: key === 'q' });
  }

  return (
    <div
      className="page people-directory organizations-directory"
      style={{ paddingBottom: hasSelection ? bulkHeight + 48 : undefined }}
    >
      <PageHeader
        title="Organizations"
        subtitle={
          <>
            {orgsQuery.data ? (
              <>
                <Mono className="text-faint">{orgs.length}</Mono>{' '}
                {orgs.length === 1 ? 'organization' : 'organizations'} in your network
              </>
            ) : (
              'Companies, communities and institutions in your network'
            )}
          </>
        }
        actions={
          <>
            <BulkDeleteBar
              selectedCount={bulk.selectedCount}
              onClear={bulk.clear}
              onDelete={() => bulk.setConfirmDelete(true)}
              noun="organization"
              busy={bulk.deleting}
              actionLabel="Move to trash"
            />
            {canWrite && <NewNodeButton type="organization" label="Add organization" />}
          </>
        }
      />
      {!canWrite && <p role="status">{WRITE_LOCK_HINT}</p>}
      <div className="people-directory__tools">
        <Field label="Search organizations" htmlFor="org-search">
          <Input
            id="org-search"
            type="search"
            value={search}
            placeholder="Name, domain, city or kind…"
            onChange={(event) => updateView('q', event.target.value)}
          />
        </Field>
        <Field label="Sort by" htmlFor="org-sort">
          <Select
            id="org-sort"
            label="Sort by"
            clearable={false}
            value={sort}
            options={SORTS}
            onChange={(value) => updateView('sort', value ?? 'affinity')}
          />
        </Field>
        <Button
          aria-label={orgsQuery.isFetching ? 'Refreshing organizations' : 'Refresh organizations'}
          disabled={orgsQuery.isFetching || bulk.deleting}
          onClick={() => void orgsQuery.refetch()}
        >
          {orgsQuery.isFetching ? 'Refreshing…' : 'Refresh'}
        </Button>
      </div>
      <p className="people-directory__explanation">
        Network affinity reflects the strength of your ties to people here. Open roles are roles
        recorded in Vitae, not a live job feed.
      </p>
      {hiddenSelected > 0 && (
        <p role="status" className="people-directory__selection">
          {hiddenSelected} selected {hiddenSelected === 1 ? 'organization is' : 'organizations are'}{' '}
          not shown. Moving to Trash includes this selection.{' '}
          <Button size="sm" disabled={bulk.deleting} onClick={bulk.clear}>
            Clear selection
          </Button>
        </p>
      )}

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

      <QueryBoundary
        query={orgsQuery}
        loadingLabel="Loading organizations"
        skeletonRows={8}
        errorTitle="Couldn't load your organizations"
        staleErrorTitle="Organizations could not be refreshed"
        filtered={Boolean(search.trim())}
        isEmpty={() => matching.length === 0}
        isSourceEmpty={(resolved) => resolved.orgs.length === 0}
        empty={
          <Section title="All organizations" meta={0}>
            <EmptyState
              glyph="org"
              title="No organizations yet"
              hint="Add a company, university or community to connect its people, roles and applications."
              // Distinct from the header's "New organization" - both are on
              // screen at once when the list is empty.
              action={
                canWrite ? (
                  <NewNodeButton type="organization" label="Add your first organization" />
                ) : undefined
              }
            />
          </Section>
        }
        emptyFiltered={
          <Section title="Search results" meta={0}>
            <EmptyState
              glyph="filter"
              title="No organizations match your search"
              hint="Try another name, domain or city, or clear the search to see your whole network."
              action={<Button onClick={() => updateView('q', '')}>Show all organizations</Button>}
            />
          </Section>
        }
      >
        {() => (
          <Section
            title={search.trim() ? 'Search results' : 'All organizations'}
            meta={matching.length}
          >
            <>
              <div className="people-directory__count">
                <span>
                  {visible.length} of {matching.length} {search.trim() ? 'matching ' : ''}
                  organizations shown
                </span>
                {search.trim() && (
                  <Button size="sm" onClick={() => updateView('q', '')}>
                    Clear search
                  </Button>
                )}
              </div>
              <SelectAllRow
                allSelected={allVisibleSelected}
                disabled={bulk.deleting || !canWrite}
                onToggle={() => bulk.toggleAll(visibleIds, allVisibleSelected)}
              />
              <ul className="people-directory__list" aria-label="Organizations">
                {visible.map((o) => {
                  const isSelected = bulk.isSelected(o.id);
                  return (
                    <li
                      key={o.id}
                      className="people-directory__row"
                      data-selected={isSelected || undefined}
                    >
                      <SelectCheckbox
                        checked={isSelected}
                        label={`Select ${o.title}`}
                        onToggle={() => bulk.toggleOne(o.id)}
                        disabled={bulk.deleting || !canWrite}
                      />
                      <Link
                        to={entityHref('organization', o.id)}
                        className="people-directory__link"
                      >
                        <EntityGlyph type="organization" />
                        <div className="row__main">
                          <div className="people-directory__name">{o.title}</div>
                          <div className="people-directory__sub">
                            {[o.kind, o.domain, o.city].filter(Boolean).join(' · ') ||
                              'No organization details yet'}
                          </div>
                          {o.openRoles > 0 && (
                            <div className="chips">
                              <Chip mono>
                                {o.openRoles} open role{o.openRoles > 1 ? 's' : ''}
                              </Chip>
                            </div>
                          )}
                        </div>
                        <div className="people-directory__contact">
                          <span>
                            {Number.isFinite(o.peopleCount)
                              ? `${o.peopleCount} known ${o.peopleCount === 1 ? 'person' : 'people'}`
                              : 'People count unavailable'}
                          </span>
                          {Number.isFinite(o.affinity) ? (
                            <StrengthBar
                              value={Math.max(0, Math.min(1, o.affinity))}
                              label="Network affinity"
                            />
                          ) : (
                            <span>Affinity not measured</span>
                          )}
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
              {visible.length < matching.length && (
                <Button onClick={() => setDisclosure({ key: viewKey, count: limit + 20 })}>
                  Show more organizations
                </Button>
              )}
            </>
          </Section>
        )}
      </QueryBoundary>
    </div>
  );
}
