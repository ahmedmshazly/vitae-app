/**
 * In-process "something was written" counter.
 *
 * Read models that memoise a full-graph scan need to know when their snapshot
 * went stale. A TTL alone is a bad answer on its own: too long and a value you
 * just created does not appear, too short and the scan runs constantly. This is
 * the cheap half of the pair, bumped once per committed transaction, so a
 * cache can compare generations and rebuild only when the graph actually moved.
 *
 * It lives in `db/` rather than a service because `repository` bumps it, and the
 * repository must not depend on the service layer above it.
 */
let generation = 0;

/** Called by `Repository.transaction` after a successful commit. */
export function bumpWriteGeneration(): void {
  generation += 1;
}

/** The current generation. A cache stores this alongside its snapshot. */
export function writeGeneration(): number {
  return generation;
}
