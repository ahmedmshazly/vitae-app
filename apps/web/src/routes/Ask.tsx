/**
 * Who Should I Call (SRS P08, FR-CON-006/007). Explainable, deterministic.
 */
import { useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Banner,
  Button,
  EmptyState,
  ErrorState,
  Field,
  InfoPopover,
  Input,
  PageHeader,
  RegisterRule,
  Section,
  Select,
  SkeletonRows,
  StatusTrace,
} from '@vitae/ui';
import { AskResult, matchedTheAsk, type Ranked } from '../features/AskResult.js';
export { matchedTheAsk, factorLabel, factorExplanation } from '../features/AskResult.js';
import { api } from '../lib/api.js';
import { Composer, type ComposerContext } from '../features/Composer.js';
import { InteractionLogger } from '../features/InteractionLogger.js';
import { useCanWrite, WRITE_LOCK_HINT } from '../lib/auth.js';

interface AskHistory {
  asks: Array<{
    label: string;
    intent: { need?: string; org?: string; city?: string; terms: string[] };
  }>;
}

const NEEDS = ['referral', 'intro', 'advice', 'a favor', 'feedback'];

export interface AskIntent {
  need: string;
  org: string;
  topics: string;
  city: string;
}

export function intentFromParams(params: URLSearchParams): AskIntent {
  return {
    need: NEEDS.includes(params.get('need') ?? '') ? params.get('need')! : 'referral',
    org: params.get('org')?.trim() || '',
    topics: params.get('topics')?.trim() || '',
    city: params.get('city')?.trim() || '',
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
    params.get('org')?.trim() ||
    params.get('topics')?.trim() ||
    params.get('city')?.trim() ||
    params.get('run') === '1',
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

/** Who Should I Call, intent in, ranked people out, every rank explained. */
export function Ask() {
  const location = useLocation();
  return <ContactScreen key={location.key} />;
}

function ContactScreen() {
  const canWrite = useCanWrite();
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
    queryFn: async () => {
      const result = await api.get<AskHistory>('/ask/history');
      if (
        !Array.isArray(result.asks) ||
        result.asks.some(
          (ask) =>
            !ask ||
            typeof ask.label !== 'string' ||
            !ask.intent ||
            !Array.isArray(ask.intent.terms) ||
            ask.intent.terms.some((term) => typeof term !== 'string') ||
            [ask.intent.need, ask.intent.org, ask.intent.city].some(
              (value) => value != null && typeof value !== 'string',
            ),
        )
      )
        throw new Error('Recent asks were not returned. Try again.');
      return result;
    },
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
      if (
        !Array.isArray(res.results) ||
        res.results.some(
          (person) =>
            !person.id ||
            typeof person.title !== 'string' ||
            !Number.isFinite(person.score) ||
            !Array.isArray(person.chips) ||
            person.chips.some((chip) => !Number.isFinite(chip.weighted)) ||
            !Array.isArray(person.topEvidence) ||
            (person.pack &&
              [
                person.pack.interactions,
                person.pack.followUps,
                person.pack.shared,
                person.pack.topics,
              ].some((value) => !Array.isArray(value))),
        )
      )
        throw new Error('The ranking was incomplete. Try again.');
      void qc.invalidateQueries({ queryKey: ['ask-history'] });
      return res;
    },
    enabled: askable,
  });

  function ask(next: AskIntent) {
    const normalized = {
      need: NEEDS.includes(next.need) ? next.need : 'referral',
      org: next.org.trim(),
      topics: next.topics.trim(),
      city: next.city.trim(),
    };
    setDraft(normalized);
    setExpanded(null);
    if (askable && JSON.stringify(normalized) === JSON.stringify(applied)) void ranking.refetch();
    else setParams(intentToParams(normalized));
  }

  const results = ranking.data?.results ?? [];
  // Widths are drawn against the leader so the bars compare across cards
  // rather than each stretching to fill its own row.
  const topScore = Math.max(
    0.001,
    ...results.map((r) => r.chips.reduce((sum, chip) => sum + Math.max(0, chip.weighted), 0)),
  );
  const constrained = Boolean(applied.org || applied.topics || applied.city);
  const matches = results.filter((result) => matchedTheAsk(result.chips)).length;
  const weakLead = constrained && results.length > 0 && matches === 0;
  const draftChanged = JSON.stringify(draft) !== JSON.stringify(applied);

  return (
    <div className="page page--network page--network-intelligence page--contact-ranking">
      <div className="network-intelligence__head">
        <PageHeader
          title="Who to contact"
          subtitle="Turn one concrete need into a ranked, explainable contact list."
          help={
            <InfoPopover title="How ranking works">
              <p>
                Describe your request. Vitae shows up to ten eligible contacts and explains what
                each rank is made of: affiliation, topics, tie strength, geography, favors owed, and
                network proximity.
              </p>
              <p>
                The bar shows positive contributions; wider segments contribute more. Deductions are
                listed separately below the bar. You can adjust weights in Settings. A score is a
                comparison, not a probability of a reply.
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

      <form
        role="search"
        className="contact-query"
        aria-label="Describe who you need to contact"
        onSubmit={(event) => {
          event.preventDefault();
          ask(draft);
        }}
      >
        <Field label="I need" htmlFor="ask-need">
          <Select
            id="ask-need"
            value={draft.need}
            onChange={(value) => setDraft({ ...draft, need: value ?? 'referral' })}
            options={NEEDS.map((need) => ({ value: need, label: need }))}
            clearable={false}
          />
        </Field>
        <Field label="Organization" htmlFor="ask-org">
          <Input
            id="ask-org"
            placeholder="Any organization"
            value={draft.org}
            onChange={(event) => setDraft({ ...draft, org: event.target.value })}
          />
        </Field>
        <Field label="Topics" htmlFor="ask-topics">
          <Input
            id="ask-topics"
            aria-describedby="ask-query-hint"
            placeholder="Research, hiring…"
            value={draft.topics}
            onChange={(event) => setDraft({ ...draft, topics: event.target.value })}
          />
        </Field>
        <Field label="City" htmlFor="ask-city">
          <Input
            id="ask-city"
            placeholder="Any city"
            value={draft.city}
            onChange={(event) => setDraft({ ...draft, city: event.target.value })}
          />
        </Field>
        <div className="contact-query__footer">
          <p id="ask-query-hint">
            Organization, topics and city are optional. Separate topics with commas. Rankings use
            your recorded evidence.
          </p>
          <Button type="submit" variant="primary" glyph="ask" disabled={ranking.isFetching}>
            {ranking.isFetching ? 'Ranking…' : 'Rank contacts'}
          </Button>
        </div>
      </form>
      {askable && (
        <p className="contact-query-summary">
          <strong>Results for:</strong>{' '}
          {[
            applied.need,
            applied.org && `at ${applied.org}`,
            applied.topics && `about ${applied.topics}`,
            applied.city && `in ${applied.city}`,
          ]
            .filter(Boolean)
            .join(' · ')}
          {draftChanged && <span role="status"> Your changes have not been ranked yet.</span>}
        </p>
      )}

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
          title={
            history.data ? 'Recent asks could not be refreshed' : 'Recent asks could not be loaded'
          }
          action={
            <Button size="sm" disabled={history.isFetching} onClick={() => void history.refetch()}>
              Retry history
            </Button>
          }
        >
          {history.data
            ? 'Showing the last available shortcuts. Ranking still works.'
            : 'Ranking still works; only the recall shortcuts are unavailable.'}
        </Banner>
      )}
      {(history.data?.asks.length ?? 0) > 0 && (
        <div className="network-recall" aria-label="Recent asks">
          <span className="network-recall__label">Recent asks</span>
          {history.data!.asks.slice(0, 5).map((a) => (
            <button
              key={a.label}
              type="button"
              className="network-recall__item"
              disabled={ranking.isFetching}
              onClick={() =>
                ask({
                  need: a.intent.need ?? 'referral',
                  org: a.intent.org ?? '',
                  topics: (a.intent.terms ?? []).join(', '),
                  city: a.intent.city ?? '',
                })
              }
            >
              {[a.label, a.intent.city && `in ${a.intent.city}`].filter(Boolean).join(' · ')}
            </button>
          ))}
        </div>
      )}

      {!askable ? (
        <EmptyState
          className="network-intelligence__empty"
          glyph="ask"
          title="Nothing asked yet"
          hint="Choose what you need, add any organization, topics or city, then rank your contacts. Open a result to review its evidence before reaching out."
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
                <Button
                  size="sm"
                  disabled={ranking.isFetching}
                  onClick={() => void ranking.refetch()}
                >
                  Retry ranking
                </Button>
              }
            >
              Showing the last completed ranking and its recorded evidence.
            </Banner>
          )}
          {ranking.isError && !ranking.data ? (
            <ErrorState
              title="Couldn't rank anyone"
              detail={(ranking.error as Error | null)?.message}
              onRetry={() => void ranking.refetch()}
              retrying={ranking.isFetching}
            />
          ) : ranking.isLoading ? (
            <SkeletonRows rows={4} label="Ranking contacts" />
          ) : results.length === 0 ? (
            <EmptyState
              glyph="ask"
              title="No one to call"
              hint="There are no eligible people to rank. Add people and their relationship context. People marked Do not contact are excluded."
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
                  The people below have no positive match for the organization, topic, or city you
                  named. Their order reflects relationship context. Try broader criteria before
                  acting on this order.
                </Banner>
              )}
              {constrained && matches > 0 && !matchedTheAsk(results[0]!.chips) && (
                <Banner tone="warning" title="The first contact has no request-specific match">
                  Other contacts below match part of your request. Compare the evidence, not just
                  the overall score.
                </Banner>
              )}
              <p className="contact-ranking-note">
                Up to ten contacts, ordered by the current ranking weights. Scores compare recorded
                signals; they do not predict a response.
              </p>
              {!canWrite && <p role="status">{WRITE_LOCK_HINT}</p>}
              {results.map((r, i) => (
                <AskResult
                  key={r.id}
                  r={r}
                  i={i}
                  topScore={topScore}
                  constrained={constrained}
                  isOpen={expanded === r.id}
                  onToggle={() => setExpanded(expanded === r.id ? null : r.id)}
                  canWrite={canWrite}
                  applied={applied}
                  setComposer={setComposer}
                  setLogging={setLogging}
                />
              ))}
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
