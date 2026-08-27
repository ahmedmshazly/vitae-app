/**
 * vCard 3.0 / 4.0 parser (SRS FR-IMP: Contacts import). Handles line
 * unfolding (RFC 6350 §3.2), parameters, and the fields Vitae cares about.
 * Unknown properties are retained in `unrecognized` so nothing silently
 * disappears; a malformed card yields a low-confidence contact, never a throw.
 * vCard 2.1 quoted-printable is out of scope (SRS risk note), such lines land
 * in `unrecognized`.
 */
import { contactEmailKey, vcardUidKey } from './identity.js';

export interface VCardContact {
  fullName: string;
  emails: string[];
  phones: string[];
  org: string | null;
  title: string | null;
  city: string | null;
  urls: string[];
  note: string | null;
  bday: string | null;
  /** Raw property lines the parser did not understand. */
  unrecognized: string[];
  /** 1 for a clean card; lower when we had to guess. */
  confidence: number;
  /**
   * What this card states about who it is, for re-import convergence
   * (FR-SYNC-002). The UID comes first because it is the address book's own
   * identifier for the record and survives a rename; the primary email follows,
   * so a card re-exported from a *different* app under a new UID still resolves
   * to the person already stored. Empty when the card states neither, and such
   * a card stays a create rather than being keyed on its display name.
   */
  identityKeys: string[];
}

/** Unfold continuation lines (leading space/tab) and split. */
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

interface Prop {
  name: string;
  params: string[];
  value: string;
}

function parseLine(line: string): Prop | null {
  const colon = line.indexOf(':');
  if (colon <= 0) return null;
  const left = line.slice(0, colon);
  const [nameRaw, ...params] = left.split(';');
  if (!nameRaw) return null;
  // Strip a group prefix like "item1.EMAIL".
  const name = nameRaw.includes('.') ? nameRaw.slice(nameRaw.indexOf('.') + 1) : nameRaw;
  return { name: name.toUpperCase(), params: params.map((p) => p.toUpperCase()), value: line.slice(colon + 1) };
}

export function parseVcards(text: string): VCardContact[] {
  const lines = unfold(text);
  const contacts: VCardContact[] = [];
  let cur: VCardContact | null = null;
  let fromN: string | null = null;
  let uid: string | null = null;

  for (const line of lines) {
    const prop = parseLine(line);
    if (!prop) {
      if (cur) cur.unrecognized.push(line);
      continue;
    }
    if (prop.name === 'BEGIN' && prop.value.toUpperCase() === 'VCARD') {
      cur = {
        fullName: '',
        emails: [],
        phones: [],
        org: null,
        title: null,
        city: null,
        urls: [],
        note: null,
        bday: null,
        unrecognized: [],
        confidence: 1,
        identityKeys: [],
      };
      fromN = null;
      uid = null;
      continue;
    }
    if (prop.name === 'END' && prop.value.toUpperCase() === 'VCARD') {
      if (cur) {
        if (!cur.fullName && fromN) {
          cur.fullName = fromN;
          cur.confidence = Math.min(cur.confidence, 0.8);
        }
        if (!cur.fullName && cur.emails.length > 0) {
          cur.fullName = cur.emails[0]!.split('@')[0]!;
          cur.confidence = 0.5;
        }
        // Only the first address becomes a key. Later ones are routinely shared
        // (a team alias, a household), and an identity key decides rather than
        // scores, so keying on all of them would silently fuse two people the
        // duplicate scanner would at most have flagged for review.
        cur.identityKeys = [vcardUidKey(uid), contactEmailKey(cur.emails[0])].filter(
          (k): k is string => k !== null,
        );
        if (cur.fullName) contacts.push(cur);
      }
      cur = null;
      continue;
    }
    if (!cur) continue;

    // Quoted-printable (vCard 2.1) is not decoded, keep the raw line.
    if (prop.params.some((p) => p.includes('QUOTED-PRINTABLE'))) {
      cur.unrecognized.push(line);
      cur.confidence = Math.min(cur.confidence, 0.7);
      continue;
    }

    const value = unescapeValue(prop.value).trim();
    switch (prop.name) {
      case 'FN':
        cur.fullName = value;
        break;
      case 'N': {
        // family;given;middle;prefix;suffix → "given family"
        const [family = '', given = ''] = prop.value.split(';');
        fromN = [given, family].map((p) => unescapeValue(p).trim()).filter(Boolean).join(' ');
        break;
      }
      case 'EMAIL':
        if (value) cur.emails.push(value.toLowerCase());
        break;
      case 'TEL':
        if (value) cur.phones.push(value);
        break;
      case 'ORG':
        cur.org = unescapeValue(prop.value.split(';')[0] ?? '').trim() || null;
        break;
      case 'TITLE':
        cur.title = value || null;
        break;
      case 'ADR': {
        // po-box;extended;street;locality;region;postal;country → locality
        const locality = prop.value.split(';')[3];
        if (locality) cur.city = unescapeValue(locality).trim() || cur.city;
        break;
      }
      case 'URL':
        if (value) cur.urls.push(value);
        break;
      case 'NOTE':
        cur.note = value || null;
        break;
      case 'BDAY':
        cur.bday = value || null;
        break;
      case 'UID':
        // Kept rather than discarded: it is the one field on the card that
        // identifies the record across exports, which is what makes a second
        // import of the same address book converge instead of duplicating it.
        uid = value || null;
        break;
      case 'VERSION':
      case 'PRODID':
      case 'REV':
      case 'PHOTO':
        break; // understood, not needed
      default:
        cur.unrecognized.push(line);
    }
  }
  return contacts;
}
