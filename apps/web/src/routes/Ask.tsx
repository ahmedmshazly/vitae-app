/**
 * Who Should I Call (SRS P08, FR-CON-006/007). Explainable, deterministic.
 */
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Banner,
  Button,
  Chip,
  EmptyState,
  EntityGlyph,
  ErrorState,
  FactorBar,
  InfoPopover,
  Input,
  Mono,
  PageHeader,
  RegisterRule,
  Section,
  Select,
  SkeletonRows,
  StatusTrace,
} from '@vitae/ui';
import { api } from '../lib/api.js';
import { entityHref } from '../lib/entity-href.js';
import { Composer, type ComposerContext } from '../features/Composer.js';
import { InteractionLogger } from '../features/InteractionLogger.js';

interface FactorChipData {
  factor: string;
  raw: number;
  weighted: number;
  detail?: string;
}

interface AskPack {
  interactions: Array<{ id: string; title: string; kind?: string; date?: string }>;
  followUps: Array<{ what: string; due?: string }>;
  shared: Array<{ id: string; title: string; type: string }>;
  topics: string[];
}

interface Ranked {
  id: string;
  title: string;
  score: number;
  chips: FactorChipData[];
  topEvidence: string[];
  headline?: string | null;
  city?: string | null;
  pack?: AskPack;
}

interface AskHistory {
  asks: Array<{
    label: string;
    intent: { need?: string; org?: string; city?: string; terms: string[] };
  }>;
}

const NEEDS = ['referral', 'intro', 'advice', 'a favor', 'feedback'];

/**
 * The factors that answer what you actually asked. The rest, tie strength,
 * network proximity, pinned, describe your relationship with someone and
 * score the same whatever the question was.
 */
const INTENT_FACTORS = new Set(['affiliation', 'topic', 'geo']);

/**
 * Did anything about this person respond to the intent, or did they rank purely
 * on being someone you know well?
 *
 * This replaces a bare `score < 1.2`. That threshold measured the wrong thing:
 * asking for a referral at "zzzznowhere" about "zzzznothing" returns the user's
 * closest contact at 1.47, comfortably "strong", built entirely out of
 * strength and proximity, with nothing in it about the ask. A total says how
 * well you know the leader; only the factors say whether they fit.
 */
export function matchedTheAsk(chips: FactorChipData[]): boolean {
  return chips.some((c) => INTENT_FACTORS.has(c.factor) && c.weighted > 0);
}

export interface AskIntent {
  need: string;
  org: string;
  topics: string;
  city: string;
}

export function intentFromParams(params: URLSearchParams): AskIntent {
  return {
    need: params.get('need') || 'referral',
    org: params.get('org') || '',
    topics: params.get('topics') || '',
    city: params.get('city') || '',
  };
}

/**
 * Whether an intent is worth spending a rank on. A bare need is the default
 * the form already shows, so landing on /ask/people must not fire a query for
 * it, but pressing Ask with only a need selected must, which is what the
 * explicit `run` flag records.
 */
export function intentIsAskable(params: URLSearchParams): boolean {
  return Boolean(
    params.get('org') || params.get('topics') || params.get('city') || params.get('run') === '1',
  );
}

export function intentToParams(intent: AskIntent): URLSearchParams {
  const q = new URLSearchParams();
  q.set('lens', 'contact');
  if (intent.need) q.set('need', intent.need);
  if (intent.org) q.set('org', intent.org);
  if (intent.topics) q.set('topics', intent.topics);
  if (intent.city) q.set('city', intent.city);
  // Marks "the user asked for this", so an intent that is nothing but the
  // default need still runs, and still survives a reload.
  q.set('run', '1');
  return q;
}

export function contactLensHref(intent: AskIntent, explicit = false): string {
  const q = new URLSearchParams({ lens: 'contact' });
  if (intent.need) q.set('need', intent.need);
  if (intent.org) q.set('org', intent.org);
  if (intent.topics) q.set('topics', intent.topics);
  if (intent.city) q.set('city', intent.city);
  if (explicit) q.set('run', '1');
  return `/network/intelligence?${q.toString()}`;
}

export function reachLensHref(orgName: string): string {
  const q = new URLSearchParams({ lens: 'reach' });
  if (orgName.trim()) q.set('orgName', orgName.trim());
  return `/network/intelligence?${q.toString()}`;
}

/** The human-readable name of a factor, preferring whatever the ranker said. */
export function factorLabel(c: FactorChipData): string {
  if (c.detail) return c.detail;
  if (c.factor === 'graph') return 'network proximity';
  if (c.factor === 'reciprocity') return 'favors';
  return c.factor;
}

/** Plain-language evidence behind one score contribution. */
export function factorExplanation(c: FactorChipData): string {
  switch (c.factor) {
    case 'affiliation':
      return 'A recorded role or organization connection answers this ask.';
    case 'topic':
      return 'Recorded relationship topics overlap what you named.';
    case 'geo':
      return 'Their recorded location matches the city in this ask.';
    case 'strength':
      return 'Your relationship strength makes this person easier to approach.';
    case 'graph':
      return 'They sit close to you in the recorded relationship network.';
    case 'reciprocity':
      return 'The favor ledger makes this ask more reciprocal.';
    case 'pinned':
      return 'You previously marked this person as important.';
    default:
      return `A recorded ${factorLabel(c)} signal contributed to this rank.`;
  }
}

/** Who Should I Call, intent in, ranked people out, every rank explained. */
export function Ask() {
  const [params, setParams] = useSearchParams();
  const applied = intentFromParams(params);
  const askable = intentIsAskable(params);

  // The form is a draft of the next ask; the URL is the ask that ran. Keeping
  // them separate is what makes the ask you are looking at linkable and
  // reloadable while you are already typing the next one.
  const [draft, setDraft] = useState<AskIntent>(applied);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [composer, setComposer] = useState<ComposerContext | null>(null);
  const [logging, setLogging] = useState<{ personId: string; personName: string } | null>(null);
  const qc = useQueryClient();

  const history = useQuery({
    queryKey: ['ask-history'],
    queryFn: () => api.get<AskHistory>('/ask/history'),
  });

  // A query, not a hand-rolled busy/error/results triple: the ranking is a
  // function of the intent in the URL, so landing on a link runs it, the back
  // button works, and a slow answer can no longer overwrite a newer one.
  const ranking = useQuery({
    queryKey: ['ask-people', applied.need, applied.org, applied.topics, applied.city],
    queryFn: async () => {
      const res = await api.post<{ results: Ranked[] }>('/ask/people', {
        need: applied.need,
        topics: applied.topics,
        org: applied.org || undefined,
        city: applied.city || undefined,
      });
      // The ask is remembered server-side, so the recall chips are stale the
      // moment a new one runs.
      await qc.invalidateQueries({ queryKey: ['ask-history'] });
      return res;
    },
    enabled: askable,
  });

  function ask(next: AskIntent) {
    setDraft(next);
    setExpanded(null);
    setParams(intentToParams(next), { replace: true });
  }

  const results = ranking.data?.results ?? [];
  // Widths are drawn against the leader so the bars compare across cards
  // rather than each stretching to fill its own row.
  const topScore = Math.max(0.001, ...results.map((r) => r.score));
  const weakLead = results.length > 0 && !matchedTheAsk(results[0]!.chips);

  return (
    <div className="page page--network page--network-intelligence">
      <div className="network-intelligence__head">
        <PageHeader
          title="Who should I call?"
          subtitle="Turn one concrete need into a ranked, explainable contact list."
          help={
            <InfoPopover title="How ranking works">
              <p>
                Say what you need. Vitae ranks the people best placed to help, and shows what each
                rank is made of: affiliation, topics, tie strength, geography, favors owed, and
                network proximity.
              </p>
              <p>
                The bar is the shape of the score: one wide segment means one dominant reason, while
                several segments mean the case rests on several recorded facts. Weights are yours to
                set in Settings.
              </p>
            </InfoPopover>
          }
        />
        <nav className="network-lenses" aria-label="Network intelligence lens">
          <Link
            className="network-lenses__item"
            aria-current="page"
            to={contactLensHref(applied, askable)}
          >
            Who to contact
          </Link>
          <Link className="network-lenses__item" to={reachLensHref(applied.org)}>
            Warm paths
          </Link>
        </nav>
      </div>
      <RegisterRule />

      {/* The intent reads as a sentence, so the fields are sized to their
          content and sit inline. Each one is wrapped: `.vt-inp` is width:100%
          and unlayered, so it beats any width utility put on the input itself
          :  the span is what actually carries the size. */}
      <form
        role="search"
        className="network-ask"
        aria-label="Describe who you need to contact"
        onSubmit={(event) => {
          event.preventDefault();
          ask(draft);
        }}
      >
        <label htmlFor="ask-need" className="text-sm text-muted">
          I need
        </label>
        <span className="w-36">
          <Select
            id="ask-need"
            value={draft.need}
            onChange={(v) => setDraft({ ...draft, need: v ?? 'referral' })}
            options={NEEDS.map((n) => ({ value: n, label: n }))}
            clearable={false}
          />
        </span>

        <label htmlFor="ask-org" className="text-sm text-muted">
          at
        </label>
        <span className="w-52">
          <Input
            id="ask-org"
            aria-label="Organization"
            placeholder="any organization"
            value={draft.org}
            onChange={(e) => setDraft({ ...draft, org: e.target.value })}
          />
        </span>

        <label htmlFor="ask-topics" className="text-sm text-muted">
          about
        </label>
        <span className="w-64">
          <Input
            id="ask-topics"
            aria-label="Topics"
            placeholder="reinforcement learning, hiring…"
            value={draft.topics}
            onChange={(e) => setDraft({ ...draft, topics: e.target.value })}
          />
        </span>

        <label htmlFor="ask-city" className="text-sm text-muted">
          in
        </label>
        <span className="w-40">
          <Input
            id="ask-city"
            aria-label="City"
            placeholder="city (optional)"
            value={draft.city}
            onChange={(e) => setDraft({ ...draft, city: e.target.value })}
          />
        </span>

        <Button type="submit" variant="primary" glyph="ask" disabled={ranking.isFetching}>
          {ranking.isFetching ? 'Ranking…' : 'Ask'}
        </Button>
      </form>

      {/* A failed history is worth one line and nothing more, it costs you the
          shortcuts, not the ability to ask. */}
      {history.isLoading && (
        <StatusTrace
          className="network-secondary-state"
          tone="neutral"
          label="Loading recent asks"
          detail="The contact lens is ready"
        />
      )}
      {history.isError && (
        <Banner
          className="network-secondary-state"
          tone="danger"
          title="Recent asks could not be loaded"
          action={
            <Button size="sm" onClick={() => void history.refetch()}>
              Retry history
            </Button>
          }
        >
          Ranking still works; only the recall shortcuts are unavailable.
        </Banner>
      )}
      {(history.data?.asks.length ?? 0) > 0 && (
        <div className="network-recall" aria-label="Recent asks">
          <span className="network-recall__label">Recent asks</span>
          {history.data!.asks.map((a) => (
            <button
              key={a.label}
              type="button"
              className="u-mono network-recall__item"
              onClick={() =>
                ask({
                  need: a.intent.need ?? 'referral',
                  org: a.intent.org ?? '',
                  topics: a.intent.terms.join(', '),
                  city: a.intent.city ?? '',
                })
              }
            >
              {a.label}
            </button>
          ))}
        </div>
      )}

      {!askable ? (
        <EmptyState
          className="network-intelligence__empty"
          glyph="ask"
          title="Nothing asked yet"
          hint="Say what you need and who it is about: “referral at Nile Robotics about reinforcement learning”, then press Ask. Every result comes back with the reasons it ranked where it did."
        />
      ) : (
        <Section title="Ranked contacts" meta={ranking.data ? results.length : undefined}>
          {ranking.isFetching && ranking.data && (
            <StatusTrace
              className="network-trace"
              tone="live"
              label="Re-ranking your network"
              detail="Keeping the current evidence visible"
            />
          )}
          {ranking.isError && ranking.data && (
            <Banner
              className="network-secondary-state"
              tone="danger"
              title="The latest ranking could not be loaded"
              action={
                <Button size="sm" onClick={() => void ranking.refetch()}>
                  Retry ranking
                </Button>
              }
            >
              Showing the last completed ranking and its recorded evidence.
            </Banner>
          )}
          {ranking.isError && !ranking.data ? (
            <ErrorState
              title="Couldn’t rank anyone"
              detail={(ranking.error as Error | null)?.message}
              onRetry={() => void ranking.refetch()}
            />
          ) : ranking.isLoading ? (
            <SkeletonRows rows={4} />
          ) : results.length === 0 ? (
            <EmptyState
              glyph="ask"
              title="No one to call"
              hint="Nobody in the graph matched. People become rankable once they have a tie to you, topics on that tie, or a role at the organization you named."
              action={
                <Link className="vt-btn vt-btn--sm" to="/network/people">
                  Open People
                </Link>
              }
            />
          ) : (
            <>
              {weakLead && (
                <Banner tone="warning" title="No contact matched the intent">
                  The people below rank on relationship strength, not the organization, topic, or
                  city you named. Try a broader organization or topic before acting on this order.
                </Banner>
              )}
              {results.map((r, i) => {
                const isOpen = expanded === r.id;
                const detailId = `ask-contact-${r.id}`;
                const contributing = r.chips.filter((c) => c.weighted > 0);
                const parts = r.chips
                  .filter((c) => c.weighted > 0)
                  .map((c) => ({ label: factorLabel(c), value: c.weighted }));
                return (
                  <article key={r.id} className="network-result">
                    <button
                      type="button"
                      className="network-result__trigger"
                      onClick={() => setExpanded(isOpen ? null : r.id)}
                      aria-expanded={isOpen}
                      aria-controls={detailId}
                      aria-label={`${isOpen ? 'Close' : 'Open'} contact dossier for ${r.title}, rank ${i + 1}`}
                    >
                      <span className="network-result__identity">
                        <Mono className="network-result__rank">#{i + 1}</Mono>
                        <EntityGlyph type="person" size="sm" />
                        <span className="network-result__person">
                          <span className="network-result__name">{r.title}</span>
                          {(r.headline || r.city) && (
                            <span className="network-result__meta">
                              {[r.headline, r.city].filter(Boolean).join(' · ')}
                            </span>
                          )}
                        </span>
                        <span className="network-result__score">
                          <small>score</small>
                          <Mono>{r.score.toFixed(2)}</Mono>
                        </span>
                      </span>

                      <span className="network-result__bar">
                        <FactorBar
                          parts={parts}
                          scale={topScore}
                          label={`Score ${r.score.toFixed(2)}`}
                        />
                      </span>

                      {/* Ordered by contribution, so the chips read in the same
                          order as the segments above them. Not sliced: the old
                          card showed five of up to seven factors, which quietly
                          removed part of the explanation it promised. */}
                      <span className="network-result__factors">
                        {parts
                          .slice()
                          .sort((a, b) => b.value - a.value)
                          .map((p, pi) => (
                            <Chip
                              key={pi}
                              mono
                              title={`${p.label} contributes ${p.value.toFixed(2)} score units`}
                            >
                              {p.label} +{p.value.toFixed(2)}
                            </Chip>
                          ))}
                      </span>

                      {/* Evidence is what the ranker actually matched on, and it
                          used to sit in the same chip style as the factors :
                          two different kinds of claim wearing one costume. */}
                      {r.topEvidence.length > 0 && (
                        <span className="network-result__matched">
                          Evidence matched{' '}
                          <span className="u-mono">{r.topEvidence.join(' · ')}</span>
                        </span>
                      )}
                      <span className="network-result__toggle">
                        {isOpen ? 'Close dossier' : 'Open dossier'}
                      </span>
                    </button>

                    {isOpen && (
                      <div id={detailId} className="network-result__detail">
                        <section
                          className="network-factor-evidence"
                          aria-label={`Why ${r.title} ranked ${i + 1}`}
                        >
                          <h3>Why this rank</h3>
                          <dl>
                            {contributing.map((factor, factorIndex) => (
                              <div key={`${factor.factor}-${factorIndex}`}>
                                <dt>{factorLabel(factor)}</dt>
                                <dd>
                                  <Mono>+{factor.weighted.toFixed(2)}</Mono>
                                  <span>{factorExplanation(factor)}</span>
                                </dd>
                              </div>
                            ))}
                          </dl>
                        </section>
                        {r.pack && r.pack.interactions.length > 0 && (
                          <Section title="Recent">
                            <ul className="m-0 list-none p-0">
                              {r.pack.interactions.map((ix) => (
                                <li key={ix.id} className="py-1 text-sm">
                                  <Link to={entityHref('interaction', ix.id)}>
                                    {ix.kind ? `${ix.kind} · ` : ''}
                                    {ix.title}
                                  </Link>
                                  {ix.date && (
                                    <Mono className="text-xs text-faint"> {ix.date}</Mono>
                                  )}
                                </li>
                              ))}
                            </ul>
                          </Section>
                        )}
                        {r.pack && r.pack.followUps.length > 0 && (
                          <Section title="Open follow-ups">
                            <ul className="m-0 list-none p-0">
                              {r.pack.followUps.map((f, fi) => (
                                <li key={fi} className="py-1 text-sm text-ink">
                                  {f.what}
                                  {f.due && <Mono className="text-xs text-faint"> · {f.due}</Mono>}
                                </li>
                              ))}
                            </ul>
                          </Section>
                        )}
                        {r.pack && r.pack.shared.length > 0 && (
                          <Section title="Shared">
                            <div className="flex flex-wrap gap-2">
                              {r.pack.shared.map((s) => (
                                <Link key={s.id} className="text-sm" to={entityHref(s.type, s.id)}>
                                  {s.title}
                                </Link>
                              ))}
                            </div>
                          </Section>
                        )}
                        {r.pack && r.pack.topics.length > 0 && (
                          <Section title="Talking points">
                            <div className="flex flex-wrap gap-2">
                              {r.pack.topics.map((t, ti) => (
                                <Chip key={ti} mono>
                                  {t}
                                </Chip>
                              ))}
                            </div>
                          </Section>
                        )}

                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <Button
                            size="sm"
                            variant="primary"
                            onClick={() =>
                              setComposer({
                                personId: r.id,
                                personName: r.title,
                                kind:
                                  applied.need === 'intro'
                                    ? 'intro'
                                    : applied.need === 'referral'
                                      ? 'referral'
                                      : 'explore',
                                targetOrgName: applied.org || undefined,
                              })
                            }
                          >
                            Draft the ask
                          </Button>
                          {/* Was a second link to the profile wearing this label
                              :  a control that named an action it did not
                              perform. It opens the logger now. */}
                          <Button
                            size="sm"
                            onClick={() => setLogging({ personId: r.id, personName: r.title })}
                          >
                            Log outreach
                          </Button>
                          <Link className="text-sm" to={entityHref('person', r.id)}>
                            Open profile
                          </Link>
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </>
          )}
        </Section>
      )}

      {composer && <Composer ctx={composer} onClose={() => setComposer(null)} />}
      {logging && (
        <InteractionLogger
          personId={logging.personId}
          personName={logging.personName}
          onClose={() => setLogging(null)}
        />
      )}
    </div>
  );
}
