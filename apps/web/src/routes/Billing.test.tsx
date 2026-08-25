import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithApp } from '../test/render.js';
import { Billing, billingAccessDetail, billingPeriodFromSearch } from './Billing.js';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  openPaddleCheckout: vi.fn(),
  paddleCheckoutReady: vi.fn(),
  cloudEnabled: true,
}));

vi.mock('../lib/api.js', () => ({ api: { get: mocks.get, post: mocks.post } }));
vi.mock('../lib/auth.js', () => ({ useAuth: () => ({ cloudEnabled: mocks.cloudEnabled }), useCanWrite: () => true, WRITE_LOCK_HINT: 'Read-only workspace' }));
vi.mock('../lib/paddle.js', () => ({
  openPaddleCheckout: mocks.openPaddleCheckout,
  paddleCheckoutReady: mocks.paddleCheckoutReady,
}));

function trialBilling() {
  return {
    plan: 'cloud_individual' as const,
    access: {
      state: 'trialing' as const,
      trialEndsAt: '2026-09-06T00:00:00.000Z',
      graceEndsAt: null,
      deletionScheduledAt: null,
    },
    customer: { configured: false, provider: 'paddle' as const },
    subscription: null,
  };
}

beforeEach(() => {
  mocks.cloudEnabled = true;
  mocks.get.mockResolvedValue(trialBilling());
  mocks.post.mockResolvedValue({ transactionId: 'txn_test_123' });
  mocks.openPaddleCheckout.mockResolvedValue(undefined);
  mocks.paddleCheckoutReady.mockReturnValue(true);
});

describe('billing access language', () => {
  it('makes the trial date explicit instead of relying on a status colour', () => {
    expect(billingAccessDetail(trialBilling().access)).toBe('Trial access ends Sep 6, 2026.');
  });

  it('names the export deadline for a read-only workspace', () => {
    expect(
      billingAccessDetail({
        state: 'read_only',
        trialEndsAt: null,
        graceEndsAt: '2026-10-03T00:00:00.000Z',
        deletionScheduledAt: null,
      }),
    ).toBe('Export remains available through Oct 3, 2026.');
  });

  it('accepts only the explicit monthly handoff preference', () => {
    expect(billingPeriodFromSearch('monthly')).toBe('monthly');
    expect(billingPeriodFromSearch('annual')).toBe('annual');
    expect(billingPeriodFromSearch('anything-else')).toBe('annual');
  });
});

describe('Billing', () => {
  it('creates a server-priced transaction before opening checkout', async () => {
    const user = userEvent.setup();
    renderWithApp(<Billing />, { route: '/settings/billing' });

    expect(await screen.findByText('Full trial access')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Monthly · $24 / month' }));
    await user.click(screen.getByRole('button', { name: 'Continue to secure checkout' }));

    expect(mocks.post).toHaveBeenCalledWith('/billing/checkout', { billingPeriod: 'monthly' });
    expect(mocks.openPaddleCheckout).toHaveBeenCalledWith('txn_test_123');
  });

  it('keeps a monthly selection through the signup handoff', async () => {
    const user = userEvent.setup();
    renderWithApp(<Billing />, { route: '/settings/billing?period=monthly' });

    await screen.findByText('Full trial access');
    await user.click(screen.getByRole('button', { name: 'Continue to secure checkout' }));

    expect(mocks.post).toHaveBeenCalledWith('/billing/checkout', { billingPeriod: 'monthly' });
  });

  it('uses the provider portal after a customer exists', async () => {
    mocks.get.mockResolvedValue({
      ...trialBilling(),
      customer: { configured: true, provider: 'paddle' as const },
      subscription: {
        status: 'active',
        billingPeriod: 'annual' as const,
        currentPeriodEndsAt: '2027-08-23T00:00:00.000Z',
        cancelAtPeriodEnd: false,
      },
    });
    renderWithApp(<Billing />, { route: '/settings/billing' });

    expect(await screen.findByRole('button', { name: 'Manage billing' })).toBeInTheDocument();
  });
});
