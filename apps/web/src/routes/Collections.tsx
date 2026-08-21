import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  ConfirmDialog,
  EmptyState,
  EntityGlyph,
  ErrorState,
  Field,
  Input,
  Modal,
  Mono,
  PageHeader,
  ProvenanceChip,
  RegisterRule,
  Skeleton,
  Section,
  SkeletonRows,
  StatusTrace,
} from '@vitae/ui';
import { tokenizeQuery } from '@vitae/core';
import { api } from '../lib/api.js';
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
  const [draft, setDraft] = useState('');
  const navigate = useNavigate();
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
    enabled: q.trim().length > 0,
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
  });

  function saveView() {
    const name = viewName.trim();
    if (name) saveViewM.mutate(name);
  }

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
              aria-label={`remove ${tok}`}
            >
              ×
            </button>
          </span>
        ))}
        <input
          id="library-query"
          className="coll__input"
          placeholder={q ? 'Add another clause…' : 'Try type:person, tag:ml, or city:Berlin'}
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
        {q ? (
          <StatusTrace
            tone={results.isError ? 'danger' : results.isFetching ? 'live' : 'neutral'}
            label={
              results.isError
                ? 'Query unavailable'
                : results.isFetching
                  ? 'Reading the library'
                  : `${results.data?.nodes.length ?? 0} matching ${results.data?.nodes.length === 1 ? 'record' : 'records'}`
            }
            detail={`${queryTokens.length} ${queryTokens.length === 1 ? 'clause' : 'clauses'} · deterministic match`}
          />
        ) : (
          <StatusTrace
            tone={counts.isError ? 'danger' : counts.isFetching ? 'live' : 'neutral'}
            label={
              counts.isError
                ? 'Library index unavailable'
                : counts.isFetching
                  ? 'Reading the library index'
                  : `${counts.data?.total ?? 0} ${counts.data?.total === 1 ? 'record' : 'records'} indexed`
            }
            detail={`${views.data?.views.length ?? 0} saved ${views.data?.views.length === 1 ? 'view' : 'views'}`}
          />
        )}
      </div>

      {q ? (
        <Section title="Matches" meta={results.data?.nodes.length}>
          {results.isError ? (
            <ErrorState
              title="Couldn’t run that query"
              detail={(results.error as Error | null)?.message}
              onRetry={() => void results.refetch()}
            />
          ) : results.isLoading ? (
            // Skeletons in the shape of the rows, not a centred spinner.
            <SkeletonRows rows={5} />
          ) : (results.data?.nodes.length ?? 0) === 0 ? (
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
          ) : (
            results.data!.nodes.map((n) => (
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
          )}
        </Section>
      ) : (
        <>
          {counts.isError ? (
            <ErrorState
              title="Couldn’t count your records"
              detail={(counts.error as Error | null)?.message}
              onRetry={() => void counts.refetch()}
            />
          ) : (
            COLLECTION_TILE_GROUPS.map((group) => (
              <Section key={group.label} title={group.label}>
                <div className="explore-library__register">
                  {group.types.map((type) => (
                    <button
                      key={type}
                      type="button"
                      className="explore-library__type"
                      onClick={() => navigate(entityListHref(type))}
                      aria-label={`Open ${typeLabel(type)} records${counts.data ? `, ${counts.data.counts[type] ?? 0}` : ''}`}
                    >
                      <span className="explore-library__type-glyph">
                        <EntityGlyph type={type} />
                      </span>
                      <span className="explore-library__type-copy">
                        <strong>{typeLabel(type)}</strong>
                        <span>Open register</span>
                      </span>
                      <span className="explore-library__type-count" aria-hidden>
                        {counts.isLoading ? (
                          <Skeleton width={20} height={15} />
                        ) : (
                          <Mono className="text-md">{counts.data?.counts[type] ?? 0}</Mono>
                        )}
                      </span>
                    </button>
                  ))}
                </div>
              </Section>
            ))
          )}

          {views.isError && (
            <Section title="Saved views">
              <ErrorState
                title="Couldn’t load saved views"
                detail="The library index is unaffected. Retry to restore the reusable query list."
                onRetry={() => void views.refetch()}
              />
            </Section>
          )}
          {(views.data?.views.length ?? 0) > 0 && (
            <Section title="Saved views" meta={views.data!.views.length}>
              {views.data!.views.map((v) => (
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
                    aria-label={`Delete view ${v.name}`}
                    onClick={() => setConfirmDeleteView(v)}
                  >
                    Delete
                  </Button>
                </div>
              ))}
            </Section>
          )}
        </>
      )}
      <ConfirmDialog
        open={confirmDeleteView !== null}
        onOpenChange={(open) => !open && setConfirmDeleteView(null)}
        title={`Delete the view “${confirmDeleteView?.name ?? ''}”?`}
        body="The records it finds are untouched, only the saved query goes."
        confirmLabel="Delete view"
        destructive
        busy={deleteViewM.isPending}
        onConfirm={() => {
          const target = confirmDeleteView;
          setConfirmDeleteView(null);
          if (target) deleteViewM.mutate(target.id);
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
              {saveViewM.isPending ? 'Saving…' : 'Save'}
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
