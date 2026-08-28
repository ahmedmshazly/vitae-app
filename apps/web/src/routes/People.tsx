import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Button,
  Chip,
  EmptyState,
  EntityGlyph,
  FilterGroup,
  Mono,
  PageHeader,
  RegisterRule,
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
  { key: 'decaying', label: 'Decaying' },
  { key: 'closest', label: 'Closest' },
  { key: 'friend', label: 'Friends' },
  { key: 'colleague', label: 'Colleagues' },
  { key: 'family', label: 'Family' },
] as const;

type FilterKey = (typeof FILTERS)[number]['key'];

export function People() {
  const [filter, setFilter] = useState<FilterKey>('all');
  const bulk = useBulkNodeDelete({ noun: 'person', nouns: 'people' });
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
    return list;
  }, [data, filter]);

  const visibleIds = useMemo(() => people.map((p) => p.id), [people]);
  const { allVisibleSelected } = useVisibleSelection(visibleIds, bulk.selected);
  const selectedTitles = useMemo(
    () => titlesForSelection(data?.people ?? [], bulk.selected),
    [data, bulk.selected],
  );

  const total = data?.people.length ?? 0;
  const filtered = filter !== 'all';

  return (
    <div className="page">
      <PageHeader
        title="People"
        subtitle={
          data ? (
            <>
              <Mono className="text-faint">{total}</Mono> {total === 1 ? 'person' : 'people'}
              {filtered && (
                <>
                  {' · '}
                  <Mono className="text-faint">{people.length}</Mono> shown
                </>
              )}
              {' · sorted by tie strength'}
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
            />
            <NewNodeButton type="person" />
          </>
        }
      />
      <RegisterRule />

      <div className="mb-4">
        <FilterGroup label="Filter people" options={FILTERS} value={filter} onChange={setFilter} />
      </div>

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
              hint="Add people you know - Vitae tracks how you're connected and nudges you to reconnect. Capture fast with ⌘K ('p Lina Farouk @@DevFest #ml') or use the button."
              action={<NewNodeButton type="person" label="Add your first person" />}
            />
          </Section>
        }
        emptyFiltered={
          <Section title={FILTERS.find((f) => f.key === filter)!.label} meta={0}>
            <EmptyState
              glyph="filter"
              title={`No one matches ${FILTERS.find((f) => f.key === filter)!.label.toLowerCase()}`}
              hint={`You have ${total} ${total === 1 ? 'person' : 'people'}; none of them fit this filter.`}
              action={
                <Button size="sm" onClick={() => setFilter('all')}>
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
              <SelectAllRow
                allSelected={allVisibleSelected}
                onToggle={() => bulk.toggleAll(visibleIds, allVisibleSelected)}
              />
              {people.map((p) => {
                const overBy =
                  p.cadenceTargetDays != null && p.daysSinceLast != null
                    ? Math.round(p.daysSinceLast - p.cadenceTargetDays)
                    : null;
                const isSelected = bulk.isSelected(p.id);
                const relationLabel = personRelationLabel(p.relation);
                return (
                  <div key={p.id} className="row" data-selected={isSelected || undefined}>
                    <SelectCheckbox
                      checked={isSelected}
                      label={`Select ${p.title}`}
                      onToggle={() => bulk.toggleOne(p.id)}
                    />
                    <Link to={entityHref('person', p.id)} className="people__link">
                      <EntityGlyph type="person" />
                      <div className="row__main">
                        <div className="row__title">{p.title}</div>
                        <div className="row__sub">
                          {[relationLabel, p.headline, p.org, p.city].filter(Boolean).join(' · ') ||
                            '—'}
                        </div>
                      </div>
                      <div className="chips" style={{ flex: 'none' }}>
                        {p.isPlaceholder && <Chip tone="accent">unattributed</Chip>}
                        {p.recordCount > 0 && (
                          <Chip title={`${p.recordCount} records belong to ${p.title}`}>
                            {p.recordCount} records
                          </Chip>
                        )}
                        {p.topics.slice(0, 2).map((t) => (
                          <Chip key={t}>{t}</Chip>
                        ))}
                      </div>
                      <StrengthBar value={p.strength} label="tie strength" />
                      {/* Cadence carries the word as well as the tone. */}
                      <Mono
                        className={
                          overBy == null
                            ? 'w-19 text-right text-xs text-muted'
                            : overBy > 0
                              ? 'w-19 text-right text-xs text-warning'
                              : 'w-19 text-right text-xs text-success'
                        }
                      >
                        {overBy == null
                          ? 'no cadence'
                          : overBy > 0
                            ? `${overBy}d over`
                            : 'on track'}
                      </Mono>
                    </Link>
                  </div>
                );
              })}
            </>
          </Section>
        )}
      </QueryBoundary>
    </div>
  );
}
