/**
 * noonIso (FR-025): a dated capture must land on the calendar day the operator
 * named, in the request timezone, including DST and extreme offsets.
 */
import { describe, expect, it } from 'vitest';
import { noonIso, runInTimezone } from './timezone.js';

function calendarDay(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
}

describe('noonIso', () => {
  it('is noon UTC when the request timezone is UTC', () => {
    runInTimezone('UTC', () => {
      expect(noonIso('2026-07-11')).toBe('2026-07-11T12:00:00.000Z');
    });
  });

  it('stays inside the named day for UTC+14', () => {
    runInTimezone('Pacific/Kiritimati', () => {
      const iso = noonIso('2026-07-11');
      expect(calendarDay(iso, 'Pacific/Kiritimati')).toBe('2026-07-11');
    });
  });

  it('stays inside the named day for UTC−11', () => {
    runInTimezone('Pacific/Pago_Pago', () => {
      const iso = noonIso('2026-07-11');
      expect(calendarDay(iso, 'Pacific/Pago_Pago')).toBe('2026-07-11');
    });
  });

  it('survives a US spring-forward morning', () => {
    runInTimezone('America/New_York', () => {
      const iso = noonIso('2026-03-08');
      expect(calendarDay(iso, 'America/New_York')).toBe('2026-03-08');
    });
  });

  it('survives a US fall-back afternoon', () => {
    runInTimezone('America/New_York', () => {
      const iso = noonIso('2026-11-01');
      expect(calendarDay(iso, 'America/New_York')).toBe('2026-11-01');
    });
  });
});
