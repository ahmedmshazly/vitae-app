/**
 * OpenAPI contract: the generated document is 3.1-shaped, covers every v1
 * mount prefix, and matches the checked-in docs/api/openapi.json.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SOURCE_TYPES } from '@vitae/core';
import { describe, expect, it } from 'vitest';
import { V1_MOUNT_PREFIXES } from '../../openapi/mounts.js';
import { buildOpenApiDocument } from '../../openapi/spec.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../../../../');
const committedPath = join(repoRoot, 'docs/api/openapi.json');

function pathCoversMount(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

describe('OpenAPI document', () => {
  it('is OpenAPI 3.1 with an Error schema and non-empty paths', () => {
    const doc = buildOpenApiDocument();
    expect(doc.openapi.startsWith('3.')).toBe(true);
    expect(Object.keys(doc.paths ?? {}).length).toBeGreaterThan(10);
    expect(doc.components?.schemas?.Error).toBeTruthy();
    expect(doc.components?.securitySchemes?.bearerAuth).toBeTruthy();
  });

  it('documents at least one path for every v1 mount prefix', () => {
    const paths = Object.keys(buildOpenApiDocument().paths ?? {});
    const missing = V1_MOUNT_PREFIXES.filter(
      (prefix) => !paths.some((p) => pathCoversMount(p, prefix)),
    );
    expect(missing, `undocumented mounts: ${missing.join(', ')}`).toEqual([]);
  });

  it('describes application provenance with the shared source enum', () => {
    const summary = buildOpenApiDocument().components?.schemas?.ApplicationSummary as
      { properties?: { source?: unknown } } | undefined;
    expect(summary?.properties?.source).toEqual({ type: 'string', enum: [...SOURCE_TYPES] });
  });

  it('matches the checked-in docs/api/openapi.json (run pnpm openapi to refresh)', () => {
    const generated = buildOpenApiDocument();
    const committed = JSON.parse(readFileSync(committedPath, 'utf8')) as unknown;
    expect(committed).toEqual(generated);
  });
});
