import { useState } from 'react';
import { Banner, FilterGroup, PageHeader, Section } from '@vitae/ui';
import type { ReviewPeriod } from '@vitae/core';
import { useProductivityReview } from './api.js';
import { QueryPanel } from './QueryPanel.js';

export function ReviewScreen() {
  const [period, setPeriod] = useState<ReviewPeriod>('daily');
  const query = useProductivityReview(period);
  const bullets = query.data?.review?.bullets ?? [];

  return (
    <div className="page prod-page">
      <PageHeader title="Review" subtitle="Facts from this window. Nothing here is a grade." />
      <FilterGroup
        label="Period"
        value={period}
        onChange={setPeriod}
        options={[
          { key: 'daily', label: 'Daily' },
          { key: 'weekly', label: 'Weekly' },
        ]}
      />
      <div data-productivity-region="ready">
        <QueryPanel
          isLoading={query.isLoading}
          isError={query.isError}
          error={query.error}
          hasData={bullets.length > 0}
          onRetry={() => void query.refetch()}
          loadingLabel="Loading review"
          errorTitle="Couldn't load the review"
          emptyTitle="Nothing to review"
          emptyHint="Completions, waiting items, and habit checks in this period will list here as facts."
          emptyGlyph="check"
        >
          {query.data && query.data.completeness !== 'complete' ? (
            <Banner tone="warning" title="History is incomplete">
              Some counts are withheld because revisions for this window are {query.data.completeness}.
            </Banner>
          ) : null}
          <Section title="Facts">
            <ul className="prod-plain-list">
              {bullets.map((bullet) => (
                <li key={bullet}>{bullet}</li>
              ))}
            </ul>
          </Section>
        </QueryPanel>
      </div>
    </div>
  );
}
