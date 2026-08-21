/**
 * Warm intros - destination org → ranked paths in → ask the opener.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Banner,
  Button,
  Chip,
  EmptyState,
  EntityGlyph,
  ErrorState,
  InfoPopover,
  Input,
  Mono,
  PageHeader,
  RegisterRule,
  Section,
  SkeletonRows,
  StatusTrace,
} from '@vitae/ui';
import { api } from '../lib/api.js';
import { entityHref } from '../lib/entity-href.js';
import { Composer, type ComposerContext } from '../features/Composer.js';

interface Target {
  id: string;
  title: string;
  kind: string | null;
  city: string | null;
  stage: string | null;
  reach: string;
  reachable: boolean;
  affinity: number;
  peopleCount: number;
  openRoles: number;
}

interface Hop {
  nodeId: string;
  title: string;
  type: string;
  viaEdgeType?: string;
  viaStrength?: number;
}

interface IntroPath {
  hops: Hop[];
  score: number;
  strengthLabel: string;
  askerId: string | null;
  askerName: string | null;
  why: string;
  factors?: string[];
}

/** What the edge into this hop is, in words. */
export function edgeLabel(hop: Hop): string {
  if (hop.viaEdgeType === 'works_at') return 'works there';
  if (hop.viaEdgeType === 'introduced') return 'introduced';
  if (hop.viaEdgeType === 'knows') {
    return hop.viaStrength != null ? `knows · ${hop.viaStrength.toFixed(2)}` : 'knows';
  }
  return hop.viaEdgeType ?? '';
}

/**
 * How heavily to draw the line into a hop.
 *
 * The three `--strong` / `--medium` / `--weak` classes this replaces painted
 * the line accent, accent-soft, and `--ae-warning` - a semantic token used as
 * a chart series, which tokens.css forbids two lines above the colours it was
 * reaching for. Banding also read as three categories when the thing being
 * shown is a continuum. One ink, more of it, and the number stays on the label.
 */
export function edgeWeight(hop: Hop): number {
  // A "works there" or "introduced" edge is a fact, not a degree - drawn full.
  if (hop.viaEdgeType !== 'knows') return 1;
  const s = hop.viaStrength;
  return s == null ? 0.55 : Math.max(0.2, Math.min(1, 0.2 + 0.8 * s));
}

/** The concrete facts behind the rail's ordering, in the rail. */
export function targetFacts(t: Target): string {
  const parts = [`${t.peopleCount} known`];
  if (t.openRoles > 0) parts.push(`${t.openRoles} open role${t.openRoles === 1 ? '' : 's'}`);
  return parts.join(' · ');
}

export function contactLensHref(orgName?: string): string {
  const q = new URLSearchParams({ lens: 'contact', need: 'intro' });
  if (orgName?.trim()) q.set('org', orgName.trim());
  if (orgName?.trim()) q.set('run', '1');
  return `/network/intelligence?${q.toString()}`;
}

export function reachLensHref(orgId?: string): string {
  const q = new URLSearchParams({ lens: 'reach' });
  if (orgId) q.set('org', orgId);
  return `/network/intelligence?${q.toString()}`;
}

function PathNarrative({ hops, selfId }: { hops: Hop[]; selfId: string | null }) {
  return (
    <div className="network-path" aria-label="Introduction path">
      {hops.map((h, j) => {
        const isSelf = selfId != null && h.nodeId === selfId;
        const isOrg = h.type === 'organization';
        const node = 'network-path__node';
        return (
          <span key={`${h.nodeId}-${j}`} className="network-path__segment">
            {j > 0 && (
              <span className="network-path__connector">
                <span
                  className="network-path__line"
                  style={{ opacity: edgeWeight(h) }}
                  aria-hidden
                />
                {/* The label sets the connector's width. Pinned at 5rem it ran
                    under the node beside it, so "knows · 1.00" overlapped a name. */}
                <span className="network-path__edge u-mono">{edgeLabel(h)}</span>
              </span>
            )}
            {isSelf ? (
              <span className={`${node} network-path__node--self`}>You</span>
            ) : (
              <Link
                className={`${node} ${isOrg ? 'network-path__node--organization' : 'network-path__node--person'}`}
                to={entityHref(h.type, h.nodeId)}
              >
                {!isOrg && <EntityGlyph type={h.type} size="sm" />}
                <span className="truncate">{h.title}</span>
              </Link>
            )}
          </span>
        );
      })}
    </div>
  );
}

function TargetButton({
  t,
  active,
  onSelect,
}: {
  t: Target;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      // aria-current, not colour: which target you are looking at was carried
      // by a border tint alone.
      aria-current={active ? 'true' : undefined}
      className="network-target"
      onClick={onSelect}
    >
      <span className="network-target__head">
        <span className="network-target__title">{t.title}</span>
        <Mono className="network-target__reach">{active ? `viewing · ${t.reach}` : t.reach}</Mono>
      </span>
      <span className="network-target__meta">
        {[t.stage, t.kind, t.city].filter(Boolean).join(' · ') || '—'}
      </span>
      {/* The rail sorts by application stage then by how strongly you are
          connected, and used to show neither. These are the facts behind it. */}
      <span className="network-target__facts u-mono">{targetFacts(t)}</span>
    </button>
  );
}

/** Warm intros: pick a target org, see ranked paths in, ask the opener. */
export function Intros() {
  const [params, setParams] = useSearchParams();
  const [composer, setComposer] = useState<ComposerContext | null>(null);
  const [railQ, setRailQ] = useState('');

  const targets = useQuery({
    queryKey: ['intro-targets'],
    queryFn: () => api.get<{ targets: Target[] }>('/intros/targets'),
  });

  const orgFromUrl = params.get('org');
  const orgNameFromUrl = params.get('orgName');
  const namedTarget = orgNameFromUrl
    ? targets.data?.targets.find(
        (t) => t.title.localeCompare(orgNameFromUrl, undefined, { sensitivity: 'base' }) === 0,
      )
    : undefined;
  const targetId =
    orgFromUrl && targets.data?.targets.some((t) => t.id === orgFromUrl)
      ? orgFromUrl
      : namedTarget
        ? namedTarget.id
        : (targets.data?.targets[0]?.id ?? null);
  const target = targets.data?.targets.find((t) => t.id === targetId) ?? null;

  // The URL always names the org on screen, so the page can be linked and
  // reloaded onto the same destination rather than snapping back to the first.
  useEffect(() => {
    if (!targetId) return;
    setParams(
      (prev) => {
        if (prev.get('org') === targetId && !prev.has('orgName')) return prev;
        const next = new URLSearchParams(prev);
        next.set('org', targetId);
        next.delete('orgName');
        return next;
      },
      { replace: true },
    );
  }, [targetId, setParams]);

  const paths = useQuery({
    queryKey: ['intro-paths', targetId],
    queryFn: () =>
      api.get<{ paths: IntroPath[]; org?: { id: string } }>(`/intros/paths?orgId=${targetId}`),
    enabled: Boolean(targetId),
  });

  const selfId = useMemo(() => {
    const first = paths.data?.paths[0]?.hops[0];
    return first?.type === 'person' ? first.nodeId : null;
  }, [paths.data]);

  const filtered = useMemo(() => {
    const q = railQ.trim().toLowerCase();
    const all = targets.data?.targets ?? [];
    if (!q) return all;
    return all.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        (t.city ?? '').toLowerCase().includes(q) ||
        (t.kind ?? '').toLowerCase().includes(q) ||
        (t.stage ?? '').toLowerCase().includes(q),
    );
  }, [targets.data, railQ]);

  const groups = [
    { key: 'pursuing', label: 'Pursuing', items: filtered.filter((t) => Boolean(t.stage)) },
    {
      key: 'reachable',
      label: 'Reachable',
      items: filtered.filter((t) => !t.stage && t.reachable),
    },
    { key: 'cold', label: 'No path', items: filtered.filter((t) => !t.stage && !t.reachable) },
  ].filter((g) => g.items.length > 0);

  function selectOrg(id: string) {
    const next = new URLSearchParams(params);
    next.set('org', id);
    setParams(next, { replace: true });
  }

  const pathList = paths.data?.paths ?? [];
  const hasOrgs = (targets.data?.targets ?? []).length > 0;

  return (
    <div className="page page--network page--network-intelligence">
      <div className="network-intelligence__head">
        <PageHeader
          title="Warm paths"
          subtitle="Choose a destination, inspect every hop, then ask the strongest opener."
          help={
            <InfoPopover title="How paths are ranked">
              <p>
                A path is a chain of recorded ties from you to the organization. Every hop dilutes
                the ask, so a shorter chain of strong ties outranks a longer one. Line weight
                represents the strength of each tie; the adjacent label carries its exact meaning.
              </p>
              <p>
                Organizations with active applications come first, followed by the destinations you
                can already reach. Every target states how many people and open roles support that
                position.
              </p>
            </InfoPopover>
          }
        />
        <nav className="network-lenses" aria-label="Network intelligence lens">
          <Link className="network-lenses__item" to={contactLensHref(target?.title)}>
            Who to contact
          </Link>
          <Link
            className="network-lenses__item"
            aria-current="page"
            to={reachLensHref(targetId ?? undefined)}
          >
            Warm paths
          </Link>
        </nav>
      </div>
      <RegisterRule />

      {targets.isError && targets.data && (
        <Banner
          className="network-secondary-state"
          tone="danger"
          title="Organizations could not be refreshed"
          action={
            <Button size="sm" onClick={() => void targets.refetch()}>
              Retry targets
            </Button>
          }
        >
          Showing the last verified target list and reachability facts.
        </Banner>
      )}

      {targets.isError && !targets.data ? (
        <ErrorState
          title="Couldn’t load your organizations"
          detail={(targets.error as Error | null)?.message}
          onRetry={() => void targets.refetch()}
        />
      ) : targets.isLoading ? (
        <SkeletonRows rows={6} />
      ) : !hasOrgs ? (
        <EmptyState
          glyph="org"
          title="No organizations yet"
          hint="Capture the companies you want to reach, then the people who work there. Paths appear here as soon as one connects."
          action={
            <Link className="vt-btn vt-btn--sm" to="/network/organizations">
              Open organizations
            </Link>
          }
        />
      ) : (
        <div className="network-intelligence__workspace">
          <aside className="network-targets" aria-label="Target organizations">
            <div className="network-targets__filter">
              <Input
                aria-label="Filter organizations"
                placeholder="Filter orgs…"
                value={railQ}
                onChange={(e) => setRailQ(e.target.value)}
              />
            </div>

            {groups.map((g) => (
              <section key={g.key} className="network-targets__group" aria-label={g.label}>
                <h2>{g.label}</h2>
                <div className="network-targets__items">
                  {g.items.map((t) => (
                    <TargetButton
                      key={t.id}
                      t={t}
                      active={t.id === targetId}
                      onSelect={() => selectOrg(t.id)}
                    />
                  ))}
                </div>
              </section>
            ))}

            {filtered.length === 0 && (
              <div className="network-targets__empty" role="status">
                No organizations match “{railQ}”.{' '}
                <button type="button" onClick={() => setRailQ('')}>
                  Clear the filter
                </button>
              </div>
            )}
          </aside>

          <div className="network-paths">
            {target && (
              <Section
                title={`Reach ${target.title}`}
                meta={paths.data ? pathList.length : undefined}
                actions={
                  <Link className="text-sm" to={entityHref('organization', target.id)}>
                    Open {target.title}
                  </Link>
                }
              >
                {paths.isFetching && paths.data && (
                  <StatusTrace
                    className="network-trace"
                    tone="live"
                    label={`Rechecking paths to ${target.title}`}
                    detail="Keeping the current path evidence visible"
                  />
                )}
                {paths.isError && paths.data && (
                  <Banner
                    className="network-secondary-state"
                    tone="danger"
                    title={`Paths to ${target.title} could not be refreshed`}
                    action={
                      <Button size="sm" onClick={() => void paths.refetch()}>
                        Retry paths
                      </Button>
                    }
                  >
                    Showing the last completed path calculation.
                  </Banner>
                )}
                {paths.isError && !paths.data ? (
                  // Was unchecked, so a failed lookup rendered "No path yet" and
                  // sent you off to capture people who already exist - the screen
                  // blaming your graph for the server's fault.
                  <ErrorState
                    title={`Couldn’t work out how to reach ${target.title}`}
                    detail={(paths.error as Error | null)?.message}
                    onRetry={() => void paths.refetch()}
                  />
                ) : paths.isLoading ? (
                  <SkeletonRows rows={3} />
                ) : pathList.length === 0 ? (
                  <EmptyState
                    glyph="graph"
                    title={`No warm path to ${target.title} yet`}
                    hint={`Nobody you know connects to ${target.title}. Link someone you know to a role there, or add a person who works there.`}
                    action={
                      <Link className="vt-btn vt-btn--sm" to="/network/people">
                        Open People
                      </Link>
                    }
                  />
                ) : (
                  pathList.map((p, i) => (
                    <article key={i} className="network-intro-path">
                      <header className="network-intro-path__head">
                        {/* The rank was carried by a "strongest" chip that
                            replaced the path's own strength label on the first
                            card, so one of the two was always missing. It is a
                            position, so it reads as one - and it gives each card
                            a name of its own, which matters here: three people
                            in this graph are called Jordan, and three cards
                            otherwise offer three controls called "Ask Jordan". */}
                        <Mono className="network-intro-path__rank">Path {i + 1}</Mono>
                        <Chip mono>{p.strengthLabel}</Chip>
                        <span className="network-intro-path__score">
                          <small>path score</small>
                          <Mono>{p.score.toFixed(2)}</Mono>
                        </span>
                      </header>

                      <PathNarrative hops={p.hops} selfId={selfId} />

                      <div className="network-intro-path__evidence">
                        <p>{p.why}</p>
                        {(p.factors ?? []).length > 0 && (
                          <div aria-label="Path evidence">
                            <span>Evidence</span>
                            {/* Not sliced: these factors are the explanation. */}
                            {(p.factors ?? []).map((f, fi) => (
                              <Chip key={fi} mono>
                                {f}
                              </Chip>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="network-intro-path__actions">
                        {p.askerId && p.askerName && (
                          <Button
                            size="sm"
                            variant="primary"
                            aria-label={`Ask ${p.askerName.split(/\s+/)[0]} - path ${i + 1}`}
                            onClick={() =>
                              setComposer({
                                personId: p.askerId!,
                                personName: p.askerName!,
                                kind:
                                  p.hops.filter((h) => h.type === 'person').length <= 2
                                    ? 'explore'
                                    : 'intro',
                                targetOrgId: targetId ?? undefined,
                                targetOrgName: target.title,
                              })
                            }
                          >
                            Ask {p.askerName.split(/\s+/)[0]}
                          </Button>
                        )}
                        {p.askerId && p.askerName && (
                          // Named, not "Open person": five cards each offering an
                          // "Open person" link is five controls with one name.
                          <Link
                            className="network-intro-path__profile"
                            to={entityHref('person', p.askerId)}
                            aria-label={`Open ${p.askerName} - path ${i + 1}`}
                          >
                            Open {p.askerName}
                          </Link>
                        )}
                      </div>
                    </article>
                  ))
                )}
              </Section>
            )}
          </div>
        </div>
      )}

      {composer && <Composer ctx={composer} onClose={() => setComposer(null)} />}
    </div>
  );
}
