import { Chip, FactorChip, Mono, Popover } from '@vitae/ui';
import type { AtomScore } from './types.js';

interface Props {
  score: AtomScore;
}

function fmt(n: number): string {
  return n.toFixed(2);
}

/**
 * Clickable score with a popover that decomposes FR-RES-007 atom scoring:
 *   score = relevance(Σ weight·hit) × recency × metricBonus
 * Contributions shown sum exactly to the displayed score.
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
          <span className="atom-score-pop__title">Score breakdown</span>
          <Mono className="atom-score-pop__total">{display}</Mono>
        </div>
        <p className="atom-score-pop__eq u-faint">
          relevance × recency × metrics = score
        </p>

        <div className="atom-score-pop__section">
          <div className="atom-score-pop__label">Keyword hits → relevance {fmt(score.relevance)}</div>
          {score.hits.length === 0 ? (
            <div className="text-xs text-faint">No keyword matches</div>
          ) : (
            <div className="flex flex-col gap-1">
              {score.hits.map((hit) => (
                <div key={`${hit.term}-${hit.via}`} className="atom-score-pop__row">
                  <span className="atom-score-pop__term">{hit.term}</span>
                  <Chip mono>{hit.via === 'skill' ? 'skill' : 'text'}</Chip>
                  <FactorChip
                    label={`${hit.weight.toFixed(2)}×${hit.hit}`}
                    value={hit.contribution}
                    detail={`weight ${hit.weight} · hit ${hit.hit} (${hit.via})`}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="atom-score-pop__factors">
          <span className="vt-factor" title="exp(−years/8), floor 0.35">
            <span className="vt-factor__label">recency</span>
            <span className="vt-factor__value">×{fmt(score.recency)}</span>
          </span>
          <span className="vt-factor" title="1 + 0.15·min(metrics, 2)">
            <span className="vt-factor__label">metrics</span>
            <span className="vt-factor__value">×{fmt(score.metricBonus)}</span>
          </span>
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
