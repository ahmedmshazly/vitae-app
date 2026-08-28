/**
 * The front door's four states and the two ways in. The "no way in" branch is
 * driven by build-time flags that a browser test cannot flip, so every branch
 * is exercised here against a mocked auth context rather than half here and
 * half in Playwright.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SignIn, SignInSplash } from './SignIn.js';

const auth = {
  signInDev: vi.fn(),
  signInGoogle: vi.fn(),
  devLoginEnabled: true,
  googleEnabled: true,
  cloudEnabled: false,
  accountError: null as string | null,
};
vi.mock('../lib/auth.js', () => ({ useAuth: () => auth, useCanWrite: () => true, WRITE_LOCK_HINT: 'Read-only workspace' }));

function renderSignIn(over: Partial<typeof auth> = {}) {
  Object.assign(auth, over);
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <SignIn />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  auth.signInDev = vi.fn().mockResolvedValue(undefined);
  auth.signInGoogle = vi.fn().mockResolvedValue(undefined);
  auth.devLoginEnabled = true;
  auth.googleEnabled = true;
  auth.cloudEnabled = false;
  auth.accountError = null;
});

describe('SignIn, which ways in are offered', () => {
  it('offers both when both are configured, with Google as the primary', () => {
    renderSignIn();
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toHaveClass(
      'vt-btn--primary',
    );
    expect(screen.getByRole('button', { name: /Developer sign-in/ })).not.toHaveClass(
      'vt-btn--primary',
    );
    expect(screen.getByText(/configured as the owner of this instance/i)).toBeInTheDocument();
    expect(
      screen.getByText(/accounts that do not match the configured owner email are denied/i),
    ).toBeInTheDocument();
  });

  it('promotes the developer button to primary when it is the only way in', () => {
    renderSignIn({ googleEnabled: false });
    expect(screen.queryByRole('button', { name: /Google/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Developer sign-in/ })).toHaveClass(
      'vt-btn--primary',
    );
    expect(
      screen.getByText(/local developer shortcut enabled for this build/i),
    ).toBeInTheDocument();
  });

  it('hides the developer shortcut outside a local developer runtime', () => {
    renderSignIn({ devLoginEnabled: false });
    expect(screen.queryByRole('button', { name: /Developer/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeInTheDocument();
  });

  it('says so plainly when the build has no way in at all', () => {
    renderSignIn({ googleEnabled: false, devLoginEnabled: false });
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('No sign-in method is configured.');
    // A build problem, so it names the thing to check rather than a Retry.
    expect(alert).toHaveTextContent('VITE_FIREBASE_');
  });

  it('turns the signup route into a clear Cloud trial door when Cloud is enabled', () => {
    auth.cloudEnabled = true;
    render(
      <MemoryRouter
        initialEntries={['/signup']}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <SignIn />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Start your 14-day trial' })).toBeInTheDocument();
    expect(screen.getByText(/one private workspace and does not ask for a card/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument();
  });
});

describe('SignIn, pending and failure', () => {
  it('marks only the button that is actually running', async () => {
    const user = userEvent.setup();
    // Never resolves: the pending state has to be observable while in flight.
    auth.signInGoogle = vi.fn(() => new Promise<void>(() => {}));
    renderSignIn();

    await user.click(screen.getByRole('button', { name: 'Continue with Google' }));

    expect(await screen.findByRole('button', { name: 'Signing in...' })).toBeInTheDocument();
    // A single shared flag made this one claim to be signing in too.
    expect(screen.getByRole('button', { name: /Developer sign-in/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Developer sign-in/ })).toBeDisabled();
  });

  it('reports a failed sign-in with a word and a glyph, not just a colour', async () => {
    const user = userEvent.setup();
    auth.signInGoogle = vi
      .fn()
      .mockRejectedValue(new Error('This Google account is not authorized for this system.'));
    renderSignIn();

    await user.click(screen.getByRole('button', { name: 'Continue with Google' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Sign-in failed.');
    expect(alert).toHaveTextContent('This Google account is not authorized for this system.');
    expect(alert.querySelector('svg')).toBeInTheDocument();
  });

  it('re-enables both ways in after a failure, so a dead popup is not a trap', async () => {
    const user = userEvent.setup();
    auth.signInGoogle = vi.fn().mockRejectedValue(new Error('Popup closed.'));
    renderSignIn();

    await user.click(screen.getByRole('button', { name: 'Continue with Google' }));
    await screen.findByRole('alert');

    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeEnabled();
    expect(screen.getByRole('button', { name: /Developer sign-in/ })).toBeEnabled();
  });

  it('clears a stale error when the other way in is tried', async () => {
    const user = userEvent.setup();
    auth.signInGoogle = vi.fn().mockRejectedValue(new Error('Popup closed.'));
    auth.signInDev = vi.fn(() => new Promise<void>(() => {}));
    renderSignIn();

    await user.click(screen.getByRole('button', { name: 'Continue with Google' }));
    await screen.findByRole('alert');

    await user.click(screen.getByRole('button', { name: /Developer sign-in/ }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });
});

describe('SignInSplash', () => {
  it('is the sign-in layout with its controls skeletonised, not a page spinner', () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <SignInSplash />
      </MemoryRouter>,
    );
    expect(screen.getByRole('status', { name: 'Checking your session' })).toBeInTheDocument();
    // The identity is already on screen, so resolving auth reveals the door
    // rather than replacing one screen with another.
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Take the tour' })).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
