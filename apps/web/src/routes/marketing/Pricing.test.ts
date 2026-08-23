import { describe, expect, it } from 'vitest';
import { CLOUD_PLAN } from './MarketingContent.js';
import { priceForBillingPeriod } from './Pricing.js';

describe('priceForBillingPeriod', () => {
  it('keeps the monthly price aligned with the public plan', () => {
    expect(priceForBillingPeriod('monthly')).toEqual(CLOUD_PLAN.monthly);
  });

  it('keeps the annual price and annual saving aligned with the public plan', () => {
    expect(priceForBillingPeriod('annual')).toEqual(CLOUD_PLAN.annual);
    expect(priceForBillingPeriod('annual').note).toMatch(/save/i);
  });
});
