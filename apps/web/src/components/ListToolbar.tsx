/**
 * One filter bar, for every list in the app.
 *
 * The app currently ships four of these. `FilterGroup` pills on People,
 * SearchResults and Composer; a `.resume-toolbar.card` grid of an Input and two
 * Selects on Atoms and Outputs; an `.hstack` of an Input and a Select on
 * Letters; a `.coll__bar` of removable tokens on Collections. Four screens
 * (Orgs, Browse, Trash, Repositories) have no filter bar at all, and the
 * Collections query input has no `<label>` and no `aria-label`, while the
 * near-identical SearchResults one has both.
 *
 * This is the one shape, and it holds no state: every control reads and writes
 * `useListParams`, so the whole view is in the URL and a filtered list is a
 * link (lib/list-params.ts). What the toolbar owns is the part that kept being
 * skipped:
 *
 * - the query input is a labelled control inside a `search` landmark, so it
 *   can be jumped to and is not a stray input in the page flow;
 * - the result count is a live region, because it changes with nothing moving
 *   focus, so rendering it is not the same as saying it;
 * - "filtered" is a glyph and a word, never a colour or a class
 *   (IDENTITY.md non-negotiable 6);
 * - the sort direction states which direction it is currently in, in words,
 *   rather than leaving it to a rotated chevron.
 */
import { useId, type ReactNode } from 'react';
import { Button, Chip, FilterGroup, Glyph, Inline, Input, Mono, Select, Spread } from '@vitae/ui';
import type {
  ListParams,
  ListParamSchema,
  ListValues,
  SortValue,
  TextParamName,
} from '../lib/list-params.js';

export interface ListToolbarFacet<S extends ListParamSchema> {
  /** The declared facet this control drives. */
  name: keyof S & string;
  /** Names the control for assistive tech: "Kind", "State". */
  label: string;
  /**
   * Pills list every value including the default ("All", "Pinned", ...).
   * A Select lists only the narrowing values: its default is the placeholder,
   * and Select's own "Clear" item is the way back to it.
   */
  options: ReadonlyArray<{ value: string; label: string }>;
  /** Default: pills for a short set, a Select for a long one. */
  as?: 'pills' | 'select';
  /** Select only. What the trigger reads when the facet is at its default. */
  placeholder?: string;
}

export interface ListToolbarSort<S extends ListParamSchema> {
  name: keyof S & string;
  /** Names the key control. Default "Sort by". */
  label?: string;
  options: ReadonlyArray<{ value: string; label: string }>;
}

export interface ListToolbarProps<S extends ListParamSchema> {
  /** The hook's return value. The toolbar adds no state of its own. */
  list: ListParams<S>;
  /** Names the search landmark, e.g. "Filter atoms". Required: an unnamed landmark is one a screen reader cannot tell from the next one. */
  label: string;
  /** Which declared text param the query box drives. Defaults to `q` when the schema has one. */
  queryName?: TextParamName<S>;
  /** The query input's label. Defaults to `label`. Visually hidden, still a real `<label for>`. */
  queryLabel?: string;
  placeholder?: string;
  facets?: ReadonlyArray<ListToolbarFacet<S>>;
  sort?: ListToolbarSort<S>;
  /** Rows after filtering. Omit while the list is still loading. */
  count?: number;
  /** Rows before this toolbar's filters, when the screen knows both numbers. */
  total?: number;
  /** What is being counted. "atom" gives "1 atom" / "12 atoms". */
  noun?: string;
  /** For a noun that does not take a plain "s". */
  nounPlural?: string;
  /** Extra controls, e.g. a view switch, kept on the same line as the count. */
  children?: ReactNode;
}

/** "12 atoms", "1 atom", "3 of 12 atoms". */
export function countLabel(
  count: number,
  total: number | undefined,
  noun: string,
  nounPlural?: string,
): string {
  const plural = nounPlural ?? `${noun}s`;
  const word = (n: number) => (n === 1 ? noun : plural);
  return total != null && total !== count
    ? `${count} of ${total} ${word(total)}`
    : `${count} ${word(count)}`;
}

export function ListToolbar<S extends ListParamSchema>({
  list,
  label,
  queryName,
  queryLabel,
  placeholder = 'Search...',
  facets,
  sort,
  count,
  total,
  noun = 'result',
  nounPlural,
  children,
}: ListToolbarProps<S>) {
  const uid = useId();
  const queryId = `list-toolbar-q-${uid}`;

  // `q` by convention, but only if the schema really declares it as text: a
  // toolbar pointed at a facet would render an input that writes a value the
  // facet then throws away.
  const fallback = list.schema['q']?.kind === 'text' ? ('q' as TextParamName<S>) : undefined;
  const queryKey = queryName ?? fallback;

  const sortSpec = sort ? list.schema[sort.name] : undefined;
  const sortValue =
    sort && sortSpec?.kind === 'sort'
      ? (list.values[sort.name] as SortValue)
      : undefined;
  const dirWord = sortValue?.dir === 'asc' ? 'ascending' : 'descending';
  const otherWord = sortValue?.dir === 'asc' ? 'descending' : 'ascending';

  return (
    <Spread role="search" aria-label={label} gap={3} align="center" className="flex-wrap">
      <Inline gap={2} wrap align="center" className="flex-1">
        {queryKey && (
          <div className="min-w-[200px] flex-1">
            {/* A real label, not a placeholder. A placeholder is gone the
                moment there is a value in the field, which is exactly when
                somebody arriving on the screen needs to know what the field
                narrows. */}
            <label htmlFor={queryId} className="u-visually-hidden">
              {queryLabel ?? label}
            </label>
            <Input
              id={queryId}
              type="search"
              value={list.drafts[queryKey] ?? ''}
              placeholder={placeholder}
              onChange={(event) =>
                list.set(queryKey, event.target.value as ListValues<S>[typeof queryKey])
              }
              onKeyDown={(event) => {
                // Enter means "now", not "in 250ms". Nothing is submitted:
                // the URL already has the query, and a form here would reload
                // the page on browsers that treat a lone input that way.
                if (event.key !== 'Enter') return;
                event.preventDefault();
                list.commit(queryKey);
              }}
            />
          </div>
        )}

        {facets?.map((facet) => {
          const spec = list.schema[facet.name];
          if (spec?.kind !== 'facet') return null;
          const value = list.values[facet.name] as string;
          const as = facet.as ?? (facet.options.length <= 4 ? 'pills' : 'select');
          if (as === 'pills') {
            return (
              <FilterGroup
                key={facet.name}
                label={facet.label}
                value={value}
                options={facet.options.map((o) => ({ key: o.value, label: o.label }))}
                onChange={(key) => list.set(facet.name, key as ListValues<S>[typeof facet.name])}
              />
            );
          }
          // Radix puts the label on the trigger as `aria-label`, and an
          // aria-label overrides the element's own text, so the chosen value
          // would be dropped from the accessible name: the control would read
          // "State" whether or not a state is picked, leaving which filter is
          // active as something only a sighted user can tell (IDENTITY.md
          // non-negotiable 6). The pills carry it in `aria-pressed`; a Select
          // has to carry it in its name.
          const shown =
            value === spec.default
              ? (facet.placeholder ?? facet.label)
              : (facet.options.find((option) => option.value === value)?.label ?? value);
          return (
            <Select
              key={facet.name}
              label={`${facet.label}: ${shown}`}
              placeholder={facet.placeholder ?? facet.label}
              // The default is the placeholder, never an option: callers list
              // only the narrowing values, so handing Radix the default would
              // be a value with no matching item and the trigger would render
              // neither a label nor the placeholder.
              value={value === spec.default ? undefined : value}
              options={facet.options as Array<{ value: string; label: string }>}
              onChange={(next) =>
                list.set(
                  facet.name,
                  (next ?? spec.default) as ListValues<S>[typeof facet.name],
                )
              }
            />
          );
        })}

        {sort && sortValue && (
          <Inline gap={1} align="center">
            <Select
              // Same reason as the facet above: the name has to carry the key,
              // because `aria-label` on the trigger hides the one place the
              // chosen key is written down.
              label={`${sort.label ?? 'Sort by'}: ${
                sort.options.find((option) => option.value === sortValue.key)?.label ?? sortValue.key
              }`}
              clearable={false}
              value={sortValue.key}
              options={sort.options as Array<{ value: string; label: string }>}
              onChange={(next) =>
                list.set(sort.name, {
                  key: next ?? sortValue.key,
                  dir: sortValue.dir,
                } as ListValues<S>[typeof sort.name])
              }
            />
            <Button
              size="sm"
              // The visible word is the state; the accessible name adds what
              // pressing it does, which a rotated chevron on its own never
              // said to anybody.
              aria-label={`Sort direction: ${dirWord}. Activate to sort ${otherWord}.`}
              onClick={() =>
                list.set(sort.name, {
                  key: sortValue.key,
                  dir: sortValue.dir === 'asc' ? 'desc' : 'asc',
                } as ListValues<S>[typeof sort.name])
              }
            >
              <Glyph
                name="chevron-down"
                size={14}
                style={sortValue.dir === 'asc' ? { transform: 'rotate(180deg)' } : undefined}
              />
              {sortValue.dir === 'asc' ? 'Ascending' : 'Descending'}
            </Button>
          </Inline>
        )}
      </Inline>

      <Inline gap={2} wrap align="center">
        {/* Always in the tree, empty or not: a live region that appears at the
            same moment as its first message is a region assistive tech was not
            watching yet, so the first count would go unsaid. */}
        <span role="status" aria-live="polite">
          {count == null ? null : list.isDefault ? (
            <Mono className="text-xs text-muted">{countLabel(count, total, noun, nounPlural)}</Mono>
          ) : (
            // Narrowed is a state, so it ships a glyph and the word for it.
            <Chip glyph="filter" mono>
              {`Filtered: ${countLabel(count, total, noun, nounPlural)}`}
            </Chip>
          )}
        </span>
        {!list.isDefault && (
          <Button size="sm" glyph="close" onClick={() => list.reset()}>
            Clear filters
          </Button>
        )}
        {children}
      </Inline>
    </Spread>
  );
}
