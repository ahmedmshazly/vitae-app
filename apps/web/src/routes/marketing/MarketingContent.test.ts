import { describe, expect, it } from 'vitest';
import { CLOUD_INDIVIDUAL_PLAN } from '@vitae/core';
import { CLOUD_PLAN } from './MarketingContent.js';

describe('CLOUD_PLAN', () => {
  it('presents the shared Individual plan without duplicating its commercial terms', () => {
    expect(CLOUD_PLAN.name).toBe(CLOUD_INDIVIDUAL_PLAN.name);
    expect(CLOUD_PLAN.trial).toContain(`${CLOUD_INDIVIDUAL_PLAN.trialDays}-day`);
    expect(CLOUD_PLAN.monthly.price).toBe('$24');
    expect(CLOUD_PLAN.annual.price).toBe('$216');
    expect(CLOUD_PLAN.annual.note).toContain('$72');
    expect(CLOUD_PLAN.lifecycle).toContain(`${CLOUD_INDIVIDUAL_PLAN.exportGraceDays} days`);
  });
});
