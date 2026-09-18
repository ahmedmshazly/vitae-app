import { Link } from 'react-router-dom';
import { Button, Chip, EntityGlyph, FactorBar, Mono, Section } from '@vitae/ui';
import { entityHref } from '../lib/entity-href.js';
import { WRITE_LOCK_HINT } from '../lib/auth.js';
import type { ComposerContext } from './Composer.js';

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

export interface Ranked {
  id: string;
  title: string;
  score: number;
  chips: FactorChipData[];
  topEvidence: string[];
  headline?: string | null;
  city?: string | null;
  pack?: AskPack;
}

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
      return 'A recorded role links this person to the organization you named.';
    case 'topic':
      return 'Recorded topics, skills, projects or interaction notes overlap what you named.';
    case 'geo':
      return 'Their recorded location matches the city in this ask.';
    case 'strength':
      return 'Your relationship strength makes this person easier to approach.';
    case 'graph':
      return 'They sit close to you in the recorded relationship network.';
    case 'reciprocity':
      return c.weighted < 0
        ? 'Recent asking activity reduces this score.'
        : 'An unsettled favor owed to you contributes to this score.';
    case 'pinned':
      return 'You previously marked this person as important.';
    default:
      return `A recorded ${factorLabel(c)} signal contributed to this rank.`;
  }
}

export function AskResult({
  r,
  i,
  topScore,
  constrained,
  isOpen,
  onToggle,
  canWrite,
  applied,
  setComposer,
  setLogging,
}: {
  r: Ranked;
  i: number;
  topScore: number;
  constrained: boolean;
  isOpen: boolean;
  onToggle: () => void;
  canWrite: boolean;
  applied: { need: string; org: string };
  setComposer: (context: ComposerContext) => void;
  setLogging: (person: { personId: string; personName: string }) => void;
}) {
  const detailId = `ask-contact-${r.id}`;
  const contributing = r.chips.filter((c) => c.weighted !== 0);
  const parts = r.chips
    .filter((c) => c.weighted > 0)
    .map((c) => ({ label: factorLabel(c), value: c.weighted }));
  return (
    <article key={r.id} className="network-result">
      <button
        type="button"
        className="network-result__trigger"
        onClick={onToggle}
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
          <FactorBar parts={parts} scale={topScore} label={`Score ${r.score.toFixed(2)}`} />
        </span>
        {contributing.some((factor) => factor.weighted < 0) && (
          <span className="network-result__matched">
            The bar shows positive signals. Deductions are listed below.
          </span>
        )}

        {/* Ordered by contribution, so the chips read in the same
                          order as the segments above them. Not sliced: the old
                          card showed five of up to seven factors, which quietly
                          removed part of the explanation it promised. */}
        <span className="network-result__factors">
          {contributing
            .map((factor) => ({ label: factorLabel(factor), value: factor.weighted }))
            .sort((a, b) => b.value - a.value)
            .map((p, pi) => (
              <Chip
                key={pi}
                mono
                title={`${p.label} contributes ${p.value.toFixed(2)} score units`}
              >
                {p.label} {p.value > 0 ? '+' : ''}
                {p.value.toFixed(2)}
              </Chip>
            ))}
        </span>

        {/* Evidence is what the ranker actually matched on, and it
                          used to sit in the same chip style as the factors :
                          two different kinds of claim wearing one costume. */}
        {r.topEvidence.length > 0 && (
          <span className="network-result__matched">
            Evidence matched <span className="u-mono">{r.topEvidence.join(' · ')}</span>
          </span>
        )}
        {constrained && (
          <span className="contact-match">
            {matchedTheAsk(r.chips) ? 'Matches part of your request' : 'Relationship context only'}
          </span>
        )}
        <span className="network-result__toggle">{isOpen ? 'Close dossier' : 'Open dossier'}</span>
      </button>

      {isOpen && (
        <div id={detailId} className="network-result__detail">
          <section
            className="network-factor-evidence"
            aria-label={`Why ${r.title} ranked ${i + 1}`}
          >
            <h3>Why this rank</h3>
            {contributing.length === 0 && <p>No nonzero scoring signals were returned.</p>}
            <dl>
              {contributing.map((factor, factorIndex) => (
                <div key={`${factor.factor}-${factorIndex}`}>
                  <dt>{factorLabel(factor)}</dt>
                  <dd>
                    <Mono>
                      {factor.weighted > 0 ? '+' : ''}
                      {factor.weighted.toFixed(2)}
                    </Mono>
                    <span>{factorExplanation(factor)}</span>
                  </dd>
                </div>
              ))}
            </dl>
          </section>
          {r.pack && r.pack.interactions.length > 0 && (
            <Section title="Recent interactions">
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
            <Section title="Recorded follow-ups">
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
            <Section title="Related records">
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

          {!r.pack && (
            <p>
              Additional context was not returned. Open the profile to review this person’s records.
            </p>
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
              disabled={!canWrite}
              title={!canWrite ? WRITE_LOCK_HINT : undefined}
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
}
