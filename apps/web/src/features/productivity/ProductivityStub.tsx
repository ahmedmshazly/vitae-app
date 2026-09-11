import { Link, useLocation } from 'react-router-dom';
import { EmptyState, PageHeader, Section, type GlyphName } from '@vitae/ui';
import { ROUTES } from '../../app/routes.js';
import { isProductivityEnabled } from '../../lib/productivity-flag.js';
import { AutomationScreen } from './AutomationScreen.js';
import { TasksScreen } from './TasksScreen.js';
import { TemplatesScreen } from './TemplatesScreen.js';
import { AnalyticsScreen } from './AnalyticsScreen.js';
import { ReviewScreen } from './ReviewScreen.js';
import { WaitingScreen } from './WaitingScreen.js';
import './productivity.css';

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
 * Flagged Today productivity surface.
 * When the flag is off the route still exists (a bookmark is not a 404) and
 * this page must not call `/api/v1/productivity`.
 * Review and Analytics load private figures when the flag is on.
 */
export function ProductivityPage() {
  const { pathname } = useLocation();
  const enabled = isProductivityEnabled();

  if (!enabled) {
    const screen = SCREENS[pathname] ?? { label: 'Tasks', glyph: 'task' as const };
    return (
      <div className="page">
        <PageHeader title={screen.label} subtitle="This surface is not available in this build." />
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
      </div>
    );
  }

  if (pathname === ROUTES.tasks.path) return <TasksScreen />;
  if (pathname === ROUTES.waiting.path) return <WaitingScreen />;
  if (pathname === ROUTES.review.path) return <ReviewScreen />;
  if (pathname === ROUTES.analytics.path) return <AnalyticsScreen />;
  if (pathname === ROUTES.automation.path) return <AutomationScreen />;
  if (pathname === ROUTES.taskTemplates.path) return <TemplatesScreen />;

  return <ProductivityStubScreen pathname={pathname} />;
}

export function ProductivityStubScreen({ pathname }: { pathname: string }) {
  const screen = SCREENS[pathname] ?? { label: 'Tasks', glyph: 'task' as const };
  return (
    <div className="page">
      <PageHeader
        title={screen.label}
        subtitle="A workspace for this surface. The matrix and lists land in a later pass."
      />
      <Section title="Workspace">
        <div data-productivity-region="ready">
          <EmptyState
            glyph={screen.glyph}
            title={`${screen.label} is ready`}
            hint="Nothing is listed yet. This region is the slot the matrix and lists will fill."
          />
        </div>
      </Section>
    </div>
  );
}
