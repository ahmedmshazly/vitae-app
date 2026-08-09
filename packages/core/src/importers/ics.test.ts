import { describe, expect, it } from 'vitest';
import { parseIcs } from './ics.js';

const CAL = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:abc-123
SUMMARY:DevFest Cairo
DTSTART;VALUE=DATE:20260912
DTEND;VALUE=DATE:20260913
LOCATION:Cairo ICC
DESCRIPTION:Annual dev conference\\, keynote at 9.
ATTENDEE;CN="Sarah Chen":mailto:sarah@x.com
END:VEVENT
BEGIN:VEVENT
UID:def-456
SUMMARY:Standup
DTSTART:20260701T093000Z
RRULE:FREQ=WEEKLY;BYDAY=MO,WE
END:VEVENT
END:VCALENDAR`;

describe('parseIcs', () => {
  it('parses VEVENTs with dates, location, attendees', () => {
    const events = parseIcs(CAL);
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      uid: 'abc-123',
      summary: 'DevFest Cairo',
      start: '2026-09-12',
      end: '2026-09-13',
      location: 'Cairo ICC',
      description: 'Annual dev conference, keynote at 9.',
      attendees: ['Sarah Chen'],
      rrule: null,
    });
  });

  it('keeps RRULE as a raw string without expansion', () => {
    const [, weekly] = parseIcs(CAL);
    expect(weekly!.rrule).toBe('FREQ=WEEKLY;BYDAY=MO,WE');
    expect(weekly!.start).toBe('2026-07-01');
  });

  it('degrades a summaryless event to low confidence instead of dropping it', () => {
    const events = parseIcs('BEGIN:VEVENT\nDTSTART:20260101\nEND:VEVENT');
    expect(events[0]!.summary).toBe('Untitled event');
    expect(events[0]!.confidence).toBeLessThan(1);
  });
});
