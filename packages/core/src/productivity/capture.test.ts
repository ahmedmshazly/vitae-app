import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseCapture } from './capture.js';
import { captureCasesSchema } from './fixture-schemas.js';

function readCases() {
  const path = fileURLToPath(new URL('./__fixtures__/capture-cases.json', import.meta.url));
  return captureCasesSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
}

describe('parseCapture fixtures', () => {
  it('executes every capture-cases.json row', () => {
    for (const row of readCases()) {
      const parsed = parseCapture(row.input.text, { now: row.input.now, timeZone: 'UTC' });
      expect({ id: row.id, title: parsed.title, fields: parsed.fields }).toEqual({
        id: row.id,
        title: row.expected.title,
        fields: row.expected.fields,
      });
    }
  });
});

describe('parseCapture: Vitae tokens', () => {
  const ctx = { now: '2026-09-04T15:00:00.000Z', timeZone: 'UTC' as const };

  it('maps !p1–!p4 to Vitae priority and leaves !p0 in the title', () => {
    expect(parseCapture('Renew passport !p2', ctx).fields.priority).toBe('p2');
    const leftover = parseCapture('Renew passport !p0', ctx);
    expect(leftover.fields.priority).toBeUndefined();
    expect(leftover.title).toBe('Renew passport !p0');
  });

  it('reads importance assertion tokens', () => {
    const parsed = parseCapture('Renew passport !important', ctx);
    expect(parsed.title).toBe('Renew passport');
    expect(parsed.fields.importance).toBe('important');
    expect(parseCapture('Call the bank !critical', ctx).fields.importance).toBe('critical');
  });

  it('keeps an unparseable date in the title', () => {
    const parsed = parseCapture('Renew passport due 2026-13-40', ctx);
    expect(parsed.fields.due).toBeUndefined();
    expect(parsed.title).toContain('due 2026-13-40');
  });

  it('resolves tomorrow as a date-only field against the given now', () => {
    const parsed = parseCapture('Renew passport due tomorrow', ctx);
    expect(parsed.fields.due).toBe('2026-09-05');
    expect(parsed.title).toBe('Renew passport');
  });
});
