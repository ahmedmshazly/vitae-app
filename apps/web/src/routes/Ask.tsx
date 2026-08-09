/**
 * Who Should I Call (SRS P08, FR-CON-006/007). Explainable, deterministic.
 */
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
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
  asks: Array<{ label: string; intent: { need?: string; org?: string; city?: string; terms: string[] } }>;
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
  return Boolean(params.get('org') || params.get('topics') || params.get('city') || params.get('run') === '1');
}

export function intentToParams(intent: AskIntent): URLSearchParams {
  const q = new URLSearchParams();
  if (intent.need) q.set('need', intent.need);
  if (intent.org) q.set('org', intent.org);
  if (intent.topics) q.set('topics', intent.topics);
  if (intent.city) q.set('city', intent.city);
  // Marks "the user asked for this", so an intent that is nothing but the
  // default need still runs, and still survives a reload.
  q.set('run', '1');
  return q;
}

/** The human-readable name of a factor, preferring whatever the ranker said. */
export function factorLabel(c: FactorChipData): string {
  if (c.detail) return c.detail;
  if (c.factor === 'graph') return 'network proximity';
  if (c.factor === 'reciprocity') return 'favors';
  return c.factor;
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
    <div className="page">
      <PageHeader
        title="Who should I call?"
        subtitle="Intent in · ranked people out · every score explained."
        help={
          <InfoPopover title="How ranking works">
            <p>
              Say what you need. Vitae ranks the people best placed to help, and shows what each rank is made of:
              affiliation, topics, tie strength, geography, favors owed, and network proximity.
            </p>
            <p>
              The bar is the shape of the score, one wide segment means one reason, several means a rounder case. The
              numbers beside it are the same factors in score units. Weights are yours to set, in Settings.
            </p>
          </InfoPopover>
        }
      />
      <RegisterRule />

      {/* The intent reads as a sentence, so the fields are sized to their
          content and sit inline. Each one is wrapped: `.vt-inp` is width:100%
          and unlayered, so it beats any width utility put on the input itself
          :  the span is what actually carries the size. */}
      <div role="search" className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
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
            onKeyDown={(e) => e.key === 'Enter' && ask(draft)}
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
            onKeyDown={(e) => e.key === 'Enter' && ask(draft)}
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
            onKeyDown={(e) => e.key === 'Enter' && ask(draft)}
          />
        </span>

        <Button variant="primary" glyph="ask" disabled={ranking.isFetching} onClick={() => ask(draft)}>
          {ranking.isFetching ? 'Ranking…' : 'Ask'}
        </Button>
      </div>

      {/* A failed history is worth one line and nothing more, it costs you the
          shortcuts, not the ability to ask. */}
      {history.isError && (
        <p role="alert" className="mb-3 text-sm text-danger">
          <strong className="font-semibold">Couldn’t load your recent asks.</strong> Asking still works.
        </p>
      )}
      {(history.data?.asks.length ?? 0) > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-xs text-faint">recall</span>
          {history.data!.asks.map((a) => (
            <button
              key={a.label}
              type="button"
              className="u-mono cursor-pointer rounded border border-hairline bg-surface px-2 py-1 text-xs text-ink-soft hover:border-strong"
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
          glyph="ask"
          title="Nothing asked yet"
          hint="Say what you need and who it is about: “referral at Nile Robotics about reinforcement learning”, then press Ask. Every result comes back with the reasons it ranked where it did."
        />
      ) : (
        <Section title="Ranked" meta={ranking.data ? results.length : undefined}>
          {ranking.isError ? (
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
                <Link className="vt-btn vt-btn--sm" to="/people">
                  Open People
                </Link>
              }
            />
          ) : (
            <>
              {weakLead && (
                <p role="status" className="mb-3 text-sm text-ink-soft">
                  <strong className="font-semibold">Nobody matched what you asked for.</strong> These are ranked on how
                  well you know them, not on the organization, topic or city, no one carries an affiliation or topic
                  that answers this ask. Try naming a different organization or topic.
                </p>
              )}
              {results.map((r, i) => {
                const isOpen = expanded === r.id;
                const parts = r.chips
                  .filter((c) => c.weighted > 0)
                  .map((c) => ({ label: factorLabel(c), value: c.weighted }));
                return (
                  <article key={r.id} className="border-b border-hairline py-3 last:border-b-0">
                    <button
                      type="button"
                      className="w-full cursor-pointer border-0 bg-transparent p-0 text-left"
                      onClick={() => setExpanded(isOpen ? null : r.id)}
                      aria-expanded={isOpen}
                    >
                      <span className="flex items-center gap-3">
                        <Mono className="text-xs text-faint">#{i + 1}</Mono>
                        <EntityGlyph type="person" size="sm" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-base text-ink">{r.title}</span>
                          {(r.headline || r.city) && (
                            <span className="block truncate text-xs text-muted">
                              {[r.headline, r.city].filter(Boolean).join(' · ')}
                            </span>
                          )}
                        </span>
                        <Mono className="text-md text-ink">{r.score.toFixed(2)}</Mono>
                      </span>

                      <span className="mt-2 block">
                        <FactorBar parts={parts} scale={topScore} label={`Score ${r.score.toFixed(2)}`} />
                      </span>

                      {/* Ordered by contribution, so the chips read in the same
                          order as the segments above them. Not sliced: the old
                          card showed five of up to seven factors, which quietly
                          removed part of the explanation it promised. */}
                      <span className="mt-2 flex flex-wrap gap-2">
                        {parts
                          .slice()
                          .sort((a, b) => b.value - a.value)
                          .map((p, pi) => (
                            <Chip key={pi} mono>
                              {p.label} +{p.value.toFixed(2)}
                            </Chip>
                          ))}
                      </span>

                      {/* Evidence is what the ranker actually matched on, and it
                          used to sit in the same chip style as the factors :
                          two different kinds of claim wearing one costume. */}
                      {r.topEvidence.length > 0 && (
                        <span className="mt-2 block text-xs text-muted">
                          matched on <span className="u-mono text-ink-soft">{r.topEvidence.join(' · ')}</span>
                        </span>
                      )}
                    </button>

                    {isOpen && (
                      <div className="mt-3 border-l border-hairline pl-4">
                        {r.pack && r.pack.interactions.length > 0 && (
                          <Section title="Recent">
                            <ul className="m-0 list-none p-0">
                              {r.pack.interactions.map((ix) => (
                                <li key={ix.id} className="py-1 text-sm">
                                  <Link to={entityHref('interaction', ix.id)}>
                                    {ix.kind ? `${ix.kind} · ` : ''}
                                    {ix.title}
                                  </Link>
                                  {ix.date && <Mono className="text-xs text-faint"> {ix.date}</Mono>}
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
                                kind: applied.need === 'intro' ? 'intro' : applied.need === 'referral' ? 'referral' : 'explore',
                                targetOrgName: applied.org || undefined,
                              })
                            }
                          >
                            Draft the ask
                          </Button>
                          {/* Was a second link to the profile wearing this label
                              :  a control that named an action it did not
                              perform. It opens the logger now. */}
                          <Button size="sm" onClick={() => setLogging({ personId: r.id, personName: r.title })}>
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
