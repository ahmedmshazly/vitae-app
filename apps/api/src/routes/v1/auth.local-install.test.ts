import { describe, expect, it } from 'vitest';
import {
  ownerLoginAllowsPeer,
  sessionCookieSecureFlag,
} from './auth.js';

describe('owner sign-in peer check', () => {
  it('rejects a forwarded container IP without the local-install flag', () => {
    expect(
      ownerLoginAllowsPeer({ localInstall: false, remoteAddress: '172.18.0.4' }),
    ).toBe(false);
  });

  it('accepts a forwarded container IP when the local-install flag is on', () => {
    expect(
      ownerLoginAllowsPeer({ localInstall: true, remoteAddress: '172.18.0.4' }),
    ).toBe(true);
  });

  it('still accepts a true loopback peer', () => {
    expect(
      ownerLoginAllowsPeer({ localInstall: false, remoteAddress: '127.0.0.1' }),
    ).toBe(true);
  });
});

describe('session cookie Secure flag', () => {
  it('is set in hosted production', () => {
    expect(sessionCookieSecureFlag({ nodeEnv: 'production', localInstall: false })).toBe(true);
  });

  it('is unset on a local HTTP install so the owner cookie sticks', () => {
    expect(sessionCookieSecureFlag({ nodeEnv: 'production', localInstall: true })).toBe(false);
  });

  it('is unset in development', () => {
    expect(sessionCookieSecureFlag({ nodeEnv: 'development', localInstall: false })).toBe(false);
  });
});
