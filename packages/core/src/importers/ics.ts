/**
 * iCalendar VEVENT parser (SRS FR-IMP: Calendar import). Line unfolding per
 * RFC 5545 §3.1; extracts the fields Vitae maps to event nodes. RRULE is kept
 * as its raw string, no expansion in v1 (SRS risk note); recurring events
 * import as a single node carrying the rule.
 */
import { icsEventKey } from './identity.js';

export interface IcsEvent {
  uid: string | null;
  summary: string;
  /** YYYY-MM-DD */
  start: string | null;
  end: string | null;
  location: string | null;
  description: string | null;
  rrule: string | null;
  attendees: string[];
  confidence: number;
  /**
   * The event identity for re-import convergence (FR-SYNC-002), from UID, which
   * RFC 5545 defines as globally unique for exactly this reason. Empty for a
   * VEVENT with no UID: title and date look identifying but a weekly standup
   * exported twice would collapse the wrong pair.
   */
  identityKeys: string[];
}

function unfold(text: string): string[] {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\n[ \t]/g, '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

function unescapeValue(v: string): string {
  return v.replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\');
}

/** DTSTART variants → ISO date: 20260712, 20260712T093000Z, VALUE=DATE:… */
function toIsoDate(value: string): string | null {
  const m = value.match(/^(\d{4})(\d{2})(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

export function parseIcs(text: string): IcsEvent[] {
  const events: IcsEvent[] = [];
  let cur: IcsEvent | null = null;

  for (const line of unfold(text)) {
    const colon = line.indexOf(':');
    if (colon <= 0) continue;
    const left = line.slice(0, colon);
    const name = (left.split(';')[0] ?? '').toUpperCase();
    const value = line.slice(colon + 1);

    if (name === 'BEGIN' && value.toUpperCase() === 'VEVENT') {
      cur = {
        uid: null,
        summary: '',
        start: null,
        end: null,
        location: null,
        description: null,
        rrule: null,
        attendees: [],
        confidence: 1,
        identityKeys: [],
      };
      continue;
    }
    if (name === 'END' && value.toUpperCase() === 'VEVENT') {
      if (cur) {
        if (!cur.summary) {
          cur.summary = 'Untitled event';
          cur.confidence = 0.5;
        }
        if (!cur.start) cur.confidence = Math.min(cur.confidence, 0.6);
        const key = icsEventKey(cur.uid);
        if (key) cur.identityKeys = [key];
        events.push(cur);
      }
      cur = null;
      continue;
    }
    if (!cur) continue;

    switch (name) {
      case 'UID':
        cur.uid = value.trim() || null;
        break;
      case 'SUMMARY':
        cur.summary = unescapeValue(value).trim();
        break;
      case 'DTSTART':
        cur.start = toIsoDate(value.trim());
        break;
      case 'DTEND':
        cur.end = toIsoDate(value.trim());
        break;
      case 'LOCATION':
        cur.location = unescapeValue(value).trim() || null;
        break;
      case 'DESCRIPTION':
        cur.description = unescapeValue(value).trim() || null;
        break;
      case 'RRULE':
        cur.rrule = value.trim() || null;
        break;
      case 'ATTENDEE': {
        // Prefer CN= param; fall back to the mailto address.
        const cn = left.match(/CN=([^;:]+)/i)?.[1];
        const mail = value.replace(/^mailto:/i, '').trim();
        const who = (cn ?? mail).replace(/^"|"$/g, '').trim();
        if (who) cur.attendees.push(who);
        break;
      }
      default:
        break;
    }
  }
  return events;
}
