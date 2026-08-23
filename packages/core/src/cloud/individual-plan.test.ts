import { describe, expect, it } from 'vitest';
import {
  CLOUD_INDIVIDUAL_BILLING_PERIODS,
  CLOUD_INDIVIDUAL_PLAN,
  cloudIndividualAnnualSavingsMinorUnits,
  isCloudIndividualBillingPeriod,
} from './individual-plan.js';

describe('CLOUD_INDIVIDUAL_PLAN', () => {
  it('defines the published billing intervals and lifecycle protections', () => {
    expect(CLOUD_INDIVIDUAL_BILLING_PERIODS).toEqual(['monthly', 'annual']);
    expect(CLOUD_INDIVIDUAL_PLAN.trialDays).toBe(14);
    expect(CLOUD_INDIVIDUAL_PLAN.paymentGraceDays).toBe(7);
    expect(CLOUD_INDIVIDUAL_PLAN.exportGraceDays).toBe(30);
    expect(CLOUD_INDIVIDUAL_PLAN.billing.monthly.priceMinorUnits).toBe(2400);
    expect(CLOUD_INDIVIDUAL_PLAN.billing.annual.priceMinorUnits).toBe(21600);
    expect(cloudIndividualAnnualSavingsMinorUnits()).toBe(7200);
  });

  it('accepts only its published billing periods', () => {
    expect(isCloudIndividualBillingPeriod('monthly')).toBe(true);
    expect(isCloudIndividualBillingPeriod('annual')).toBe(true);
    expect(isCloudIndividualBillingPeriod('quarterly')).toBe(false);
  });
});
