import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { tokenizeQuery } from '@vitae/core';
import {
  Chip,
  EmptyState,
  EntityGlyph,
  ErrorState,
  FilterGroup,
  Glyph,
  InfoPopover,
  Input,
  Mono,
  PageHeader,
  ProvenanceChip,
  RegisterRule,
  Row,
  Section,
  SkeletonRows,
  StrengthBar,
} from '@vitae/ui';
import { api } from '../lib/api.js';
import { entityHref, typeLabel } from '../lib/entity-href.js';

interface Ast {
  text: string;
  clauses: Array<{ field: string; value: string; raw: string }>;
  invalid: Array<{ raw: string; reason: string }>;
}

/** A hit is a whole node plus the two things only search knows about it. */
export interface Hit {
  id: string;
  type: string;
  title: string;
  subtitle?: string | null;
  source: string;
  confidence: number;
  updated_at: string;
  props?: Record<string, unknown>;
  _score: number;
  /** Whose record this is, search spans everyone in the graph. */
  owner?: { id: string; title: string; isSelf: boolean } | null;
}
interface SearchResp {
  ast: Ast;
  results: Hit[];
}

/** Kinds a result can be narrowed to (reference: people / links / documents / …). */
const GROUPS: Array<{ key: string; label: string; types: string[] }> = [
  { key: 'people', label: 'People', types: ['person'] },
  { key: 'organizations', label: 'Organizations', types: ['organization'] },
  { key: 'links', label: 'Links', types: ['link'] },
  { key: 'documents', label: 'Documents', types: ['document', 'media_item'] },
  { key: 'interactions', label: 'Interactions', types: ['interaction'] },
];
const OTHER = { key: 'other', label: 'Everything else' };

function groupOf(type: string): string {
  return GROUPS.find((g) => g.types.includes(type))?.key ?? OTHER.key;
}

/**
 * The filter grammar, in the words of someone who has to use it. Exported so a
 * test can lock it to `FILTER_FIELDS`: a field added to the parser but never
 * explained here is a feature only its author can find.
 */
export const SEARCH_GRAMMAR: Array<{ field: string; example: string; means: string }> = [
  { field: 'type', example: 'type:person', means: 'one kind of record' },
  { field: 'tag', example: 'tag:ml', means: 'a tag you applied' },
  { field: 'org', example: 'org:Nile', means: 'anything tied to an organization' },
  { field: 'city', example: 'city:Berlin', means: 'where it happened' },
  { field: 'after', example: 'after:2025-01-01', means: 'on or after a date' },
  { field: 'before', example: 'before:2026-01-01', means: 'on or before a date' },
  { field: 'has', example: 'has:attachment', means: 'attachment, note or metric' },
  { field: 'is', example: 'is:pinned', means: 'pinned, archived, sensitive, draft, final or sent' },
  { field: 'source', example: 'source:manual', means: 'how the record got here' },
  { field: 'shared_by', example: 'shared_by:Omar', means: 'who sent it to you' },
];

/** The one line under a title, always populated so rows stay a single shape. */
export function rowSubtitle(h: Hit): string {
  if (h.subtitle) return h.subtitle;
  const props = h.props ?? {};
  const parts = [props.headline, props.city, props.role].filter((v): v is string => typeof v === 'string' && !!v);
  return parts.length > 0 ? parts.join(' · ') : typeLabel(h.type);
}

/** Search results over the whole graph, ranked, with the filter grammar parsed
 *  back at you as chips (SRS FR-SRCH-001/002/003). */
export function SearchResults() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q')?.trim() ?? '';
  const [draft, setDraft] = useState(q);
  const [kind, setKind] = useState<string>('all');
  const inputRef = useRef<HTMLInputElement>(null);
  // What we last wrote into the URL ourselves, so the two effects below can
  // tell "the user is typing" from "something else navigated us here".
  const pushed = useRef(q);

  // Typing rewrites the URL rather than component state. The grammar's own
  // contract is that a query round-trips through a URL (FR-ORG-005); a search
  // you cannot link to, reload or go back to is a search you retype. `replace`
  // keeps the back button pointing at wherever you came from rather than at
  // every keystroke along the way.
  useEffect(() => {
    const next = draft.trim();
    if (next === pushed.current) return;
    const t = setTimeout(() => {
      pushed.current = next;
      setParams(next ? { q: next } : {}, { replace: true });
    }, 250);
    return () => clearTimeout(t);
  }, [draft, setParams]);

  // …and the URL is the source of truth on the way back in: a link into
  // /search?q=… or the back button has to land in the input too.
  useEffect(() => {
    if (q === pushed.current) return;
    pushed.current = q;
    setDraft(q);
  }, [q]);

  /** Change the query now rather than on the typing debounce. */
  function applyQuery(next: string) {
    const v = next.trim();
    pushed.current = v;
    setDraft(v);
    setParams(v ? { q: v } : {}, { replace: true });
    inputRef.current?.focus();
  }

  const search = useQuery({
    queryKey: ['search', q],
    queryFn: async () => {
      // Timed here and returned with the payload: the old code stashed the
      // latency in a ref, so the number on screen described whichever search
      // had finished last, not the results underneath it.
      const t0 = performance.now();
      const res = await api.get<SearchResp>(`/search?q=${encodeURIComponent(q)}`);
      return { ...res, ms: Math.round(performance.now() - t0) };
    },
    enabled: q.length > 0,
    // Keeps the last results on screen while the next query flies, so typing
    // doesn't strobe the list through skeleton → results on every keystroke.
    placeholderData: keepPreviousData,
  });

  const hits = useMemo(() => search.data?.results ?? [], [search.data]);

  /** Kinds actually present, with counts, the narrowing control is built from
   *  the results, so it can never offer a filter that matches nothing. */
  const kinds = useMemo(() => {
    const counts = new Map<string, number>();
    for (const h of hits) counts.set(groupOf(h.type), (counts.get(groupOf(h.type)) ?? 0) + 1);
    const present = [...GROUPS, OTHER].filter((g) => counts.has(g.key));
    return [
      { key: 'all', label: `All ${hits.length}` },
      ...present.map((g) => ({ key: g.key, label: `${g.label} ${counts.get(g.key)!}` })),
    ];
  }, [hits]);

  // Derived, not stored: a kind that the new results no longer contain falls
  // back to "all" instead of stranding you on an empty list you can't explain.
  const activeKind = kinds.some((k) => k.key === kind) ? kind : 'all';
  const shown = activeKind === 'all' ? hits : hits.filter((h) => groupOf(h.type) === activeKind);

  const ast = search.data?.ast;

  // Relevance is only meaningful relative to the best match in the set, and
  // only when there was free text to score in the first place. A filters-only
  // query scores every hit against its own title (search-index.ts falls back to
  // `q || n.title`), so the index hands back a flat 1.0 for all of them, the
  // clauses did the ordering, and drawing a full bar on every row would be the
  // screen inventing a number. Gated on the parsed query, not on the scores,
  // so it stays right whatever the index decides to return.
  const scorable = (ast?.text.length ?? 0) > 0;
  const top = scorable ? hits.reduce((m, h) => Math.max(m, h._score), 0) : 0;

  const parsed = (ast?.clauses.length ?? 0) + (ast?.invalid.length ?? 0) > 0;
  const searching = search.isFetching && !search.isLoading;

  return (
    <div className="page">
      <PageHeader
        title="Search"
        subtitle="Everything in the graph, ranked, plain words, filters, or both."
        help={
          <InfoPopover title="How these results are ordered">
            <p>
              Free text is scored against titles, notes and documents; the strongest match leads. The bar on each row is
              that row&rsquo;s score as a share of the top one, so a row at 1.00 is the best match and a set of rows all
              near 1.00 is a tie you will have to break yourself.
            </p>
            <p>
              A query made only of filters has nothing to score, so it shows no bars, the clauses did the work. Each row
              also names where the record came from, which is usually what tells two same-named records apart.
            </p>
          </InfoPopover>
        }
      />
      {/* A plain rule. Relevance was the one candidate for ticks here, and it
          is already on every row as a labelled bar, repeating it overhead, in
          a form you cannot read a number off, is decoration. */}
      <RegisterRule />

      {/*
        A form, not a `div role="search"`. The landmark was right; the element
        under it was not. A form submits, so Enter runs the search this instant
        instead of waiting out the 250ms typing debounce, and the field inside
        it is the shipped `Input` rather than a borderless one-off that stood
        22px tall and matched nothing else in the app.
      */}
      <form
        role="search"
        className="search-bar"
        onSubmit={(e) => {
          e.preventDefault();
          applyQuery(draft);
        }}
      >
        <label htmlFor="search-q" className="u-visually-hidden">
          Search query
        </label>
        <span className="search-bar__field">
          <span className="search-bar__glyph" aria-hidden>
            <Glyph name="search" size={14} />
          </span>
          <Input
            id="search-q"
            ref={inputRef}
            mono
            className="search-bar__input"
            autoFocus
            placeholder="Search titles, notes, documents…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
        </span>
        {q && (
          <Mono className="search-bar__timing text-xs text-muted">
            {searching ? 'searching…' : search.data ? `${search.data.ms} ms` : ''}
          </Mono>
        )}
      </form>

      {parsed && (
        <div className="search-clauses chips">
          {/*
            Real `Chip`s. These were a hand-built `.coll__chip` with a `×` in a
            `.coll__chipx` that computed to roughly 8 by 13 pixels: a target a
            quarter of the identity's floor, sitting one line above invalid
            clauses that *were* rendered as `Chip`s, so the same row of the same
            screen spoke two dialects of the same idea.
          */}
          {ast!.clauses.map((c, i) => (
            <Chip key={`${c.raw}-${i}`} tone="accent" mono>
              {c.field}:{c.value}
              <button
                type="button"
                // The system's own remove affordance, which carries the 32/44px
                // target as a pseudo-element rather than as box size. `Chip`'s
                // built-in `onRemove` would have been the obvious move, but it
                // hardcodes the label "Remove", and five chips called "Remove"
                // are five identical rows in a screen reader's control list.
                className="vt-chip__x"
                onClick={() => applyQuery(dropToken(q, c.raw))}
                aria-label={`Remove filter ${c.raw}`}
              >
                <Glyph name="close" size={12} />
              </button>
            </Chip>
          ))}
          {/* The reason was a `title` tooltip, which is to say it was invisible
              to keyboards, touch and screen readers alike, the one audience
              that needs it least is people who can hover. */}
          {ast!.invalid.map((iv, i) => (
            <Chip key={`iv${i}`} tone="warning">
              {iv.raw}: {iv.reason}
            </Chip>
          ))}
        </div>
      )}

      {!q ? (
        <Section title="Filter grammar" meta={SEARCH_GRAMMAR.length}>
          <p className="search-grammar__lede">
            Type words to search everything, or narrow with a filter. Pick one to try it.
          </p>
          {/*
            A ruled register, not ten bordered cards in a two-column grid. The
            cards drew ten boxes of equal weight for what is really one list of
            ten equal things, and they reflowed at Tailwind's `md` (768px),
            which is not one of this app's breakpoints, so the grammar changed
            shape at a width nothing else on the screen reacts to.
          */}
          <ul className="search-grammar">
            {SEARCH_GRAMMAR.map((g) => (
              <li key={g.field} className="search-grammar__item">
                <button
                  type="button"
                  className="search-grammar__try"
                  onClick={() => applyQuery(g.example)}
                >
                  <Mono className="search-grammar__example">{g.example}</Mono>
                  <span className="search-grammar__means">{g.means}</span>
                </button>
              </li>
            ))}
          </ul>
        </Section>
      ) : (
        <Section
          title="Matches"
          meta={search.data ? shown.length : undefined}
          actions={
            kinds.length > 2 && (
              <FilterGroup label="Narrow results by kind" options={kinds} value={activeKind} onChange={setKind} />
            )
          }
        >
          {search.isError ? (
            <ErrorState
              title="Couldn’t run that search"
              detail={(search.error as Error | null)?.message}
              onRetry={() => void search.refetch()}
            />
          ) : search.isLoading ? (
            <SkeletonRows rows={5} label="Running your search" />
          ) : hits.length === 0 ? (
            <EmptyState
              glyph="search"
              title="No matches"
              hint="Relax a filter, try a different spelling, or check the Trash, deleted records stay recoverable for 30 days."
            />
          ) : (
            // There is deliberately no "filtered down to nothing" state: the
            // kind buttons are built from the kinds actually present, each with
            // a count, so narrowing can never empty the list. Offering a filter
            // that matches nothing is the bug; handling its aftermath is not a
            // feature.
            <ul className="search-hits">
              {shown.map((h) => (
                <Row
                  key={h.id}
                  as="li"
                  interactive
                  leading={<EntityGlyph type={h.type} size="sm" />}
                  // Only the title and the subtitle are the link. The whole row
                  // used to be one `<a>`, so its accessible name was the glyph,
                  // the title, the subtitle, the owner, the provenance, the
                  // date and the strength bar's hidden label run together as
                  // one string, and the facts that tell two identical titles
                  // apart were unreachable as separate things.
                  main={(p) => <Link {...p} to={entityHref(h.type, h.id)} />}
                  title={h.title}
                  subtitle={rowSubtitle(h)}
                  meta={<Mono className="text-xs text-faint">{h.updated_at.slice(0, 10)}</Mono>}
                >
                  {h.owner && (
                    <Chip glyph="person" tone={h.owner.isSelf ? 'accent' : 'default'}>
                      {h.owner.isSelf ? 'you' : h.owner.title}
                    </Chip>
                  )}
                  {/* Provenance and date are the whole point of the row: they are
                      what tells a Sarah Chen you typed from a Sarah Chen a vCard
                      brought in. */}
                  <ProvenanceChip source={h.source} confidence={h.confidence} />
                  {top > 0 && <StrengthBar value={h._score / top} label="Relevance, share of the top match" />}
                </Row>
              ))}
            </ul>
          )}
        </Section>
      )}

      {/* The count changes without anything moving focus, so it has to be
          announced rather than merely rendered. */}
      <p aria-live="polite" className="u-visually-hidden">
        {q && search.data ? `${shown.length} of ${hits.length} matches shown` : ''}
      </p>
    </div>
  );
}

/** Drop one clause token from a query string, leaving the rest untouched. */
export function dropToken(q: string, raw: string): string {
  // The parser's own tokenizer, not a second copy of the regex: a chip has
  // to remove the clause the parser saw, whitespace inside quotes and all.
  const tokens = tokenizeQuery(q);
  const at = tokens.indexOf(raw);
  // Only the first occurrence: two identical clauses are two chips, and
  // removing one of them should not silently remove both.
  if (at >= 0) tokens.splice(at, 1);
  return tokens.join(' ');
}
