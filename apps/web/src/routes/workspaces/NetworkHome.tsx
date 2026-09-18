import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Glyph, PageHeader, type GlyphName } from '@vitae/ui';
import { NodeFormDialog } from '../../features/forms/NodeFormDialog.js';
import { useCanWrite, WRITE_LOCK_HINT } from '../../lib/auth.js';

const DIRECTORIES = [
  {
    href: '/network/people',
    glyph: 'person',
    title: 'People',
    detail: 'Find someone, review your shared history, and record your next conversation.',
  },
  {
    href: '/network/organizations',
    glyph: 'org',
    title: 'Organizations',
    detail: 'Explore the people, roles, and relationships connected to an organization.',
  },
] satisfies Destination[];
const DISCOVERY = [
  {
    href: '/network/people?filter=decaying',
    glyph: 'today',
    title: 'Review relationships to revisit',
    detail: 'See quieter connections and people past your saved contact cadence.',
  },
  {
    href: '/network/intelligence?lens=contact',
    glyph: 'ask',
    title: 'Who should I contact?',
    detail:
      'Describe what you need and compare suggested people with the reasons behind each match.',
  },
  {
    href: '/network/intelligence?lens=reach',
    glyph: 'merge',
    title: 'Find a warm path',
    detail:
      'Choose a person or organization and explore possible introductions through your network.',
  },
  {
    href: '/network/correspondence',
    glyph: 'interaction',
    title: 'Correspondence',
    detail: 'Revisit once-strong relationships and see who has connected people in your network.',
  },
] satisfies Destination[];
interface Destination {
  href: string;
  glyph: GlyphName;
  title: string;
  detail: string;
}

export function NetworkHome() {
  const [adding, setAdding] = useState(false);
  const addButton = useRef<HTMLButtonElement>(null);
  const canWrite = useCanWrite();
  return (
    <div className="page network-home">
      <PageHeader
        title="Network"
        subtitle="Keep the context. Make the next conversation easier."
        actions={
          <Button
            ref={addButton}
            variant="primary"
            glyph="plus"
            disabled={!canWrite}
            onClick={() => setAdding(true)}
          >
            Add person
          </Button>
        }
      />
      {!canWrite && <p role="status">{WRITE_LOCK_HINT} You can still explore your network.</p>}
      <section aria-labelledby="network-directory-heading" className="network-home__section">
        <div className="network-home__section-heading">
          <h2 id="network-directory-heading">Your relationship directory</h2>
          <p>Start with someone you know, or an organization you want to understand.</p>
        </div>
        <ul className="network-home__directory" aria-label="Network directory">
          {DIRECTORIES.map((destination) => (
            <li key={destination.href}>
              <DestinationLink destination={destination} />
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="network-discovery-heading" className="network-home__section">
        <div className="network-home__section-heading">
          <h2 id="network-discovery-heading">Find your next conversation</h2>
          <p>Use the history you have recorded to decide where to focus.</p>
        </div>
        <ul className="network-home__discovery" aria-label="Network discovery">
          {DISCOVERY.map((destination) => (
            <li key={destination.href}>
              <DestinationLink destination={destination} />
            </li>
          ))}
        </ul>
      </section>
      <p className="network-home__note">
        New to this workspace? Add a person and record how you know them. Recommendations become
        more useful as you add relationship history.
      </p>
      {adding && (
        <NodeFormDialog open type="person" onOpenChange={setAdding} returnFocusRef={addButton} />
      )}
    </div>
  );
}

function DestinationLink({ destination }: { destination: Destination }) {
  return (
    <Link className="network-home__destination" to={destination.href}>
      <Glyph name={destination.glyph} size={20} />
      <span>
        <strong>{destination.title}</strong>
        <span>{destination.detail}</span>
      </span>
      <span className="network-home__arrow" aria-hidden="true">
        →
      </span>
    </Link>
  );
}
