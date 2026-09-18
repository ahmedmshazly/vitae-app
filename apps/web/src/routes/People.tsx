import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Button,
  Chip,
  EmptyState,
  EntityGlyph,
  FilterGroup,
  Field,
  Input,
  Select,
  Mono,
  PageHeader,
  Section,
  StrengthBar,
} from '@vitae/ui';
import { personRelationLabel } from '@vitae/core';
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
import { QueryBoundary } from '../components/QueryBoundary.js';
import { useCanWrite, WRITE_LOCK_HINT } from '../lib/auth.js';

interface PersonItem {
  id: string;
  title: string;
  headline: string | null;
  org: string | null;
  city: string | null;
  topics: string[];
  relation: string | null;
  closeness: number | null;
  cadenceTargetDays: number | null;
  strength: number;
  status: string;
  daysSinceLast: number | null;
  lastInteraction: { kind: string; title: string; occurredAt: string } | null;
  source: string;
  /** Records in the graph that are this person's own. */
  recordCount: number;
  isPlaceholder: boolean;
}

const FAMILY_RELATIONS = new Set(['sibling', 'parent', 'child', 'family', 'partner', 'spouse']);

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'decaying', label: 'To revisit' },
  { key: 'closest', label: 'Closest' },
  { key: 'friend', label: 'Friends' },
  { key: 'colleague', label: 'Colleagues' },
  { key: 'family', label: 'Family' },
] as const;

type FilterKey = (typeof FILTERS)[number]['key'];

function lastContactTime(person: PersonItem, now: number) {
  const recorded = Date.parse(person.lastInteraction?.occurredAt ?? '');
  if (Number.isFinite(recorded)) return recorded;
  return person.daysSinceLast != null && Number.isFinite(person.daysSinceLast)
    ? now - person.daysSinceLast * 86_400_000
    : -Infinity;
}

export function People() {
  const [params, setParams] = useSearchParams();
  const latestParams = useRef(params);
  useEffect(() => {
    latestParams.current = params;
  }, [params]);
  const search = params.get('q') ?? '';
  const sort = ['name', 'recent'].includes(params.get('sort') ?? '')
    ? params.get('sort')!
    : 'strength';
  const [limit, setLimit] = useState(20);
  const canWrite = useCanWrite();
  const requestedFilter = params.get('filter');
  const filter: FilterKey = FILTERS.some((candidate) => candidate.key === requestedFilter)
    ? (requestedFilter as FilterKey)
    : 'all';
  const bulk = useBulkNodeDelete({ noun: 'person', nouns: 'people' });
  const hasSelection = bulk.selectedCount > 0;
  const [bulkHeight, setBulkHeight] = useState(0);
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
  const peopleQuery = useQuery({
    queryKey: ['people'],
    queryFn: () => api.get<{ people: PersonItem[] }>('/people'),
  });
  const data = peopleQuery.data;

  const people = useMemo(() => {
    if (!data) return [] as PersonItem[];
    let list = data.people;
    if (filter === 'decaying') {
      list = list.filter(
        (p) =>
          p.status === 'decaying' ||
          p.status === 'dormant' ||
          (p.cadenceTargetDays != null &&
            p.daysSinceLast != null &&
            p.daysSinceLast > p.cadenceTargetDays),
      );
    } else if (filter === 'closest') {
      list = list.filter((p) => (p.closeness ?? 0) >= 4);
    } else if (filter === 'friend') {
      list = list.filter((p) => p.relation === 'friend');
    } else if (filter === 'colleague') {
      list = list.filter((p) => p.relation === 'colleague');
    } else if (filter === 'family') {
      list = list.filter((p) => p.relation != null && FAMILY_RELATIONS.has(p.relation));
    }
    const query = search.trim().toLocaleLowerCase();
    const now = peopleQuery.dataUpdatedAt;
    return list
      .filter((p) =>
        [p.title, p.headline, p.org, p.city, ...p.topics]
          .filter(Boolean)
          .join(' ')
          .toLocaleLowerCase()
          .includes(query),
      )
      .sort((a, b) => {
        if (sort === 'name') return a.title.localeCompare(b.title);
        if (sort === 'recent')
          return (
            lastContactTime(b, now) - lastContactTime(a, now) || a.title.localeCompare(b.title)
          );
        return (
          (Number.isFinite(b.strength) ? b.strength : -1) -
            (Number.isFinite(a.strength) ? a.strength : -1) || a.title.localeCompare(b.title)
        );
      });
  }, [data, filter, search, sort, peopleQuery.dataUpdatedAt]);

  const visible = people.slice(0, limit);
  const visibleIds = visible.map((p) => p.id);
  const hiddenSelected = [...bulk.selected].filter((id) => !visibleIds.includes(id)).length;
  const { allVisibleSelected } = useVisibleSelection(visibleIds, bulk.selected);
  const selectedTitles = useMemo(
    () => titlesForSelection(data?.people ?? [], bulk.selected),
    [data, bulk.selected],
  );

  const total = data?.people.length ?? 0;
  const filtered = filter !== 'all' || Boolean(search.trim());

  function setFilter(key: string, value: string) {
    setLimit(20);
    const next = new URLSearchParams(latestParams.current);
    if (!value || (key === 'filter' && value === 'all') || (key === 'sort' && value === 'strength'))
      next.delete(key);
    else next.set(key, value);
    latestParams.current = next;
    setParams(next, { replace: key === 'q' });
  }
  function clearFilters() {
    const next = new URLSearchParams(latestParams.current);
    next.delete('q');
    next.delete('filter');
    latestParams.current = next;
    setLimit(20);
    setParams(next);
  }

  return (
    <div
      className="page people-directory"
      style={{ paddingBottom: hasSelection ? bulkHeight + 48 : undefined }}
    >
      <PageHeader
        title="People"
        subtitle={
          data ? (
            <>
              <Mono className="text-faint">{total}</Mono> {total === 1 ? 'person' : 'people'}
            </>
          ) : (
            'Loading...'
          )
        }
        actions={
          <>
            <BulkDeleteBar
              selectedCount={bulk.selectedCount}
              onClear={bulk.clear}
              onDelete={() => bulk.setConfirmDelete(true)}
              noun="person"
              nouns="people"
              busy={bulk.deleting}
              actionLabel="Move to trash"
            />
            {canWrite && <NewNodeButton type="person" label="Add person" />}
          </>
        }
      />
      {!canWrite && <p role="status">{WRITE_LOCK_HINT}</p>}
      <div className="people-directory__tools">
        <Field label="Search people" htmlFor="people-search">
          <Input
            id="people-search"
            type="search"
            value={search}
            placeholder="Name, organization, city or topic…"
            onChange={(event) => setFilter('q', event.target.value)}
          />
        </Field>
        <Field label="Sort by" htmlFor="people-sort">
          <Select
            id="people-sort"
            label="Sort by"
            clearable={false}
            value={sort}
            onChange={(value) => setFilter('sort', value ?? 'strength')}
            options={[
              { value: 'strength', label: 'Tie strength' },
              { value: 'name', label: 'Name A–Z' },
              { value: 'recent', label: 'Most recent contact' },
            ]}
          />
        </Field>
        <Button
          disabled={peopleQuery.isFetching || bulk.deleting}
          onClick={() => void peopleQuery.refetch()}
        >
          {peopleQuery.isFetching ? 'Refreshing…' : 'Refresh people'}
        </Button>
      </div>
      <FilterGroup
        label="Filter people"
        options={FILTERS}
        value={filter}
        onChange={(value) => setFilter('filter', value)}
      />
      <p className="people-directory__explanation">
        {filter === 'decaying'
          ? 'Relationships with quiet activity or contact past your chosen cadence.'
          : filter === 'closest'
            ? 'People with a saved closeness of 4 or 5.'
            : 'Tie strength is calculated from saved relationship details and interactions.'}
      </p>
      {hiddenSelected > 0 && (
        <p role="status" className="people-directory__selection">
          {hiddenSelected} selected {hiddenSelected === 1 ? 'person is' : 'people are'} not shown.
          Moving to Trash includes this selection.{' '}
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
        noun="person"
        nouns="people"
        busy={bulk.deleting}
        onConfirm={() => {
          void bulk.deleteSelected();
        }}
      />

      <QueryBoundary
        query={peopleQuery}
        loadingLabel="Loading"
        skeletonRows={8}
        errorTitle="Couldn't load your people"
        filtered={filtered}
        isEmpty={() => people.length === 0}
        isSourceEmpty={(resolved) => resolved.people.length === 0}
        empty={
          <Section title="Everyone" meta={0}>
            <EmptyState
              glyph="person"
              title="No one here yet"
              hint="Add someone you know, then keep their contact details, conversations and shared context together."
              action={
                canWrite ? <NewNodeButton type="person" label="Add your first person" /> : undefined
              }
            />
          </Section>
        }
        emptyFiltered={
          <Section title={FILTERS.find((f) => f.key === filter)!.label} meta={0}>
            <EmptyState
              glyph="filter"
              title={
                search.trim()
                  ? 'No people match your search'
                  : `No one matches ${FILTERS.find((f) => f.key === filter)!.label.toLowerCase()}`
              }
              hint="Try another name or clear your search and relationship filter."
              action={
                <Button size="sm" onClick={clearFilters}>
                  Show everyone
                </Button>
              }
            />
          </Section>
        }
      >
        {() => (
          <Section
            title={filtered ? FILTERS.find((f) => f.key === filter)!.label : 'Everyone'}
            meta={people.length}
          >
            <>
              <div className="people-directory__count">
                <span>
                  {visible.length} of {people.length} {filtered ? 'matching people' : 'people'}{' '}
                  shown
                </span>
                {filtered && (
                  <Button size="sm" onClick={clearFilters}>
                    Clear filters
                  </Button>
                )}
              </div>
              <SelectAllRow
                allSelected={allVisibleSelected}
                onToggle={() => bulk.toggleAll(visibleIds, allVisibleSelected)}
                disabled={bulk.deleting}
              />
              <ul className="people-directory__list" aria-label="People">
                {visible.map((p) => {
                  const overBy =
                    p.cadenceTargetDays != null &&
                    p.cadenceTargetDays > 0 &&
                    p.daysSinceLast != null
                      ? Math.round(p.daysSinceLast - p.cadenceTargetDays)
                      : null;
                  const isSelected = bulk.isSelected(p.id);
                  const relationLabel = personRelationLabel(p.relation);
                  return (
                    <li
                      key={p.id}
                      className="people-directory__row"
                      data-selected={isSelected || undefined}
                    >
                      <SelectCheckbox
                        checked={isSelected}
                        label={`Select ${p.title}`}
                        onToggle={() => bulk.toggleOne(p.id)}
                        disabled={bulk.deleting}
                      />
                      <Link to={entityHref('person', p.id)} className="people-directory__link">
                        <EntityGlyph type="person" />
                        <div className="row__main">
                          <div className="people-directory__name">{p.title}</div>
                          <div className="people-directory__sub">
                            {[relationLabel, p.headline, p.org, p.city]
                              .filter(Boolean)
                              .join(' · ') || 'No profile details yet'}
                          </div>
                          <div className="chips">
                            {p.isPlaceholder && <Chip tone="accent">unattributed</Chip>}
                            {p.recordCount > 0 && (
                              <Chip title={`${p.recordCount} records belong to ${p.title}`}>
                                {p.recordCount} {p.recordCount === 1 ? 'record' : 'records'}
                              </Chip>
                            )}
                            {p.topics.slice(0, 2).map((t) => (
                              <Chip key={t}>{t}</Chip>
                            ))}
                            {p.topics.length > 2 && (
                              <span className="people-directory__sub">
                                +{p.topics.length - 2} {p.topics.length === 3 ? 'topic' : 'topics'}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="people-directory__contact">
                          <span>
                            {p.daysSinceLast == null
                              ? 'No contact logged'
                              : p.daysSinceLast <= 0
                                ? 'Contact today'
                                : `Contact ${Math.floor(p.daysSinceLast)} ${Math.floor(p.daysSinceLast) === 1 ? 'day' : 'days'} ago`}
                          </span>
                          <span className="people-directory__sub">
                            {p.cadenceTargetDays == null || p.cadenceTargetDays <= 0
                              ? 'No cadence set'
                              : `Every ${p.cadenceTargetDays} days${overBy == null ? ' · Awaiting first contact' : overBy > 0 ? ` · ${overBy} days past cadence` : ' · Within cadence'}`}
                          </span>
                          {Number.isFinite(p.strength) ? (
                            <StrengthBar
                              value={Math.max(0, Math.min(1, p.strength))}
                              label="Tie strength"
                            />
                          ) : (
                            <span className="people-directory__sub">Tie strength not measured</span>
                          )}
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
              {visible.length < people.length && (
                <Button onClick={() => setLimit((value) => value + 20)}>Show more people</Button>
              )}
            </>
          </Section>
        )}
      </QueryBoundary>
    </div>
  );
}
