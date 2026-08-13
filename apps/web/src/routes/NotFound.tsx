import { Link, useLocation } from 'react-router-dom';
import { Button, EmptyState, Mono, PageHeader } from '@vitae/ui';

/**
 * A real 404.
 *
 * Until this existed, `path="*"` rendered the Dashboard and the breadcrumb fell
 * back to "Today", so a typo'd or dead URL was indistinguishable from a
 * successful navigation home: the user saw their own dashboard and had no way
 * to know the link they followed was broken.
 *
 * The path is shown back in mono because that is the one piece of information
 * the user cannot get anywhere else, and it is what they would paste into a bug
 * report. IDENTITY.md voice: say what happened and what to do, never "Oops",
 * never "Sorry", no exclamation marks.
 */
export function NotFound() {
  const { pathname } = useLocation();
  return (
    <div className="page">
      <PageHeader title="Not found" subtitle="That address does not match anything in this space." />
      <EmptyState
        glyph="search"
        title="No page at this address"
        hint="It may have been renamed, or the record it pointed at may have been deleted."
        action={
          <Link to="/">
            <Button variant="primary">Go to Today</Button>
          </Link>
        }
      />
      <p className="u-faint" style={{ marginTop: 'var(--ae-space-4)', fontSize: 'var(--ae-text-sm)' }}>
        Requested <Mono>{pathname}</Mono>
      </p>
    </div>
  );
}
