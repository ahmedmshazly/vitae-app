import { describe, expect, it } from 'vitest';
import { parseVcards } from './vcard.js';

const CARD_40 = `BEGIN:VCARD
VERSION:4.0
FN:Sarah Chen
N:Chen;Sarah;;;
ORG:Nile Robotics;Perception
TITLE:Staff SWE
EMAIL;TYPE=work:sarah.chen@nile-robotics.com
TEL;TYPE=cell:+20 100 555 0101
ADR;TYPE=home:;;12 Corniche St;Cairo;;11511;Egypt
URL:https://sarah.dev
NOTE:Met at DevFest\\, likes RL.
END:VCARD`;

const CARD_30_FOLDED = `BEGIN:VCARD
VERSION:3.0
N:El-Sayed;Omar;;;
EMAIL:omar@example.com
NOTE:A long note that is folded across
  two lines per RFC.
X-CUSTOM:whatever
END:VCARD`;

describe('parseVcards', () => {
  it('parses a 4.0 card with the full field set', () => {
    const [c] = parseVcards(CARD_40);
    expect(c).toMatchObject({
      fullName: 'Sarah Chen',
      emails: ['sarah.chen@nile-robotics.com'],
      phones: ['+20 100 555 0101'],
      org: 'Nile Robotics',
      title: 'Staff SWE',
      city: 'Cairo',
      urls: ['https://sarah.dev'],
      note: 'Met at DevFest, likes RL.',
      confidence: 1,
    });
  });

  it('falls back to N when FN is missing (lower confidence) and unfolds lines', () => {
    const [c] = parseVcards(CARD_30_FOLDED);
    expect(c!.fullName).toBe('Omar El-Sayed');
    expect(c!.confidence).toBeLessThan(1);
    expect(c!.note).toBe('A long note that is folded across two lines per RFC.');
    expect(c!.unrecognized).toEqual(['X-CUSTOM:whatever']);
  });

  it('parses multiple cards and skips nameless ones', () => {
    const many = `${CARD_40}\n${CARD_30_FOLDED}\nBEGIN:VCARD\nVERSION:3.0\nEND:VCARD`;
    expect(parseVcards(many)).toHaveLength(2);
  });

  it('keys a card on its UID first and its primary email second', () => {
    const withUid = CARD_40.replace('VERSION:4.0', 'VERSION:4.0\nUID:urn:uuid:9f1c-abc');
    const [c] = parseVcards(withUid);
    expect(c!.identityKeys).toEqual([
      'vcard:person:urn:uuid:9f1c-abc',
      'contact:email:sarah.chen@nile-robotics.com',
    ]);
  });

  it('falls back to the email when the card states no UID', () => {
    const [c] = parseVcards(CARD_30_FOLDED);
    expect(c!.identityKeys).toEqual(['contact:email:omar@example.com']);
  });

  it('keys only the first address, so a shared alias cannot fuse two people', () => {
    const shared = CARD_40.replace('URL:https://sarah.dev', 'EMAIL:team@nile-robotics.com');
    const [c] = parseVcards(shared);
    expect(c!.identityKeys).not.toContain('contact:email:team@nile-robotics.com');
  });

  it('gives a card with neither UID nor email no key at all', () => {
    const [c] = parseVcards('BEGIN:VCARD\nVERSION:4.0\nFN:No Contact Details\nEND:VCARD');
    expect(c!.identityKeys).toEqual([]);
  });

  it('keeps quoted-printable lines as unrecognized instead of garbling', () => {
    const v21 = `BEGIN:VCARD\nVERSION:2.1\nFN;ENCODING=QUOTED-PRINTABLE:=41=68=6D=65=64\nEMAIL:a@b.c\nEND:VCARD`;
    const [c] = parseVcards(v21);
    expect(c!.fullName).toBe('a'); // derived from email local-part
    expect(c!.confidence).toBeLessThanOrEqual(0.7);
    expect(c!.unrecognized.length).toBe(1);
  });
});
