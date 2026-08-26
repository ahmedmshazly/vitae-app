/**
 * v1 router mount prefixes. Keep in lockstep with `routes/v1/index.ts`
 * (`v1Router.use(...)`). The OpenAPI builder and contract tests both import
 * this list so a new mount cannot land without a matching path entry.
 *
 * Express params (`:personId`) are written in OpenAPI form (`{personId}`).
 */
export const V1_MOUNT_PREFIXES = [
  '/auth',
  '/billing',
  '/nodes',
  '/edges',
  '/capture',
  '/search',
  '/suggest',
  '/ask',
  '/interactions',
  '/atoms',
  '/targets',
  '/resumes',
  '/letters',
  '/reminders',
  '/dashboard',
  '/applications',
  '/status',
  '/docs',
  '/export',
  '/settings',
  '/habits',
  '/people/{personId}/favors',
  '/people',
  '/orgs',
  '/intros',
  '/composer',
  '/graph',
  '/timeline',
  '/map',
  '/places',
  '/views',
  '/ledger',
  '/imports',
  '/duplicates',
  '/retention',
] as const;

export type V1MountPrefix = (typeof V1_MOUNT_PREFIXES)[number];
