import { Link, useLocation } from 'react-router-dom';
import {
  EmptyState,
  Glyph,
  Mono,
  PageHeader,
  RegisterRule,
  Section,
  StatusTrace,
} from '@vitae/ui';
import { HUBS, hubForPath } from '../app/routes.js';

/**
 * A real 404.
 *
 * Until this existed, `path="*"` rendered the Dashboard and the breadcrumb fell
 * back to "Today", so a typo'd or dead URL was indistinguishable from a
 * successful navigation home: the user saw their own dashboard and had no way
 * to know the link they followed was broken.
 *
 * Three things it owes the user, and each of them is a shipped primitive rather
 * than a shape invented here:
 *
 * - the address, in mono, because it is the one piece of information they
 *   cannot get anywhere else and it is what they would paste into a bug
 *   report. It rides a `StatusTrace` now, which is this system's inline
 *   grammar for "a thing did not work", so the failure is announced politely
 *   instead of sitting in a styled `<p>` that no live region ever reads.
 * - a way out that is a link. It used to be a `<Button>` inside a `<Link>`,
 *   which is a control nested in an anchor: invalid HTML, two overlapping
 *   targets with the same name, and browsers disagree about which one the
 *   keyboard lands on. On the one page whose entire job is the way out, the
 *   way out was the broken part.
 * - every other way out, as a ruled index rather than a single dead end. A
 *   404 reached from a stale bookmark is usually a person who wanted a
 *   *workspace*, not Today, and `HUBS` is the same registry the rail is built
 *   from, so this list cannot drift away from the real navigation.
 *
 * `hubForPath` resolves compatibility URLs as well as canonical ones, so when
 * the dead address still looks like it belonged somewhere we say where, and
 * mark that row as the likely one. When it resolves to nothing we say nothing:
 * guessing a workspace for `/wombat` would be the screen inventing a fact.
 *
 * IDENTITY.md voice: say what happened and what to do, never "Oops", never
 * "Sorry", no exclamation marks.
 */
export function NotFound() {
  const { pathname } = useLocation();
  const likely = hubForPath(pathname);

  return (
    <div className="page">
      <PageHeader title="Not found" subtitle="That address does not match anything in this space." />
      <RegisterRule />

      {/* Warning, not danger: nothing of the user's is broken or lost, and an
          assertive alert would interrupt a screen reader to report a typo. */}
      <StatusTrace tone="warning" label="Requested address did not resolve" detail={pathname} />

      <EmptyState
        glyph="search"
        title="No page at this address"
        hint="It may have been renamed, or the record it pointed at may have been deleted."
        action={
          <Link to="/" className="vt-btn vt-btn--primary">
            Go to Today
          </Link>
        }
      />

      <Section title="Every workspace" meta={HUBS.length}>
        <ul className="notfound-hubs">
          {HUBS.map((hub) => {
            const isLikely = likely != null && hub.id === likely;
            return (
              <li key={hub.id} className="row">
                <span className="notfound-hubs__glyph" aria-hidden>
                  <Glyph name={hub.glyph} size={14} />
                </span>
                <Link to={hub.path} className="notfound-hubs__link">
                  <span className="row__title">{hub.label}</span>
                  <span className="row__sub">{hub.description}</span>
                </Link>
                {/* The guess is a word as well as a position, so it survives
                    being read as text. */}
                {isLikely && (
                  <Mono className="text-xs text-muted">closest match to that address</Mono>
                )}
              </li>
            );
          })}
        </ul>
      </Section>
    </div>
  );
}
