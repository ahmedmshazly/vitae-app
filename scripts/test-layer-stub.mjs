#!/usr/bin/env node
/**
 * Placeholder for layers that are not yet wired.
 * Set VITAE_REQUIRE_TEST_LAYERS=true to fail (used once the harness exists).
 */
const layer = process.argv[2] ?? 'unknown';
const msg = `test:${layer} is not implemented yet. See docs/testing/coverage-matrix.md.`;

if (process.env.VITAE_REQUIRE_TEST_LAYERS === 'true') {
  console.error(msg);
  process.exit(1);
}

console.warn(`warn: ${msg}`);
process.exit(0);
