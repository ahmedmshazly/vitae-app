import { describe, expect, it } from 'vitest';
import { parseAnalyticsWindowDays, parseReviewPeriod, reviewWindowDays } from './analytics.js';

describe('productivity analytics query tokens', () => {
  it('defaults an unknown window to 30 and maps review periods', () => {
    expect(parseAnalyticsWindowDays(undefined)).toBe(30);
    expect(parseAnalyticsWindowDays('365')).toBe(365);
    expect(parseReviewPeriod('weekly')).toBe('weekly');
    expect(parseReviewPeriod('daily')).toBe('daily');
    expect(reviewWindowDays('daily')).toBe(1);
    expect(reviewWindowDays('weekly')).toBe(7);
  });
});
