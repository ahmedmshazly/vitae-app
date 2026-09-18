import { normalizedEmail } from '../knowledge.js';

export interface GmailMessageInput {
  id: string;
  thread_id?: string | null;
  subject?: string | null;
  sent_at?: string | null;
  from?: string | null;
  to?: string | null;
  cc?: string | null;
  bcc?: string | null;
  body_text?: string | null;
  attachment_text?: string | null;
  labels?: string | null;
}
export interface MailAddress {
  name: string | null;
  address: string;
}
export interface GmailObservation {
  id: string;
  threadKey: string | null;
  title: string;
  occurredAt: string | null;
  direction: 'in' | 'out' | 'self' | 'unknown';
  category: 'human' | 'bulk' | 'automated' | 'career' | 'unknown';
  participants: MailAddress[];
  contentHash: string;
  locator: string;
  facts: Array<{
    address: string;
    field: 'props.phones' | 'props.city';
    value: unknown;
    excerpt: string;
    confidence: number;
  }>;
  limitations: string[];
}

const AUTOMATED_LOCAL =
  /^(?:no-?reply|notifications?|alerts?|mailer-daemon|postmaster|updates?|newsletter)/i;
const BULK_SIGNAL = /(?:unsubscribe|list-unsubscribe|mailing list|view in browser)/i;
const CAREER_SIGNAL =
  /(?:application|interview|offer|recruit|credential|certificate|conference|proposal|contract)/i;

export function parseMailAddresses(raw?: string | null): MailAddress[] {
  if (!raw) return [];
  const found: MailAddress[] = [];
  // Handles RFC-ish `Name <address>` and bare addresses without pretending to
  // implement MIME. Quoted commas stay attached because the address is the
  // only stable identity used by reconciliation.
  const regex =
    /(?:(?:"([^"]+)"|([^,<]+?))\s*)?<([^<>\s]+@[^<>\s]+)>|([\w.!#$%&'*+/=?^`{|}~-]+@[\w.-]+\.[A-Za-z]{2,})/g;
  for (const match of raw.matchAll(regex)) {
    const address = normalizedEmail(match[3] ?? match[4] ?? '');
    if (!address || found.some((item) => item.address === address)) continue;
    const name = (match[1] ?? match[2] ?? '').trim().replace(/^['"]|['"]$/g, '') || null;
    found.push({ name, address });
  }
  return found;
}

function safeTimestamp(value?: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? null : parsed.toISOString();
}

function excerpt(body: string, start: number, length: number): string {
  return body
    .slice(Math.max(0, start - 35), Math.min(body.length, start + length + 55))
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
}

function portableFingerprint(value: string): string {
  let a = 0x811c9dc5;
  let b = 0x9e3779b9;
  for (let i = 0; i < value.length; i += 1) {
    a = Math.imul(a ^ value.charCodeAt(i), 0x01000193);
    b = Math.imul(b ^ value.charCodeAt(i), 0x85ebca6b);
  }
  return `${(a >>> 0).toString(16).padStart(8, '0')}${(b >>> 0).toString(16).padStart(8, '0')}`;
}

export function extractGmailObservation(
  message: GmailMessageInput,
  selfAddresses: readonly string[],
  hash: (value: string) => string = portableFingerprint,
): GmailObservation {
  const self = new Set(selfAddresses.map(normalizedEmail));
  const from = parseMailAddresses(message.from);
  const recipients = [message.to, message.cc, message.bcc].flatMap(parseMailAddresses);
  const participants = [...from, ...recipients].filter(
    (item, index, all) => all.findIndex((other) => other.address === item.address) === index,
  );
  const fromSelf = from.some((item) => self.has(item.address));
  const toSelf = recipients.some((item) => self.has(item.address));
  const direction = fromSelf && toSelf ? 'self' : fromSelf ? 'out' : toSelf ? 'in' : 'unknown';
  const body = message.body_text ?? '';
  const sender = from[0]?.address ?? '';
  const automated =
    AUTOMATED_LOCAL.test(sender.split('@')[0] ?? '') ||
    /(?:auto-submitted|do not reply)/i.test(body.slice(0, 1000));
  const bulk =
    BULK_SIGNAL.test(`${message.labels ?? ''} ${body.slice(-1200)}`) || participants.length > 25;
  const category = automated
    ? 'automated'
    : bulk
      ? 'bulk'
      : CAREER_SIGNAL.test(`${message.subject ?? ''} ${body.slice(0, 1800)}`)
        ? 'career'
        : sender
          ? 'human'
          : 'unknown';
  const facts: GmailObservation['facts'] = [];
  if (!automated && !bulk && direction === 'in' && sender) {
    const phone =
      /\b(?:my (?:phone|mobile)(?: number)? is|call me (?:at|on))\s*[:—-]?\s*(\+?[\d][\d\s().-]{6,20}\d)\b/i.exec(
        body,
      );
    if (phone)
      facts.push({
        address: sender,
        field: 'props.phones',
        value: [phone[1]!.trim()],
        excerpt: excerpt(body, phone.index, phone[0].length),
        confidence: 0.99,
      });
    const city =
      /\b(?:i live in|i am based in|i'm based in)\s+([A-Z][\p{L}' -]{1,60})(?:[.,;\n]|$)/iu.exec(
        body,
      );
    if (city)
      facts.push({
        address: sender,
        field: 'props.city',
        value: city[1]!.trim(),
        excerpt: excerpt(body, city.index, city[0].length),
        confidence: 0.97,
      });
  }
  const limitations: string[] = [];
  if (!safeTimestamp(message.sent_at)) limitations.push('missing_or_invalid_date');
  if (message.attachment_text == null && /attachment/i.test(body))
    limitations.push('attachment_text_unavailable');
  const hashInput = [
    message.id,
    message.thread_id,
    message.sent_at,
    message.from,
    message.to,
    message.cc,
    message.bcc,
    body,
    message.attachment_text,
  ].join('\u001f');
  return {
    id: message.id,
    threadKey: message.thread_id ?? null,
    title: (message.subject ?? '').slice(0, 1000),
    occurredAt: safeTimestamp(message.sent_at),
    direction,
    category,
    participants,
    contentHash: hash(hashInput),
    locator: `gmail:message:${message.id}`,
    facts,
    limitations,
  };
}
