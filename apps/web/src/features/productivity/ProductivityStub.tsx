import { Link, useLocation } from 'react-router-dom';
import { EmptyState, PageHeader, Section, type GlyphName } from '@vitae/ui';
import { ROUTES } from '../../app/routes.js';
import { isProductivityEnabled } from '../../lib/productivity-flag.js';

const SCREENS: Record<string, { label: string; glyph: GlyphName }> = {
  [ROUTES.tasks.path]: { label: ROUTES.tasks.label, glyph: ROUTES.tasks.glyph },
  [ROUTES.waiting.path]: { label: ROUTES.waiting.label, glyph: ROUTES.waiting.glyph },
  [ROUTES.review.path]: { label: ROUTES.review.label, glyph: ROUTES.review.glyph },
  [ROUTES.analytics.path]: { label: ROUTES.analytics.label, glyph: ROUTES.analytics.glyph },
  [ROUTES.automation.path]: { label: ROUTES.automation.label, glyph: ROUTES.automation.glyph },
  [ROUTES.taskTemplates.path]: {
    label: ROUTES.taskTemplates.label,
    glyph: ROUTES.taskTemplates.glyph,
  },
};

/**
 * Flagged Today productivity surface. Task 7 replaces the ready region.
 * When the flag is off the route still exists (a bookmark is not a 404) and
 * this page must not call `/api/v1/productivity`.
 */
export function ProductivityPage() {
  const { pathname } = useLocation();
  const screen = SCREENS[pathname] ?? { label: 'Tasks', glyph: 'task' as const };
  const enabled = isProductivityEnabled();

  return (
    <div className="page">
      <PageHeader
        title={screen.label}
        subtitle={
          enabled
            ? 'A workspace for this surface. The matrix and lists land in a later pass.'
            : 'This surface is not available in this build.'
        }
      />
      {enabled ? (
        <Section title="Workspace">
          <div data-productivity-region="ready">
            <EmptyState
              glyph={screen.glyph}
              title={`${screen.label} is ready`}
              hint="Nothing is listed yet. This region is the slot the matrix and lists will fill."
            />
          </div>
        </Section>
      ) : (
        <EmptyState
          glyph="today"
          title="Not available"
          hint="Productivity screens are turned off for this installation. Today, Planner, and the Ledger are unchanged."
          action={
            <Link to="/today" className="vt-btn vt-btn--primary">
              Go to Today
            </Link>
          }
        />
      )}
    </div>
  );
}
