import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Banner,
  Button,
  ConfirmDialog,
  EmptyState,
  EntityGlyph,
  Field,
  Input,
  Modal,
  Mono,
  PageHeader,
  ProvenanceChip,
  RegisterRule,
  Skeleton,
  Section,
  StatusTrace,
} from '@vitae/ui';
import { tokenizeQuery } from '@vitae/core';
import { api } from '../lib/api.js';
import { QueryBoundary } from '../components/QueryBoundary.js';
import { NEW_ENTITY_MENU_GROUPS, NewEntityMenu } from '../features/forms/NewEntityMenu.js';
import { useToast } from '../features/Toast.js';
import { entityHref, entityListHref, typeLabel } from '../lib/entity-href.js';

interface NodeLite {
  id: string;
  type: string;
  title: string;
  subtitle?: string;
  source: string;
  confidence: number;
  pinned: boolean;
  updated_at: string;
}

/** Every creatable type, grouped like + New, coverage test locks this to NODE_TYPES. */
export const COLLECTION_TILE_GROUPS = NEW_ENTITY_MENU_GROUPS;

export function Collections() {
  const [saveOpen, setSaveOpen] = useState(false);
  const [confirmDeleteView, setConfirmDeleteView] = useState<{ id: string; name: string } | null>(
    null,
  );
  const [viewName, setViewName] = useState('');
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const queryTokens = tokens(q);
  /** A query the results request will actually run, rather than any `?q=`. */
  const active = q.trim().length > 0;
  const [draft, setDraft] = useState('');
  const qc = useQueryClient();
  const { flash } = useToast();

  const counts = useQuery({
    queryKey: ['node-counts'],
    queryFn: () => api.get<{ counts: Record<string, number>; total: number }>('/nodes/counts'),
  });

  const views = useQuery({
    queryKey: ['views'],
    queryFn: () => api.get<{ views: Array<{ id: string; name: string; query: string }> }>('/views'),
  });

  const results = useQuery({
    queryKey: ['collections', q],
    queryFn: () => api.get<{ nodes: NodeLite[] }>(`/nodes?q=${encodeURIComponent(q)}`),
    enabled: active,
  });

  function setQuery(next: string) {
    if (next.trim()) setParams({ q: next.trim() });
    else setParams({});
  }

  function addToken(e: FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    setQuery([q, draft.trim()].filter(Boolean).join(' '));
    setDraft('');
  }

  function removeToken(tok: string) {
    setQuery(
      tokens(q)
        .filter((t) => t !== tok)
        .join(' '),
    );
  }

  // Both view mutations were bare `api.*` calls outside useMutation, so
  // neither reached the global error-toast net: a failed save rejected into
  // nothing with the dialog still open, and a failed delete did the same with
  // the row still on screen.
  const saveViewM = useMutation({
    mutationFn: (name: string) => api.post('/views', { name, query: q }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['views'] });
      setSaveOpen(false);
      setViewName('');
      flash('Saved, pinned to the rail');
    },
    onError: (err) =>
      flash(err instanceof Error ? err.message : 'The view could not be saved.', {
        variant: 'error',
      }),
  });

  const deleteViewM = useMutation({
    mutationFn: (viewId: string) => api.del(`/views/${viewId}`),
    onSuccess: async (_res, viewId) => {
      await qc.invalidateQueries({ queryKey: ['views'] });
      const removed = views.data?.views.find((v) => v.id === viewId);
      // Destructive and easy to do by accident, so it offers a real undo :
      // recreating the view from the name and query it had.
      flash('Deleted', {
        undo: removed
          ? async () => {
              await api.post('/views', { name: removed.name, query: removed.query });
              await qc.invalidateQueries({ queryKey: ['views'] });
            }
          : undefined,
      });
    },
    onError: (err) =>
      flash(err instanceof Error ? err.message : 'The view could not be deleted.', {
        variant: 'error',
      }),
    // The dialog used to close in the same tick the request started, so its
    // busy state could never render and a second press reached a view that
    // was already going. It closes when the request is actually finished.
    onSettled: () => setConfirmDeleteView(null),
  });

  /** The one row that is actually going, not every row on the screen. */
  const deletingViewId = deleteViewM.isPending ? deleteViewM.variables : undefined;

  function saveView() {
    const name = viewName.trim();
    if (name) saveViewM.mutate(name);
  }

  const countsError = (counts.error as Error | null)?.message;

  return (
    <div className="page explore-library">
      <PageHeader
        title="Library"
        subtitle="Browse every record as one evidence library, then keep useful queries as reusable lenses."
        actions={<NewEntityMenu />}
      />
      <RegisterRule />

      <form className="coll__bar explore-library__query" role="search" onSubmit={addToken}>
        <label className="explore-library__query-label" htmlFor="library-query">
          Query
        </label>
        {queryTokens.map((tok) => (
          <span key={tok} className="coll__chip">
            {tok}
            <button
              type="button"
              className="coll__chipx"
              onClick={() => removeToken(tok)}
              aria-label={`Remove filter ${tok}`}
              // The shared rule sizes this off --ae-control-h-sm (26px), under
              // the precise-pointer floor. The hit-target token is the right
              // one and already answers pointer: coarse with 44px.
              style={{ minWidth: 'var(--ae-hit-target)', minHeight: 'var(--ae-hit-target)' }}
            >
              ×
            </button>
          </span>
        ))}
        <input
          id="library-query"
          className="coll__input"
          placeholder={q ? 'Add another clause...' : 'Try type:person, tag:ml, or city:Berlin'}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        {q && (
          <Button
            type="button"
            size="sm"
            onClick={() => {
              setViewName(q.slice(0, 60));
              setSaveOpen(true);
            }}
          >
            Save view
          </Button>
        )}
      </form>

      <div className="explore-library__trace">
        {active ? (
          <StatusTrace
            tone={results.isError ? 'danger' : results.isFetching || !results.data ? 'live' : 'neutral'}
            // The boundary below owns the loading label and the failure alert.
            // Two live regions for one event announce it twice, and the danger
            // pair interrupted twice.
            announce={Boolean(results.data) && !results.isFetching && !results.isError}
            label={
              results.isError
                ? 'Query unavailable'
                : results.data && !results.isFetching
                  ? `${results.data.nodes.length} matching ${results.data.nodes.length === 1 ? 'record' : 'records'}`
                  : 'Reading the library'
            }
            detail={`${queryTokens.length} ${queryTokens.length === 1 ? 'clause' : 'clauses'} · deterministic match`}
          />
        ) : (
          <StatusTrace
            tone={counts.isError ? 'danger' : counts.isFetching || !counts.data ? 'live' : 'neutral'}
            // The count banner is the alert for this failure; the trace keeps
            // saying it on screen without interrupting a second time.
            announce={!counts.isError}
            label={
              counts.isError
                ? 'Library index unavailable'
                : counts.data && !counts.isFetching
                  ? `${counts.data.total} ${counts.data.total === 1 ? 'record' : 'records'} indexed`
                  : 'Reading the library index'
            }
            // Coalescing to zero asserted "0 saved views" for the whole pending
            // phase, and forever after a failure. Say which it is instead.
            detail={
              views.isError
                ? 'saved views unavailable'
                : views.data
                  ? `${views.data.views.length} saved ${views.data.views.length === 1 ? 'view' : 'views'}`
                  : 'saved views loading'
            }
          />
        )}
      </div>

      {active ? (
        <Section title="Matches" meta={results.data?.nodes.length}>
          <QueryBoundary
            query={results}
            skeletonRows={5}
            loadingLabel="Reading the library"
            errorTitle="Couldn't run that query"
            showRefreshing={false}
            filtered
            emptyFiltered={
              <EmptyState
                glyph="filter"
                title="No matches"
                hint="Relax a filter, or check the Trash, deleted records stay recoverable for 30 days."
                action={
                  <Link className="vt-btn vt-btn--sm" to="/data/trash">
                    Check Trash
                  </Link>
                }
              />
            }
          >
            {(d) =>
              d.nodes.map((n) => (
                <Link key={n.id} to={entityHref(n.type, n.id)} className="row">
                  <EntityGlyph type={n.type} size="sm" accent={n.pinned} />
                  <div className="row__main">
                    <div className="row__title">{n.title}</div>
                    {n.subtitle && <div className="row__sub">{n.subtitle}</div>}
                  </div>
                  <ProvenanceChip source={n.source} confidence={n.confidence} />
                  <Mono className="text-xs text-faint">{n.updated_at.slice(0, 10)}</Mono>
                </Link>
              ))
            }
          </QueryBoundary>
        </Section>
      ) : (
        <>
          {/* A failed tally used to replace every route into the user's own
              records with an error panel. The register needs no data at all,
              so the count degrades and the registers stay open. */}
          {counts.isError && (
            <Banner
              tone="danger"
              title="Couldn't count your records"
              action={
                <Button size="sm" onClick={() => void counts.refetch()}>
                  Retry
                </Button>
              }
            >
              {countsError ? `${countsError} ` : ''}Every register below still opens.
            </Banner>
          )}

          {COLLECTION_TILE_GROUPS.map((group) => (
            <Section key={group.label} title={group.label}>
              <div className="explore-library__register">
                {group.types.map((type) => (
                  // A link, not a button: this is the only way into each
                  // record type from here, and it has to survive a middle
                  // click, a new tab and a copied address.
                  <Link
                    key={type}
                    to={entityListHref(type)}
                    className="explore-library__type no-underline"
                    aria-label={`Open ${typeLabel(type)} records${
                      counts.data
                        ? `, ${counts.data.counts[type] ?? 0}`
                        : counts.isError
                          ? ', count unavailable'
                          : ''
                    }`}
                  >
                    <span className="explore-library__type-glyph">
                      <EntityGlyph type={type} />
                    </span>
                    <span className="explore-library__type-copy">
                      <strong>{typeLabel(type)}</strong>
                      <span>Open register</span>
                    </span>
                    <span className="explore-library__type-count" aria-hidden>
                      {counts.data ? (
                        <Mono className="text-md">{counts.data.counts[type] ?? 0}</Mono>
                      ) : counts.isError ? (
                        <Mono className="text-md">—</Mono>
                      ) : (
                        <Skeleton width={20} height={15} />
                      )}
                    </span>
                  </Link>
                ))}
              </div>
            </Section>
          ))}

          {/* The section used to exist only once it already had content, so
              "still loading" and "you have none" were the same blank stretch
              of page and the feature was never named to a new user. */}
          <Section title="Saved views" meta={views.data?.views.length}>
            <QueryBoundary
              query={views}
              skeletonRows={3}
              loadingLabel="Reading your saved views"
              errorTitle="Couldn't load saved views"
              empty={
                <EmptyState
                  glyph="filter"
                  title="No saved views yet"
                  hint="Build a query above, then press Save view to pin it here."
                />
              }
            >
              {(d) =>
                d.views.map((v) => (
                  <div key={v.id} className="row explore-library__saved-view">
                    <button
                      className="row__main cursor-pointer border-0 bg-transparent p-0 text-left text-ink"
                      onClick={() => setQuery(v.query)}
                    >
                      <div className="row__title">{v.name}</div>
                      <div className="row__sub u-mono">Lens · {v.query}</div>
                    </button>
                    {/* Was a bare × that deleted on click with no confirmation,
                        no toast and no undo, the only destructive action left
                        that neither asked nor reported. */}
                    <Button
                      size="sm"
                      variant="danger"
                      glyph="trash"
                      // The name carries the state as well as the row. A fixed
                      // label would have masked the visible "Deleting..." from
                      // the one reader who cannot see it.
                      aria-label={
                        deletingViewId === v.id ? `Deleting view ${v.name}` : `Delete view ${v.name}`
                      }
                      disabled={deletingViewId === v.id}
                      onClick={() => setConfirmDeleteView(v)}
                    >
                      {deletingViewId === v.id ? 'Deleting...' : 'Delete'}
                    </Button>
                  </div>
                ))
              }
            </QueryBoundary>
          </Section>
        </>
      )}
      <ConfirmDialog
        open={confirmDeleteView !== null}
        onOpenChange={(open) => {
          // Closing while the request is out would take the only pending
          // signal off the screen with it.
          if (!open && !deleteViewM.isPending) setConfirmDeleteView(null);
        }}
        title={`Delete the view '${confirmDeleteView?.name ?? ''}'?`}
        body={
          <>
            The records it finds are untouched, only the saved query goes.
            {deleteViewM.isPending && <StatusTrace tone="live" label="Deleting the view" />}
          </>
        }
        confirmLabel="Delete view"
        destructive
        busy={deleteViewM.isPending}
        onConfirm={() => {
          if (confirmDeleteView) deleteViewM.mutate(confirmDeleteView.id);
        }}
      />
      <Modal
        open={saveOpen}
        onOpenChange={setSaveOpen}
        title="Save this view"
        description="Saved views pin to the sidebar for one-click recall."
        size="sm"
        footer={
          <>
            <Button onClick={() => setSaveOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={!viewName.trim() || saveViewM.isPending}
              onClick={saveView}
            >
              {saveViewM.isPending ? 'Saving...' : 'Save'}
            </Button>
          </>
        }
      >
        <Field label="Name" htmlFor="view-name">
          <Input
            id="view-name"
            value={viewName}
            onChange={(e) => setViewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveView();
            }}
          />
        </Field>
      </Modal>
    </div>
  );
}

/** Split a query into removable chip tokens (clauses) + free text, the same
 *  tokens the parser sees, so a chip and a clause are always the same thing. */
function tokens(q: string): string[] {
  return tokenizeQuery(q);
}
