import { Link } from 'react-router-dom';
import { Glyph, PageHeader, RegisterRule, type GlyphName } from '@vitae/ui';
import { useAuth } from '../../lib/auth.js';

interface WorkspaceAction {
  href: string;
  glyph: GlyphName;
  eyebrow: string;
  title: string;
  detail: string;
  accent?: 'relationship' | 'career' | 'time' | 'place' | 'data';
}

interface WorkspaceHomeProps {
  eyebrow: string;
  title: string;
  subtitle: string;
  statement: string;
  actions: WorkspaceAction[];
  footnote: string;
}

const TRACE_TICKS = [
  { at: 0.05, label: 'Orient' },
  { at: 0.34, label: 'Inspect' },
  { at: 0.66, label: 'Decide' },
  { at: 0.95, label: 'Act' },
];

function WorkspaceHome({
  eyebrow,
  title,
  subtitle,
  statement,
  actions,
  footnote,
}: WorkspaceHomeProps) {
  const [lead, ...rest] = actions;

  return (
    <div className="page page--workspace-home">
      <div className="workspace-home__eyebrow">{eyebrow}</div>
      <PageHeader title={title} subtitle={subtitle} />
      <RegisterRule ticks={TRACE_TICKS} activeIndex={0} label={`${title} workflow`} />

      <div className="workspace-home__composition">
        <aside className="workspace-home__statement" aria-label={`${title} purpose`}>
          <p>{statement}</p>
          <span>{footnote}</span>
        </aside>

        {lead && (
          <Link
            className={`workspace-lead workspace-tone--${lead.accent ?? 'data'}`}
            to={lead.href}
          >
            <span className="workspace-lead__index">01</span>
            <Glyph name={lead.glyph} size={24} />
            <span className="workspace-lead__copy">
              <span className="workspace-lead__eyebrow">{lead.eyebrow}</span>
              <strong>{lead.title}</strong>
              <span>{lead.detail}</span>
            </span>
            <span className="workspace-lead__arrow" aria-hidden>
              ↗
            </span>
          </Link>
        )}

        <ul className="workspace-index" aria-label={`${title} destinations`}>
          {rest.map((action, index) => (
            <li key={action.href} className="workspace-index__item">
              <Link
                to={action.href}
                className={`workspace-index__row workspace-tone--${action.accent ?? 'data'}`}
              >
                <span className="workspace-index__number">
                  {String(index + 2).padStart(2, '0')}
                </span>
                <Glyph name={action.glyph} size={18} />
                <span className="workspace-index__copy">
                  <span>{action.eyebrow}</span>
                  <strong>{action.title}</strong>
                </span>
                <span className="workspace-index__detail">{action.detail}</span>
                <Glyph name="chevron-down" size={14} className="workspace-index__arrow" />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export { NetworkHome } from './NetworkHome.js';

export function ExploreHome() {
  return (
    <WorkspaceHome
      eyebrow="Three lenses · one graph"
      title="Explore"
      subtitle="See the same evidence through relationship, time, and place."
      statement="Change the lens, not the truth. A selected record stays traceable as the shape around it changes."
      footnote="Filters and selections remain addressable in the URL."
      actions={[
        {
          href: '/explore/graph',
          glyph: 'graph',
          eyebrow: 'Relationship',
          title: 'Life map',
          detail: 'Follow neighborhoods, hubs, paths, and the evidence behind every edge.',
          accent: 'relationship',
        },
        {
          href: '/explore/library',
          glyph: 'filter',
          eyebrow: 'Records',
          title: 'Library',
          detail: 'Search, saved views, entity types, and generic records in one place.',
          accent: 'data',
        },
        {
          href: '/explore/timeline',
          glyph: 'timeline',
          eyebrow: 'Time',
          title: 'Chronograph',
          detail: 'Read seasons, overlaps, ongoing spans, and turning points.',
          accent: 'time',
        },
        {
          href: '/explore/atlas',
          glyph: 'map',
          eyebrow: 'Place',
          title: 'Atlas',
          detail: 'Inspect cities, trips, corridors, and unmapped evidence.',
          accent: 'place',
        },
      ]}
    />
  );
}

export function DataHome() {
  return (
    <WorkspaceHome
      eyebrow="Ownership workspace"
      title="Data"
      subtitle="Bring records in, keep identity clean, and take everything back out."
      statement="Your graph should be inspectable at every boundary: before import, during reconciliation, and at export."
      footnote="No import commits until its staged records have been reviewed."
      actions={[
        {
          href: '/data/knowledge',
          glyph: 'document',
          eyebrow: 'Reconcile',
          title: 'Knowledge review',
          detail:
            'Compare accepted facts with source assertions, settle conflicts, and inspect coverage.',
          accent: 'data',
        },
        {
          href: '/data/imports',
          glyph: 'capture',
          eyebrow: 'Ingest',
          title: 'Stage an import',
          detail: 'Parse, review, deduplicate, and commit supported sources with a rollback path.',
          accent: 'data',
        },
        {
          href: '/data/identity',
          glyph: 'merge',
          eyebrow: 'Integrity',
          title: 'Identity audit',
          detail: 'Resolve likely duplicates with field and relationship evidence.',
          accent: 'relationship',
        },
        {
          href: '/data/sources/github',
          glyph: 'repository',
          eyebrow: 'Source',
          title: 'GitHub',
          detail: 'Connect, synchronize, and inspect retained repository records.',
          accent: 'career',
        },
        {
          href: '/data/sources/gemini',
          glyph: 'idea',
          eyebrow: 'Source',
          title: 'Gemini',
          detail: 'Park a Google Gemini project and API key until a workflow needs them.',
          accent: 'data',
        },
        {
          href: '/data/exports',
          glyph: 'export',
          eyebrow: 'Portability',
          title: 'Exports & backups',
          detail: 'Create scoped CSV exports or a checksummed full backup.',
          accent: 'time',
        },
        {
          href: '/data/trash',
          glyph: 'trash',
          eyebrow: 'Recovery',
          title: 'Trash',
          detail: 'Restore deleted records before the retention window closes.',
          accent: 'place',
        },
      ]}
    />
  );
}

export function SettingsHome() {
  const { cloudEnabled } = useAuth();
  return (
    <WorkspaceHome
      eyebrow="Workspace controls"
      title="Settings"
      subtitle="Your identity, working preferences, and the system beneath them."
      statement="Preferences belong near the work they change. This index keeps the few global controls legible."
      footnote="Career defaults and connected sources remain linked to their own workspaces."
      actions={[
        {
          href: '/settings/profile',
          glyph: 'person',
          eyebrow: 'Identity',
          title: 'Profile',
          detail: 'Your self record and the contact information used in career documents.',
          accent: 'relationship',
        },
        {
          href: '/settings/preferences',
          glyph: 'adjust',
          eyebrow: 'Behavior',
          title: 'Preferences',
          detail: 'Ranking, taxonomy, aliases, and workspace defaults.',
          accent: 'data',
        },
        {
          href: '/settings/system',
          glyph: 'graph',
          eyebrow: 'Health',
          title: 'System',
          detail: 'Service health, build status, identity integrity, and backup links.',
          accent: 'career',
        },
        ...(cloudEnabled
          ? [
              {
                href: '/settings/billing',
                glyph: 'export' as const,
                eyebrow: 'Account',
                title: 'Billing & access',
                detail:
                  'See trial or subscription status, manage billing, and keep the export path visible.',
                accent: 'data' as const,
              },
            ]
          : []),
        {
          href: '/help',
          glyph: 'ask',
          eyebrow: 'Reference',
          title: 'Help & shortcuts',
          detail: 'Learn capture grammar, navigation, and the feedback vocabulary.',
          accent: 'time',
        },
      ]}
    />
  );
}

const SHORTCUTS = [
  ['⌘ K', 'Capture a thought, interaction, task, or record from anywhere'],
  ['⌘ P', 'Search records, jump to a workspace, or run an action'],
  ['N', 'Open the structured new-record menu outside a text field'],
  ['Esc', 'Close the active palette, drawer, or dialog and restore focus'],
];

export function Help() {
  return (
    <div className="page page--help">
      <div className="workspace-home__eyebrow">Product reference</div>
      <PageHeader
        title="Help & shortcuts"
        subtitle="The shortest path into Vitae's working model."
      />
      <RegisterRule />

      <div className="help-ledger">
        <section className="help-ledger__intro" aria-labelledby="help-start">
          <h2 id="help-start">Start with the next fact</h2>
          <p>
            Capture what happened, connect it to who or what it concerns, then let the graph expose
            the next useful view. Vitae never needs a perfect profile before it becomes useful.
          </p>
          <Link to="/today/planner">
            Open today's planner <span aria-hidden>↗</span>
          </Link>
        </section>

        <section className="help-ledger__shortcuts" aria-labelledby="help-keys">
          <h2 id="help-keys">Keyboard</h2>
          <dl>
            {SHORTCUTS.map(([keys, description]) => (
              <div key={keys}>
                <dt>{keys}</dt>
                <dd>{description}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="help-ledger__model" aria-labelledby="help-model">
          <h2 id="help-model">How to read the system</h2>
          <ol>
            <li>
              <strong>Records</strong>
              <span>are facts: a person, role, project, application, place, or document.</span>
            </li>
            <li>
              <strong>Connections</strong>
              <span>state how facts relate, including direction and strength.</span>
            </li>
            <li>
              <strong>Traces</strong>
              <span>show provenance, chronology, scoring factors, and work in progress.</span>
            </li>
            <li>
              <strong>Lenses</strong>
              <span>reshape the same graph without creating a second source of truth.</span>
            </li>
          </ol>
          {/* The entity catalog is generated from the same type constants the
              API validates against, and it reads nothing of yours, so it sits
              outside the six workspaces. Reachable from nothing is still a
              defect, and this is the one honest way in. */}
          <p>
            Every record type, connection type, and relation kind the system knows is listed in the{' '}
            <Link to="/reference/entities">entity catalog</Link>. It describes the schema, not your
            data, and needs no account.
          </p>
        </section>
      </div>
    </div>
  );
}
