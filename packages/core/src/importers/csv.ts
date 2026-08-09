/**
 * RFC 4180 CSV parser (SRS FR-IMP). Hand-rolled, no dependency, because
 * import files are adversarially messy: quoted fields with embedded commas,
 * quotes, and newlines; CRLF/LF mixes; trailing newlines; BOM prefixes.
 * Unparseable structure degrades to fewer/extra cells per row, never a throw.
 */

/** Parse CSV text into rows of cells. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  // Strip a UTF-8 BOM if present.
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(cell);
      cell = '';
      rows.push(row);
      row = [];
    } else {
      cell += ch;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/**
 * Parse CSV with a header row into records. Header matching is tolerant:
 * case-insensitive, whitespace/punctuation-insensitive ("First Name" ≡
 * "first_name" ≡ "FIRSTNAME").
 */
export function parseCsvRecords(text: string): Array<Record<string, string>> {
  const rows = parseCsv(text).filter((r) => r.some((c) => c.trim() !== ''));
  if (rows.length < 2) return [];
  const headers = rows[0]!.map(normalizeHeader);
  return rows.slice(1).map((cells) => {
    const rec: Record<string, string> = {};
    headers.forEach((h, i) => {
      if (h) rec[h] = (cells[i] ?? '').trim();
    });
    return rec;
  });
}

/** Normalize a header cell to a canonical lookup key. */
export function normalizeHeader(h: string): string {
  return h
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** First matching field from a record given candidate normalized headers. */
export function pickField(rec: Record<string, string>, ...candidates: string[]): string {
  for (const c of candidates) {
    const v = rec[c];
    if (v) return v;
  }
  return '';
}
