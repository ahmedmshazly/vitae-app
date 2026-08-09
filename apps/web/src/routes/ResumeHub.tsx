/**
 * Résumé hub - live overview of the résumé workspace: KPIs, workflow shortcuts,
 * and recent outputs. Tailor remains the power view; this is the front door.
 */
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Button,
  Chip,
  ErrorState,
  InfoPopover,
  Mono,
  PageHeader,
  RegisterRule,
  Section,
  Skeleton,
  SkeletonRows,
} from '@vitae/ui';
import { api } from '../lib/api.js';

interface Overview {
  counts: {
    atoms: number;
    pinnedAtoms: number;
    incompleteAtoms: number;
    targets: number;
    activeTargets: number;
    outputs: number;
    finalized: number;
  };
  baseResumeId: string | null;
  recent: Array<{
    id: string;
    name: string;
    status: string;
    template_key?: string;
    updated_at?: string;
    created_at?: string;
  }>;
}

const WORKFLOW: Array<{ to: string; label: string; body: string; cta: string }> = [
  {
    to: '/resume/tailor',
    label: 'Tailor',
    body: 'Paste a JD, score atoms, compile a one-page PDF.',
    cta: 'Open Tailor',
  },
  {
    to: '/resume/atoms',
    label: 'Atoms',
    body: 'Edit achievement bullets, wording variants, and skills.',
    cta: 'Edit atoms',
  },
  {
    to: '/resume/outputs',
    label: 'Outputs',
    body: 'Inspect, download, duplicate, or archive finalized résumés.',
    cta: 'Browse outputs',
  },
  {
    to: '/resume/letters',
    label: 'Letters',
    body: 'Draft hook / body / closer blocks against a job target.',
    cta: 'Cover letters',
  },
  {
    to: '/resume/templates',
    label: 'Templates',
    body: 'Pick the default layout and review calibrated accents.',
    cta: 'Templates',
  },
];

export function ResumeHub() {
  const navigate = useNavigate();
  const overview = useQuery({
    queryKey: ['resume-overview'],
    queryFn: () => api.get<Overview>('/resumes/overview'),
  });

  const counts = overview.data?.counts;
  const recent = overview.data?.recent ?? [];

  return (
    <div className="page resume-page">
      <PageHeader
        title="Résumé"
        subtitle="Turn a job description into a tailored, ATS-safe one-page résumé built from your own achievement atoms."
        help={
          <InfoPopover title="How the résumé engine works">
            <p>
              Everything is deterministic - no AI guesswork. Your bullets (“atoms”) are scored against the JD and
              packed to one page, then rendered to LaTeX and compiled.
            </p>
            <p>
              New here? Hit <strong>New résumé</strong> and paste any job description.
            </p>
          </InfoPopover>
        }
        actions={
          <Button variant="primary" glyph="resume" onClick={() => navigate('/resume/tailor')}>
            New résumé
          </Button>
        }
      />
      <RegisterRule />

      {/* A failed overview used to render every counter as a confident 0, set
          "Base résumé -", and tell you to go and finalize your first résumé:
          the screen inventing an empty workspace and asking you to rebuild it.
          The failure costs you the numbers, not the navigation below. */}
      {overview.isError ? (
        <ErrorState
          title="Couldn’t read your résumé workspace"
          detail={(overview.error as Error | null)?.message}
          onRetry={() => void overview.refetch()}
        />
      ) : (
        <div className="resume-kpis">
          <Kpi
            label="Atoms"
            value={counts?.atoms}
            loading={overview.isLoading}
            hint={counts && `${counts.pinnedAtoms} pinned · ${counts.incompleteAtoms} need variants/skills`}
            to="/resume/atoms"
          />
          <Kpi
            label="Targets"
            value={counts?.targets}
            loading={overview.isLoading}
            hint={counts && `${counts.activeTargets} saved/active`}
            to="/resume/tailor"
          />
          <Kpi
            label="Outputs"
            value={counts?.outputs}
            loading={overview.isLoading}
            hint={counts && `${counts.finalized} final/sent`}
            to="/resume/outputs"
          />
          <Kpi
            label="Base résumé"
            value={overview.data ? (overview.data.baseResumeId ? 'Set' : '—') : undefined}
            loading={overview.isLoading}
            hint={
              overview.data &&
              (overview.data.baseResumeId
                ? 'Diffs compare new finals against this output'
                : 'Finalize a résumé to set the first base')
            }
            to="/resume/outputs"
          />
        </div>
      )}

      {/* Was a bordered card, the same weight as the two regions around it -
          three boxes with nothing saying which one mattered. */}
      <Section title="Workflow" meta={WORKFLOW.length}>
        {/* A numbered sequence, so it reads as one: five cards in a two-column
            grid left step 5 sitting alone beside a hole. */}
        <ol className="m-0 list-none p-0">
          {WORKFLOW.map((step, i) => (
            <li key={step.to}>
              <Link
                to={step.to}
                className="flex items-baseline gap-3 border-b border-hairline py-3 no-underline last:border-b-0 hover:border-strong hover:no-underline"
              >
                <Mono className="text-xs text-faint">{i + 1}</Mono>
                <span className="w-24 shrink-0 text-base text-ink">{step.label}</span>
                <span className="min-w-0 flex-1 text-sm text-ink-soft">{step.body}</span>
                <span className="text-xs whitespace-nowrap text-muted">{step.cta} →</span>
              </Link>
            </li>
          ))}
        </ol>
      </Section>

      <Section
        title="Recent outputs"
        meta={overview.data ? recent.length : undefined}
        actions={
          <Button size="sm" variant="ghost" onClick={() => navigate('/resume/outputs')}>
            View all
          </Button>
        }
      >
        {overview.isError ? (
          <p className="text-sm text-muted">Unavailable while the workspace cannot be read.</p>
        ) : overview.isLoading ? (
          <SkeletonRows rows={3} />
        ) : recent.length === 0 ? (
          <p className="text-sm text-muted">No outputs yet. Start in Tailor and finalize a résumé.</p>
        ) : (
          recent.map((resume) => (
            <button
              key={resume.id}
              type="button"
              className="row w-full cursor-pointer border-0 bg-transparent text-left text-ink"
              onClick={() => navigate(`/resume/outputs?focus=${resume.id}`)}
            >
              <span className="row__main">
                <span className="row__title">{resume.name}</span>
                <span className="row__sub u-mono">
                  {resume.template_key ?? 'template'} ·{' '}
                  {(resume.updated_at ?? resume.created_at ?? '').slice(0, 10) || '—'}
                </span>
              </span>
              <Chip tone={resume.status === 'final' || resume.status === 'sent' ? 'accent' : 'default'} mono>
                {resume.status}
              </Chip>
            </button>
          ))
        )}
      </Section>
    </div>
  );
}

function Kpi({
  label,
  value,
  hint,
  to,
  loading,
}: {
  label: string;
  value: string | number | undefined;
  /** Undefined until the counts arrive - a hint built from `?? 0` states the
   *  same fabricated zero as the value, only in smaller type. */
  hint: string | undefined | false;
  to: string;
  loading?: boolean;
}) {
  return (
    <Link to={to} className="resume-kpi">
      <span>{label}</span>
      {/* A pending count rendered 0, which is indistinguishable from a workspace
          that is genuinely empty - the tile stated a fact it did not have. */}
      {loading ? <Skeleton width={28} height={20} /> : <strong>{value ?? '—'}</strong>}
      {hint ? (
        <span className="resume-kpi__hint">{hint}</span>
      ) : (
        <Skeleton width="70%" height={11} />
      )}
    </Link>
  );
}
