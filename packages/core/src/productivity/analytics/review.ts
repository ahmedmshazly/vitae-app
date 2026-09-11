/**
 * Factual review sentences. Counts only. No scores, no shame language,
 * no invented history.
 */
import type { ProductivityFigures, ProductivityReview } from './types.js';

function countPhrase(count: number, singular: string, plural: string): string {
  return count === 1 ? `1 ${singular}` : `${count} ${plural}`;
}

/**
 * Daily / weekly bullets derived from figures already computed for the window.
 * A missing revision cannot become a sentence.
 */
export function reviewBullets(figures: ProductivityFigures): ProductivityReview {
  const bullets: string[] = [
    countPhrase(figures.throughput.total, 'task completed', 'tasks completed'),
  ];

  if (figures.waiting.waiting > 0) {
    bullets.push(countPhrase(figures.waiting.waiting, 'task is waiting', 'tasks are waiting'));
  }
  if (figures.waiting.overdue_follow_up > 0) {
    bullets.push(
      countPhrase(
        figures.waiting.overdue_follow_up,
        'follow-up date is past',
        'follow-up dates are past',
      ),
    );
  }
  if (figures.time_spent.total_seconds > 0) {
    bullets.push(`${figures.time_spent.total_seconds} seconds recorded`);
  }
  if (figures.habits.total_checks > 0) {
    bullets.push(countPhrase(figures.habits.total_checks, 'habit check', 'habit checks'));
  }

  const placed = figures.quadrant_balance;
  const open = placed.do + placed.schedule + placed.delegate + placed.eliminate;
  if (open > 0) {
    bullets.push(
      `${countPhrase(placed.do, 'task', 'tasks')} in Do, ${placed.schedule} in Schedule, ${placed.delegate} in Delegate, ${placed.eliminate} in Eliminate`,
    );
  }

  const applications = figures.application_funnel.rows.reduce((sum, row) => sum + row.count, 0);
  if (applications > 0) {
    const occupied = figures.application_funnel.rows.filter((row) => row.count > 0);
    bullets.push(
      occupied
        .map((row) => countPhrase(row.count, `application in ${row.stage}`, `applications in ${row.stage}`))
        .join(', '),
    );
  }

  if (figures.urgency_creep.history_completeness === 'complete' && figures.urgency_creep.count > 0) {
    bullets.push(
      countPhrase(
        figures.urgency_creep.count,
        'item became urgent after it was created',
        'items became urgent after they were created',
      ),
    );
  }

  return { bullets };
}
