/**
 * Sign-in: the only public screen behind the auth gate (SRS P01), and the
 * first impression of the product.
 *
 * Two columns at >=1024px: identity and claim on the left, the ways in on the
 * right, separated by one hairline. The card it replaces was a 400px box
 * marooned in a 1440px void, held off the text by two drifting aurora blobs
 * and a backdrop-filter. A large blank area is a layout problem, not a place
 * to put a wash. Below 1024px it stacks to one left-aligned column with no
 * card, because the card only existed to hold the blobs off the text.
 */
import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Button, Glyph, LogoStacked, RegisterRule, Skeleton } from '@vitae/ui';
import { useAuth } from '../lib/auth.js';

/** Which way in is mid-flight. A single shared flag made the developer button
 * read "Signing in…" while it was Google that was busy, and left it disabled
 * with no way back if the Google popup never resolved. */
type Pending = 'google' | 'dev' | null;

export function SignIn() {
  const { signInDev, signInGoogle, devLoginEnabled, googleEnabled, cloudEnabled, accountError } =
    useAuth();
  const { pathname } = useLocation();
  const isSignup = pathname === '/signup';
  const [pending, setPending] = useState<Pending>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(which: Exclude<Pending, null>, fn: () => Promise<void>) {
    setPending(which);
    setError(null);
    try {
      await fn();
    } catch (err) {
      // Popup closed, wrong account, unauthorized domain: say which, plainly.
      setError(err instanceof Error ? err.message : 'Sign-in failed. Try again.');
    } finally {
      setPending(null);
    }
  }

  return (
    <SignInLayout>
      {!googleEnabled && !devLoginEnabled ? (
        <NoWayIn />
      ) : (
        <>
          <div className="signin__door-head">
            <h2 className="u-display text-md text-ink-strong">
              {cloudEnabled && isSignup ? 'Start your 14-day trial' : 'Sign in'}
            </h2>
            <p className="signin__door-copy">
              {googleEnabled
                ? cloudEnabled
                  ? 'Use a verified Google account. Vitae prepares one private workspace and does not ask for a card to begin.'
                  : 'Use the Google account configured as the owner of this instance.'
                : 'Use the local developer shortcut enabled for this build.'}
            </p>
          </div>

          <div className="signin__providers" aria-busy={pending !== null}>
            {googleEnabled && (
              <Button
                variant="primary"
                size="lg"
                className="w-full justify-center"
                disabled={pending !== null}
                onClick={() => void run('google', signInGoogle)}
              >
                <Glyph name="person" size={16} />
                {pending === 'google' ? 'Signing in…' : 'Continue with Google'}
              </Button>
            )}

            {devLoginEnabled && (
              <Button
                variant={googleEnabled ? 'default' : 'primary'}
                size="lg"
                className="w-full justify-center"
                disabled={pending !== null}
                onClick={() => void run('dev', signInDev)}
              >
                {pending === 'dev' ? 'Signing in…' : 'Developer sign-in'}
                {/* Inherit the button's own foreground rather than --ae-muted.
                    That token is documented at 7.6:1 against the application's
                    dark ground; on this button's near-white fill it measures
                    2.41:1, which axe reports as a serious contrast failure. */}
                <span
                  aria-hidden="true"
                  className="rounded-sm border border-strong px-1 font-mono text-xs"
                >
                  DEV
                </span>
              </Button>
            )}
          </div>

          {/* Never colour alone: the tone carries a glyph and the word "Failed". */}
          {(error || accountError) && (
            <p
              role="alert"
              aria-live="assertive"
              className="signin__error flex items-start gap-2 text-sm text-danger"
            >
              <Glyph name="close" size={14} className="mt-0.5 shrink-0" />
              <span>
                <strong className="font-semibold">
                  {error ? 'Sign-in failed.' : 'Workspace setup needs attention.'}
                </strong>{' '}
                {error ?? accountError}
              </span>
            </p>
          )}

          <p className="signin__access-note">
            {cloudEnabled
              ? 'One private workspace. Your account never selects or shares another person’s records.'
              : 'This is a single-owner system. Verified accounts that do not match the configured owner email are denied.'}
          </p>
        </>
      )}
    </SignInLayout>
  );
}

/**
 * The auth splash: what the gate shows while it works out whether there is a
 * session. It is the same layout with the ways in skeletonised, so resolving
 * auth reveals the door rather than replacing one screen with another.
 * A centred full-page spinner is what this used to be, and the book bans it.
 */
export function SignInSplash() {
  return (
    <SignInLayout>
      <div className="signin__door-head">
        <h2 className="u-display text-md text-ink-strong">Sign in</h2>
        <p className="signin__door-copy">Checking this browser for an existing session.</p>
      </div>
      <div className="signin__providers" role="status" aria-label="Checking your session">
        <Skeleton height={44} />
        <Skeleton height={44} />
      </div>
    </SignInLayout>
  );
}

/** Neither way in is configured: a build problem, said as one. */
function NoWayIn() {
  return (
    <>
      <div className="signin__door-head">
        <h2 className="u-display text-md text-ink-strong">No way in</h2>
        <p className="signin__door-copy">This build cannot authenticate an account yet.</p>
      </div>
      <p role="alert" className="flex items-start gap-2 text-sm text-danger">
        <Glyph name="close" size={14} className="mt-0.5 shrink-0" />
        <span>
          <strong className="font-semibold">No sign-in method is configured.</strong> This build has
          neither Google sign-in nor the developer shortcut. Check{' '}
          <code className="font-mono">VITE_FIREBASE_*</code> in the environment it was built with.
        </span>
      </p>
    </>
  );
}

/**
 * A floor-to-ceiling split rather than a centred block: identity left, the
 * door right, one hairline between them running the full height. It gives the
 * hairline a real job (separating two regions instead of two paragraphs) and
 * uses the viewport instead of leaving a void around a card. Below 1024px the
 * two stack and the hairline turns horizontal.
 */
function SignInLayout({ children }: { children: React.ReactNode }) {
  const { cloudEnabled } = useAuth();
  const { pathname } = useLocation();
  const isSignup = pathname === '/signup';
  return (
    <main className="signin grid min-h-screen lg:grid-cols-[1fr_26rem]">
      {/* Content is centred within its own column, not pinned to the page
          edge. A 1fr column at 1440px is 1000px wide, and left-pinning a
          36ch block inside it just moves the void from one side to the other. */}
      <section className="signin__identity flex flex-col justify-center gap-6 p-6 lg:items-center lg:p-12">
        <div className="signin__identity-inner max-w-[42rem]">
          <LogoStacked markSize={56} style={{ alignItems: 'flex-start' }} />
          {/* A sign-in screen has nothing true to encode, so the rule carries
              no ticks. Faking them is worse than having none. */}
          <div className="signin__register mt-6">
            <RegisterRule />
          </div>
          <h1 className="signin__claim">
            Turn the career you have lived into the next role you can reach.
          </h1>
          <p className="signin__identity-copy">
            Vitae keeps the people, work evidence, and next decisions behind a considered career
            move connected in a private record you can inspect and export.
          </p>
          <ol className="signin__ledger" aria-label="How Vitae turns memory into action">
            <li>
              <span>Capture</span>
              <strong>One line or a structured form</strong>
            </li>
            <li>
              <span>Connect</span>
              <strong>Typed records with provenance</strong>
            </li>
            <li>
              <span>Act</span>
              <strong>Reconnect, rank, compile, export</strong>
            </li>
          </ol>
        </div>
      </section>

      <div className="signin__door flex flex-col justify-center gap-4 border-t border-hairline p-6 lg:border-t-0 lg:border-l lg:p-12">
        {children}
        <p className="signin__foot mt-4 border-t border-hairline pt-4 text-xs leading-normal text-faint">
          <span className="signin__instance">
            {cloudEnabled
              ? 'Private workspace · evidence first · exportable'
              : 'Single-owner · self-hosted · default-deny'}
          </span>
          <br />
          {cloudEnabled ? (
            <>
              {isSignup ? (
                <>
                  Already have a workspace? <Link to="/signin">Sign in</Link>
                </>
              ) : (
                <>
                  New here? <Link to="/signup">Start a 14-day trial</Link>
                </>
              )}{' '}
              · <Link to="/tour">Take the tour</Link>
            </>
          ) : (
            <>
              New here? <Link to="/tour">Take the tour</Link> · <Link to="/">What is Vitae?</Link>
            </>
          )}
        </p>
      </div>
    </main>
  );
}
