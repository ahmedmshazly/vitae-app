/**
 * Restore service: corruption is rejected before force replacement writes (FR-001).
 */
import { afterAll, describe, expect, it } from 'vitest';

afterAll(async () => {
  await new Promise((r) => setTimeout(r, 100));
});

describe('restoreBundle', () => {
  it('validates restore corruption before force replacement writes', async () => {
    const [{ buildExport }, { restoreBundle, RestoreError }, { repository }] = await Promise.all([
      import('./export.js'),
      import('./restore.js'),
      import('../db/repository.js'),
    ]);
    // This file does not seed the graph. Leftover attachments from another
    // suite (or a previous process) still have keys, and MemoryStorage does
    // not. Empty the table so the export under test is self-contained.
    await repository.docTruncate('attachments');
    const before = await buildExport({ includeSensitive: true });
    const nodeCount = await repository.docCount('nodes');
    const corrupt = { ...before.files, 'nodes.jsonl': `${String(before.files['nodes.jsonl'])}\n{}` };
    await expect(restoreBundle(corrupt, { force: true })).rejects.toBeInstanceOf(RestoreError);
    expect(await repository.docCount('nodes')).toBe(nodeCount);
  }, 60_000);
});
