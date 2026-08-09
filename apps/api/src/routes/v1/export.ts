import { Router } from 'express';
import { Readable } from 'node:stream';
import { finished } from 'node:stream/promises';
import { asyncHandler, HttpError } from '../../middleware/error.js';
import { exportEntries } from '../../services/export.js';
import { repository } from '../../db/repository.js';
import { nowIso } from '../../db/util.js';
import { searchIndex } from '../../db/search-index.js';
import { createZipArchive } from '../../lib/create-zip-archive.js';
import { currentSpace, type Space } from '../../db/space.js';

export const exportRouter: Router = Router();

const STATUS_DOC = 'export_status';
// FR-105: per-space lock so demo and real exports do not block each other.
// Process-local; cross-instance serialization would need a shared lease.
const exportActive = new Set<Space>();

/** One-click full export → ZIP streamed entry by entry (SRS FR-EXP-010). */
exportRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const space = currentSpace();
    if (exportActive.has(space)) throw new HttpError(409, 'EXPORT_IN_PROGRESS', 'Another export is already running.');
    exportActive.add(space);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="vitae-export-${Date.now()}.zip"`);
    const archive = createZipArchive({ zlib: { level: 9 } });
    archive.on('error', (err) => res.destroy(err));
    req.once('aborted', () => archive.abort());
    archive.pipe(res);

    try {
      const gen = exportEntries({ includeSensitive: req.body?.includeSensitive === true });
      let next = await gen.next();
      while (!next.done) {
        if (typeof next.value.content === 'string' || Buffer.isBuffer(next.value.content)) {
          archive.append(next.value.content, { name: next.value.name });
        } else {
          const stream = Readable.from(next.value.content);
          archive.append(stream, { name: next.value.name });
          await finished(stream);
        }
        next = await gen.next();
      }
      await archive.finalize();

      await repository.docPut('meta', STATUS_DOC, {
        last_export_at: nowIso(),
        counts: next.value.counts,
      });
    } finally {
      exportActive.delete(space);
    }
  }),
);

exportRouter.get(
  '/status',
  asyncHandler(async (_req, res) => {
    res.json({ status: await repository.docGet('meta', STATUS_DOC) });
  }),
);

/**
 * Neutralize spreadsheet formula injection (CWE-1236): a cell starting with
 * =, +, -, or @ after whitespace/control characters executes in spreadsheets.
 */
function csvCell(v: unknown): string {
  let s = String(v ?? '');
  const firstVisible = [...s].findIndex(
    (ch) => ch.trim() !== '' && (ch.codePointAt(0) ?? 0) > 0x1f,
  );
  const prefix = firstVisible < 0 ? '' : s[firstVisible];
  if (prefix && '=+-@'.includes(prefix)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Saved view → CSV (SRS FR-EXP); a targeted extract beside the full ZIP. */
exportRouter.get(
  '/views/:id.csv',
  asyncHandler(async (req, res) => {
    const view = await repository.docGet<{ name: string; query: string }>('saved_views', req.params.id);
    if (!view) throw new HttpError(404, 'NOT_FOUND', 'saved view not found');
    const hits = await searchIndex.search(view.query, { limit: 2000 });

    const lines = ['id,type,title,subtitle,updated_at,source'];
    for (const h of hits) {
      if (h.node.sensitivity === 'sensitive' && req.query.includeSensitive !== 'true') continue;
      lines.push(
        [h.node.id, h.node.type, h.node.title, h.node.subtitle ?? '', h.node.updated_at, h.node.source]
          .map(csvCell)
          .join(','),
      );
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${view.name.replace(/[^\w.-]+/g, '-')}.csv"`);
    res.send(lines.join('\n') + '\n');
  }),
);

/** Preview the manifest without downloading, drains the stream, keeps nothing. */
exportRouter.get(
  '/manifest',
  asyncHandler(async (req, res) => {
    const gen = exportEntries({ includeSensitive: req.query.includeSensitive === 'true' });
    let next = await gen.next();
    while (!next.done) {
      if (typeof next.value.content !== 'string' && !Buffer.isBuffer(next.value.content)) {
        for await (const _chunk of next.value.content) {
          // Drain only; manifest preview keeps no file contents in memory.
        }
      }
      next = await gen.next();
    }
    res.json({ manifest: next.value });
  }),
);
