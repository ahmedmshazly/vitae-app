/**
 * LinkedIn data-export parsers (SRS FR-IMP: LinkedIn import). The export ZIP
 * contains per-entity CSVs; users upload the ones they have. Column names have
 * drifted across LinkedIn versions, so field lookup is header-tolerant (via
 * parseCsvRecords normalization) with several candidate names per field.
 */
import { parseCsvRecords, pickField } from './csv.js';

export interface LinkedInPosition {
  company: string;
  title: string;
  description: string | null;
  location: string | null;
  start: string | null; // YYYY-MM-DD (day defaults to 01)
  end: string | null;
}

export interface LinkedInEducation {
  school: string;
  degree: string | null;
  notes: string | null;
  start: string | null;
  end: string | null;
}

export interface LinkedInConnection {
  firstName: string;
  lastName: string;
  fullName: string;
  email: string | null;
  company: string | null;
  position: string | null;
  connectedOn: string | null;
  url: string | null;
}

/** "Jan 2023" | "2023" | "2023-01" → YYYY-MM-DD (missing parts default low). */
export function parseLinkedInDate(v: string): string | null {
  const s = v.trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/);
  if (m) return `${m[1]}-${m[2]}-${m[3] ?? '01'}`;
  m = s.match(/^([A-Za-z]{3,9})\s+(\d{4})$/);
  if (m) {
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const idx = months.indexOf(m[1]!.slice(0, 3).toLowerCase());
    if (idx >= 0) return `${m[2]}-${String(idx + 1).padStart(2, '0')}-01`;
  }
  m = s.match(/^(\d{4})$/);
  if (m) return `${m[1]}-01-01`;
  return null;
}

export function parseLinkedInPositions(csv: string): LinkedInPosition[] {
  return parseCsvRecords(csv)
    .map((r) => ({
      company: pickField(r, 'company_name', 'company'),
      title: pickField(r, 'title', 'position_title', 'position'),
      description: pickField(r, 'description') || null,
      location: pickField(r, 'location') || null,
      start: parseLinkedInDate(pickField(r, 'started_on', 'start_date', 'from')),
      end: parseLinkedInDate(pickField(r, 'finished_on', 'end_date', 'to')),
    }))
    .filter((p) => p.company || p.title);
}

export function parseLinkedInEducation(csv: string): LinkedInEducation[] {
  return parseCsvRecords(csv)
    .map((r) => ({
      school: pickField(r, 'school_name', 'school'),
      degree: pickField(r, 'degree_name', 'degree') || null,
      notes: pickField(r, 'notes', 'activities') || null,
      start: parseLinkedInDate(pickField(r, 'start_date', 'started_on', 'from')),
      end: parseLinkedInDate(pickField(r, 'end_date', 'finished_on', 'to')),
    }))
    .filter((e) => e.school);
}

export function parseLinkedInSkills(csv: string): string[] {
  return parseCsvRecords(csv)
    .map((r) => pickField(r, 'name', 'skill_name', 'skill'))
    .filter(Boolean);
}

export function parseLinkedInConnections(csv: string): LinkedInConnection[] {
  // Connections.csv often starts with a "Notes:" preamble before the header.
  const headerAt = csv.search(/^"?first name/im);
  const body = headerAt > 0 ? csv.slice(headerAt) : csv;
  return parseCsvRecords(body)
    .map((r) => {
      const firstName = pickField(r, 'first_name');
      const lastName = pickField(r, 'last_name');
      return {
        firstName,
        lastName,
        fullName: [firstName, lastName].filter(Boolean).join(' '),
        email: pickField(r, 'email_address', 'email').toLowerCase() || null,
        company: pickField(r, 'company') || null,
        position: pickField(r, 'position') || null,
        connectedOn: parseLinkedInDate(pickField(r, 'connected_on')),
        url: pickField(r, 'url', 'profile_url') || null,
      };
    })
    .filter((c) => c.fullName);
}
