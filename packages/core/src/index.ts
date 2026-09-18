/**
 * @vitae/core: the shared domain. Zod schemas (single source of truth for the
 * data model) and the deterministic §10.7 algorithms (the "science"), imported
 * by both the API and the web app. Nothing here depends on Firestore, Express,
 * or React.
 */
export * from './types.js';
export * from './schema/index.js';
export * from './forms/index.js';
export * from './algorithms/index.js';
export * from './importers/index.js';
export * from './places/index.js';
export * from './cloud/individual-plan.js';
export * from './productivity/index.js';
export * from './knowledge.js';
