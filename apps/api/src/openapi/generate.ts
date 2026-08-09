/**
 * Emit docs/api/openapi.json from buildOpenApiDocument().
 *
 *   pnpm --filter @vitae/api openapi
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildOpenApiDocument } from './spec.js';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '../../../../docs/api/openapi.json');

const doc = buildOpenApiDocument();
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
console.log(`wrote ${out}`);
