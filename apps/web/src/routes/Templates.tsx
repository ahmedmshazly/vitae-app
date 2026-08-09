import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CSSProperties } from 'react';
import {
  Button,
  Chip,
  EmptyState,
  ErrorState,
  InfoPopover,
  Mono,
  PageHeader,
  RegisterRule,
  Section,
  Skeleton,
} from '@vitae/ui';
import { api } from '../lib/api.js';
import { useToast } from '../features/Toast.js';

export interface Template {
  key: string;
  name: string;
  version: string;
  ats_strict: boolean;
  description?: string;
  traits: string[];
  page_size: string;
  accent_options: string[];
  line_model: {
    chars_per_line: number;
    lines_per_page: number;
    entry_overhead: number;
    section_overhead: number;
  };
}
export interface TemplateResponse {
  templates: Template[];
  defaultKey: string;
  defaultAccent: string;
  calibration?: {
    ok?: boolean;
    tectonic?: string;
    templates_warmed?: string[];
    line_calibration?: Record<string, { configured: number; measured: number }>;
    calibrated_at?: string | null;
  };
}

export type CalibrationState = 'ready' | 'partial' | 'unavailable';

export interface CalibrationSummary {
  state: CalibrationState;
  label: string;
  title: string;
  detail: string;
}

/**
 * The health endpoint is truth about what this particular build image has
 * actually compiled offline. `ok` only says the service has Tectonic and at
 * least one warmed template; it does not mean every layout in this catalogue
 * has been calibrated. Keep the comparison here so the page cannot turn a
 * partial warmup into an unconditional "ready".
 */
export function calibrationSummary(
  templates: Template[],
  calibration: TemplateResponse['calibration'],
): CalibrationSummary {
  if (templates.length === 0) {
    return {
      state: 'unavailable',
      label: 'No layouts',
      title: 'No layouts available',
      detail: 'The template catalogue did not return any layouts to calibrate.',
    };
  }

  if (!calibration?.ok) {
    return {
      state: 'unavailable',
      label: 'Unavailable',
      title: 'Build service unavailable',
      detail: 'Start buildsvc to compile résumés and verify their page models.',
    };
  }

  const warmed = new Set(calibration.templates_warmed ?? []);
  const ready = templates.filter((template) => warmed.has(`${template.key}@${template.version}`)).length;
  if (ready === templates.length && ready > 0) {
    return {
      state: 'ready',
      label: 'Calibrated',
      title: `All ${ready} layouts calibrated`,
      detail: calibration.calibrated_at
        ? `Last verified ${String(calibration.calibrated_at).slice(0, 10)}.`
        : 'Line models were verified when this build-service image was created.',
    };
  }

  return {
    state: 'partial',
    label: `${ready} of ${templates.length}`,
    title: `${ready} of ${templates.length} layouts calibrated`,
    detail: 'Only calibrated layouts can be verified against their configured one-page model.',
  };
}

/** The preview is illustrative only; the real numbers remain visible below it. */
function TemplatePreview({ template, accent }: { template: Template; accent: string }) {
  return (
    <div
      className={`template-preview template-preview--${template.key} m-3 mb-0 p-5 sm:p-6`}
      style={{ '--template-accent': accent } as CSSProperties}
      aria-hidden
    >
      <div className="template-preview__name">YOUR NAME</div>
      <div className="template-preview__contact">email · github · city</div>
      <div className="template-preview__headline">SOFTWARE &amp; DATA ENGINEER</div>
      <div className="template-preview__rule" />
      <div className="template-preview__section">EXPERIENCE</div>
      <div className="template-preview__line wide" />
      <div className="template-preview__line" />
      <div className="template-preview__line short" />
      <div className="template-preview__section">PROJECTS</div>
      <div className="template-preview__line wide" />
      <div className="template-preview__line" />
    </div>
  );
}

/** Choose the layout new résumé drafts begin with. */
export function Templates() {
  const qc = useQueryClient();
  const { flash } = useToast();
  const templatesQuery = useQuery({
    queryKey: ['templates'],
    queryFn: () => api.get<TemplateResponse>('/resumes/templates'),
  });
  const data = templatesQuery.data;
  const setDefault = useMutation({
    mutationFn: (templateKey: string) => api.patch('/resumes/templates/default', { templateKey }),
    onSuccess: async (_result, templateKey) => {
      // Settings reads the same persisted default. Without invalidating both
      // keys, navigating Templates → Settings within its stale window showed
      // the old layout until some unrelated refetch happened.
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['templates'] }),
        qc.invalidateQueries({ queryKey: ['settings'] }),
      ]);
      const name = data?.templates.find((template) => template.key === templateKey)?.name ?? 'Template';
      flash(`${name} is now the default template.`);
    },
  });
  const templates = data?.templates ?? [];
  const service = data ? calibrationSummary(templates, data.calibration) : null;
  const defaultKey = data?.defaultKey ?? '';
  const defaultAccent = data?.defaultAccent ?? '';

  return (
    <div className="page resume-page">
      <PageHeader
        title="Templates"
        subtitle="Choose the default layout for new résumés. Existing outputs stay unchanged."
        help={
          <InfoPopover title="What the service checks">
            <p>
              Each layout has a configured line model. The build service warms a layout by compiling a
              fixture offline and measuring it against that model.
            </p>
            <p>
              Changing the default changes new drafts only. It never edits a résumé you have already
              generated or sent.
            </p>
          </InfoPopover>
        }
      />
      <RegisterRule />

      {templatesQuery.isError ? (
        <ErrorState
          title="Couldn’t load résumé templates"
          detail={(templatesQuery.error as Error | null)?.message}
          onRetry={() => void templatesQuery.refetch()}
        />
      ) : templatesQuery.isLoading ? (
        <TemplateSkeleton />
      ) : templates.length === 0 ? (
        <EmptyState
          glyph="resume"
          title="No résumé templates are available"
          hint="The template catalogue returned no layouts. Retry the request; if it persists, check the API’s template files."
          action={
            <Button size="sm" onClick={() => void templatesQuery.refetch()}>
              Retry
            </Button>
          }
        />
      ) : (
        <>
          <Section
            title="Build service"
            actions={
              <Chip
                tone={
                  service!.state === 'ready'
                    ? 'accent'
                    : service!.state === 'partial'
                      ? 'warning'
                      : 'danger'
                }
              >
                {service!.label}
              </Chip>
            }
          >
            <p className="m-0 text-sm text-ink-soft">
              <strong className="font-semibold text-ink">{service!.title}.</strong> {service!.detail}
            </p>
          </Section>

          <Section title="Layouts" meta={templates.length}>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {templates.map((template) => {
                const active = defaultKey === template.key;
                const previewAccent =
                  (active ? defaultAccent : undefined) ??
                  template.accent_options[0] ??
                  defaultAccent ??
                  '#111827';
                const setting = setDefault.isPending && setDefault.variables === template.key;
                return (
                  <article
                    key={template.key}
                    aria-labelledby={`template-${template.key}`}
                    data-template-key={template.key}
                    className={`overflow-hidden rounded border bg-surface ${
                      active ? 'border-strong' : 'border-hairline'
                    }`}
                  >
                    <TemplatePreview template={template} accent={previewAccent} />
                    <div className="flex flex-col gap-3 p-4">
                      <div className="flex items-baseline justify-between gap-3">
                        <h3 id={`template-${template.key}`} className="m-0 text-base text-ink">
                          {template.name}
                        </h3>
                        {active && <Chip tone="accent">Default</Chip>}
                      </div>
                      <p className="m-0 text-sm text-ink-soft">{template.description}</p>
                      <div className="flex flex-wrap gap-2">
                        <Chip tone={template.ats_strict ? 'accent' : 'default'}>
                          {template.ats_strict ? 'ATS strict' : 'ATS friendly'}
                        </Chip>
                        <Chip mono>{template.page_size}</Chip>
                        <Chip mono>v{template.version}</Chip>
                      </div>
                      <div className="flex gap-4 border-y border-hairline py-2 text-xs">
                        <span className="text-muted">
                          <Mono className="text-ink">{template.line_model.lines_per_page}</Mono> lines/page
                        </span>
                        <span className="text-muted">
                          <Mono className="text-ink">{template.line_model.chars_per_line}</Mono> chars/line
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Mono className="text-xs text-muted">
                          {template.accent_options.length} curated accent
                          {template.accent_options.length === 1 ? '' : 's'}
                        </Mono>
                        {template.traits.map((trait) => (
                          <Chip key={trait}>{trait}</Chip>
                        ))}
                        {template.accent_options.slice(0, 6).map((accent) => (
                          <span
                            key={accent}
                            aria-hidden
                            className="inline-block size-3 rounded-full border border-hairline"
                            style={{ background: accent }}
                          />
                        ))}
                      </div>
                      <Button
                        variant={active ? 'ghost' : 'primary'}
                        disabled={active || setDefault.isPending}
                        onClick={() => setDefault.mutate(template.key)}
                        aria-label={
                          active
                            ? `${template.name} is the current default`
                            : `Make ${template.name} the default`
                        }
                      >
                        {active ? 'Current default' : setting ? 'Making default…' : 'Make default'}
                      </Button>
                    </div>
                  </article>
                );
              })}
            </div>
          </Section>
        </>
      )}
    </div>
  );
}

function TemplateSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" role="status" aria-label="Loading résumé templates">
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="border border-hairline bg-surface p-4">
          <Skeleton height={170} />
          <div className="mt-4 grid gap-3">
            <Skeleton width="42%" />
            <Skeleton height={28} />
            <Skeleton width="65%" />
            <Skeleton height={32} />
          </div>
        </div>
      ))}
    </div>
  );
}
