import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, Section } from '@vitae/ui';
import { api } from '../lib/api.js';
import { QueryBoundary } from '../components/QueryBoundary.js';
import { ConnectionRow, type ConnectionEdge } from './forms/ConnectionRow.js';

export interface OrganizationRecordData {
  node: {
    id: string;
    subtitle?: string | null;
    props: Record<string, unknown>;
    notes_md?: string | null;
  };
  edges: ConnectionEdge[];
  neighbors: Record<string, { id: string; type: string; title: string }>;
}

export function useOrganizationRecord(id: string) {
  return useQuery({
    queryKey: ['node', id],
    queryFn: async () => {
      const result = await api.get<OrganizationRecordData>(`/nodes/${id}`);
      if (!result.node || !Array.isArray(result.edges) || !result.neighbors)
        throw new Error('The organization details were not returned. Try again.');
      return result;
    },
  });
}

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
function safeWeb(value: string) {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}

export function OrganizationDetails({
  query,
}: {
  query: ReturnType<typeof useOrganizationRecord>;
}) {
  return (
    <Section title="Details">
      <QueryBoundary
        query={query}
        loadingLabel="Loading organization details"
        errorTitle="Couldn’t load organization details"
        staleErrorTitle="Organization details could not be refreshed"
        skeletonRows={3}
      >
        {({ node }) => (
          <>
            {node.subtitle && <p className="organization-summary">{node.subtitle}</p>}
            <dl className="organization-details">
              {[
                ['Industry', text(node.props.industry)],
                ['Size', text(node.props.size_hint)],
                ['Website', text(node.props.website)],
                ['LinkedIn', text(node.props.linkedin_url)],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>
                    {value ? (
                      ['Website', 'LinkedIn'].includes(label!) && safeWeb(value) ? (
                        <a href={safeWeb(value)} target="_blank" rel="noopener noreferrer">
                          {value}
                          <span className="sr-only"> (opens in a new tab)</span>
                        </a>
                      ) : (
                        value
                      )
                    ) : (
                      'Not recorded'
                    )}
                  </dd>
                </div>
              ))}
            </dl>
            {text(node.notes_md) && (
              <details className="organization-notes">
                <summary>Notes</summary>
                <div>{node.notes_md}</div>
              </details>
            )}
          </>
        )}
      </QueryBoundary>
    </Section>
  );
}

export function OrganizationConnections({
  query,
  id,
}: {
  query: ReturnType<typeof useOrganizationRecord>;
  id: string;
}) {
  const [limit, setLimit] = useState(20);
  return (
    <Section title="All connections" meta={query.data?.edges.length}>
      <p className="organization-hint">
        Review the records linked to this organization. Removing a connection keeps both records.
      </p>
      <QueryBoundary
        query={query}
        loadingLabel="Loading organization connections"
        errorTitle="Couldn’t load organization connections"
        staleErrorTitle="Organization connections could not be refreshed"
        skeletonRows={3}
      >
        {({ edges, neighbors }) =>
          edges.length ? (
            <>
              <ul
                className="network-rows organization-connections"
                aria-label="Organization connections"
              >
                {edges.slice(0, limit).map((edge) => (
                  <ConnectionRow
                    as="li"
                    key={edge.id}
                    edge={edge}
                    nodeId={id}
                    neighbors={neighbors}
                  />
                ))}
              </ul>
              {edges.length > limit && (
                <Button onClick={() => setLimit((value) => value + 20)}>
                  Show more connections ({edges.length - limit} remaining)
                </Button>
              )}
            </>
          ) : (
            <p>
              No connections recorded yet. Use Add connection to link a person, role or another
              record.
            </p>
          )
        }
      </QueryBoundary>
    </Section>
  );
}
