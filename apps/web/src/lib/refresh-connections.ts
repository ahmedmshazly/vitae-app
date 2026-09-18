import type { QueryClient } from '@tanstack/react-query';

/** A connection can supply both profile evidence and relationship metrics. */
export async function refreshConnections(client: QueryClient) {
  await Promise.all(
    [
      'node',
      'org',
      'people',
      'person-summary',
      'person-profile',
      'person-correspondence',
      'correspondence',
      'intro-targets',
      'intro-paths',
      'graph',
      'graph-discovery',
      'graph-community',
      'graph-community-connection',
      'graph-path',
    ].map((key) => client.invalidateQueries({ queryKey: [key] })),
  );
}
