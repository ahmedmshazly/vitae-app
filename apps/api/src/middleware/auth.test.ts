/**
 * Cross-project token acceptance (SRS T1).
 *
 * Accepting a second Firebase project widens *which identity provider can prove
 * I am the owner*. It must not widen *who the owner is*. These tests pin the
 * three conditions that make the wider door safe:
 *
 *   - the email must still equal OWNER_EMAIL,
 *   - it must be verified, the companion project's sign-in methods are not
 *     ours to govern, so an unverified address could otherwise be set to the
 *     owner's and used to walk in,
 *   - it must come from Google sign-in, for the same reason.
 *
 * No emulator needed: the Firebase verifiers are stubbed, because what is under
 * test is the decision made about their output.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const verifyIdToken = vi.fn();
const verifyTrusted = vi.fn();

vi.mock('../firebase.js', () => ({
  auth: { verifyIdToken },
  trustedAuth: { verifyIdToken: verifyTrusted },
  firestore: {},
  app: {},
}));

vi.mock('../env.js', () => ({
  env: {
    OWNER_EMAIL: 'owner@example.com',
    SESSION_SECRET: 'test-session-secret-at-least-16',
    AUTH_ENABLE_DEV_LOGIN: false,
    TRUSTED_FIREBASE_PROJECT_ID: 'aperture-project',
  },
}));

const OWNER = 'owner@example.com';

/** A decoded Firebase token as the companion project would issue it. */
function decoded(overrides: Record<string, unknown> = {}) {
  return {
    email: OWNER,
    email_verified: true,
    firebase: { sign_in_provider: 'google.com' },
    ...overrides,
  };
}

async function runGate(): Promise<{ status: number; user?: { email: string } }> {
  const { authGate } = await import('./auth.js');
  const req = {
    baseUrl: '/api',
    path: '/v1/nodes',
    header: (name: string) => (name === 'authorization' ? 'Bearer some-token' : undefined),
    cookies: {},
  } as never;
  let status = 200;
  const res = {
    status(code: number) {
      status = code;
      return this;
    },
    json() {
      return this;
    },
  } as never;
  let nexted = false;
  await authGate(req, res, () => {
    nexted = true;
  });
  return { status: nexted ? 200 : status, user: (req as { user?: { email: string } }).user };
}

describe('cross-project Firebase tokens', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // The primary project rejects it, that is the whole premise: a token from
    // another project cannot verify here.
    verifyIdToken.mockRejectedValue(new Error('wrong audience'));
  });

  it('accepts the owner signed in through the trusted project', async () => {
    verifyTrusted.mockResolvedValue(decoded());
    const result = await runGate();
    expect(result.status).toBe(200);
    expect(result.user?.email).toBe(OWNER);
  });

  it('rejects a different email, however well signed', async () => {
    verifyTrusted.mockResolvedValue(decoded({ email: 'someone.else@example.com' }));
    expect((await runGate()).status).toBe(401);
  });

  it('rejects an unverified email', async () => {
    verifyTrusted.mockResolvedValue(decoded({ email_verified: false }));
    expect((await runGate()).status).toBe(401);
  });

  it('rejects a non-Google sign-in provider', async () => {
    verifyTrusted.mockResolvedValue(decoded({ firebase: { sign_in_provider: 'password' } }));
    expect((await runGate()).status).toBe(401);
  });

  it('rejects a token no configured project can verify', async () => {
    verifyTrusted.mockRejectedValue(new Error('wrong audience'));
    expect((await runGate()).status).toBe(401);
  });
});
