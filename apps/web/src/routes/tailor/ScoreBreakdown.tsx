import { Chip, FactorChip, Mono, Popover } from '@vitae/ui';
import type { AtomScore } from './types.js';

interface Props {
  score: AtomScore;
}

function fmt(n: number): string {
  return n.toFixed(2);
}

/** The two multipliers, with the formula each one comes from. */
const MULTIPLIERS = [
  {
    key: 'recency',
    label: 'recency',
    formula: 'exp(−years / 8), floor 0.35',
    read: (score: AtomScore) => score.recency,
  },
  {
    key: 'metrics',
    label: 'metrics',
    formula: '1 + 0.15 · min(metrics, 2)',
    read: (score: AtomScore) => score.metricBonus,
  },
];

/**
 * Clickable score with a popover that decomposes FR-RES-007 atom scoring:
 *   score = relevance(Σ weight·hit) × recency × metricBonus
 * Contributions shown sum exactly to the displayed score.
 *
 * Both multipliers used to be hand-written `.vt-factor` markup, the private
 * internals of the FactorChip this file imports and uses correctly for the
 * keyword hits, forked only because these are multipliers rather than addends.
 * They are ordinary chips now, and their formulas are printed rather than
 * hidden in a `title` on a span nothing can focus: the popover exists to
 * explain the number, so the explanation should not itself need a hover.
 */
export function ScoreBreakdown({ score }: Props) {
  const product = score.relevance * score.recency * score.metricBonus;
  // Displayed score is rounded server-side; show the same digits as the chip.
  const display = fmt(score.score);

  return (
    <Popover
      side="left"
      align="start"
      wide
      trigger={
        <button
          type="button"
          className="atom-score-trigger"
          title="Score breakdown"
          aria-label={`Score ${display}, show breakdown`}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <Mono>{display}</Mono>
        </button>
      }
    >
      <div className="atom-score-pop">
        <div className="atom-score-pop__head">
          <h3 className="atom-score-pop__title">Score breakdown</h3>
          <Mono className="atom-score-pop__total">{display}</Mono>
        </div>
        <p className="atom-score-pop__eq u-faint">relevance × recency × metrics = score</p>

        <div className="atom-score-pop__section">
          <div className="atom-score-pop__label">
            Keyword hits → relevance {fmt(score.relevance)}
          </div>
          {score.hits.length === 0 ? (
            <div className="text-xs text-faint">No keyword matches</div>
          ) : (
            <ul className="atom-score-pop__hits" aria-label="Keyword hits">
              {score.hits.map((hit) => (
                <li key={`${hit.term}-${hit.via}`} className="atom-score-pop__row">
                  <span className="atom-score-pop__term">{hit.term}</span>
                  <Chip mono>{hit.via === 'skill' ? 'skill' : 'text'}</Chip>
                  <FactorChip
                    label={`${hit.weight.toFixed(2)}×${hit.hit}`}
                    value={hit.contribution}
                    detail={`weight ${hit.weight} · hit ${hit.hit} (${hit.via})`}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="atom-score-pop__section">
          <div className="atom-score-pop__label">Multipliers</div>
          <ul className="atom-score-pop__factors" aria-label="Score multipliers">
            {MULTIPLIERS.map((factor) => (
              <li key={factor.key} className="atom-score-pop__factor">
                <Chip mono>
                  {factor.label} ×{fmt(factor.read(score))}
                </Chip>
                <span className="atom-score-pop__formula u-mono">{factor.formula}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="atom-score-pop__check u-mono">
          {fmt(score.relevance)} × {fmt(score.recency)} × {fmt(score.metricBonus)} = {fmt(product)}
          {Math.abs(product - score.score) > 0.001 ? (
            <span className="u-faint"> → {display}</span>
          ) : null}
        </div>
      </div>
    </Popover>
  );
}
