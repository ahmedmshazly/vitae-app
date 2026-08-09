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
    const before = await buildExport({ includeSensitive: true });
    const nodeCount = await repository.docCount('nodes');
    const corrupt = { ...before.files, 'nodes.jsonl': `${String(before.files['nodes.jsonl'])}\n{}` };
    await expect(restoreBundle(corrupt, { force: true })).rejects.toBeInstanceOf(RestoreError);
    expect(await repository.docCount('nodes')).toBe(nodeCount);
  }, 60_000);
});
