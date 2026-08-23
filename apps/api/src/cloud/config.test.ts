import { describe, expect, it } from 'vitest';
import { CLOUD_INDIVIDUAL_PLAN } from '@vitae/core';
import { EXPORT_GRACE_DAYS, PAYMENT_GRACE_DAYS, TRIAL_LENGTH_DAYS } from './config.js';

describe('Cloud commercial configuration', () => {
  it('derives lifecycle terms from the shared Individual plan', () => {
    expect(TRIAL_LENGTH_DAYS).toBe(CLOUD_INDIVIDUAL_PLAN.trialDays);
    expect(PAYMENT_GRACE_DAYS).toBe(CLOUD_INDIVIDUAL_PLAN.paymentGraceDays);
    expect(EXPORT_GRACE_DAYS).toBe(CLOUD_INDIVIDUAL_PLAN.exportGraceDays);
  });
});
