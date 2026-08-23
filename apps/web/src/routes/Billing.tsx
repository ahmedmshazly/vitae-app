/**
 * Hosted-account billing is intentionally a small, inspectable boundary.
 * Access always comes from the server's lifecycle state; a successful browser
 * checkout is never treated as permission on its own.
 */
import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Chip,
  ErrorState,
  Mono,
  PageHeader,
  RegisterRule,
  Section,
  SkeletonRows,
  StatusTrace,
} from '@vitae/ui';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.js';
import { openPaddleCheckout, paddleCheckoutReady } from '../lib/paddle.js';
import { useToast } from '../features/Toast.js';
import {
  CLOUD_INDIVIDUAL_PLAN,
  type CloudIndividualBillingPeriod,
} from '../../../../packages/core/src/cloud/individual-plan.ts';

type BillingPeriod = CloudIndividualBillingPeriod;
type AccessState = 'trialing' | 'active' | 'past_due' | 'read_only' | 'deletion_pending';

interface BillingResponse {
  plan: typeof CLOUD_INDIVIDUAL_PLAN.code;
  access: {
    state: AccessState;
    trialEndsAt: string | null;
    graceEndsAt: string | null;
    deletionScheduledAt: string | null;
  };
  customer: { configured: boolean; provider: 'paddle' };
  subscription: {
    status: string;
    billingPeriod: BillingPeriod | null;
    currentPeriodEndsAt: string | null;
    cancelAtPeriodEnd: boolean;
  } | null;
}

const ACCESS_COPY: Record<AccessState, { label: string; tone: 'accent' | 'success' | 'warning' | 'danger'; detail: string }> = {
  trialing: {
    label: 'Full trial access',
    tone: 'accent',
    detail: 'Everything in the private career record is available while you decide whether to continue.',
  },
  active: {
    label: 'Paid access active',
    tone: 'success',
    detail: 'Your private career record is active on Vitae Cloud Individual.',
  },
  past_due: {
    label: 'Payment needs attention',
    tone: 'warning',
    detail: 'Update payment details to keep the workspace from moving to read-only access.',
  },
  read_only: {
    label: 'Read-only access',
    tone: 'warning',
    detail: 'You can inspect and export your record, but changes are paused until you continue the plan.',
  },
  deletion_pending: {
    label: 'Deletion scheduled',
    tone: 'danger',
    detail: 'Export the complete record before the scheduled account deletion date.',
  },
};

function formatPlanPrice(minorUnits: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: CLOUD_INDIVIDUAL_PLAN.currency,
    maximumFractionDigits: 0,
  }).format(minorUnits / 100);
}

const BILLING_PERIOD_LABEL: Record<BillingPeriod, string> = {
  monthly: `Monthly · ${formatPlanPrice(CLOUD_INDIVIDUAL_PLAN.billing.monthly.priceMinorUnits)} / month`,
  annual: `Annual · ${formatPlanPrice(CLOUD_INDIVIDUAL_PLAN.billing.annual.priceMinorUnits)} / year`,
};

function friendlyDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

/** The browser may remember a marketing preference, but the API still owns the price and checkout. */
export function billingPeriodFromSearch(value: string | null): BillingPeriod {
  return value === 'monthly' ? 'monthly' : 'annual';
}

export function billingAccessDetail(access: BillingResponse['access']): string {
  const deletionDate = friendlyDate(access.deletionScheduledAt);
  if (deletionDate) return `Deletion is scheduled for ${deletionDate}.`;
  const graceDate = friendlyDate(access.graceEndsAt);
  if (access.state === 'read_only' && graceDate) return `Export remains available through ${graceDate}.`;
  const trialDate = friendlyDate(access.trialEndsAt);
  if (access.state === 'trialing' && trialDate) return `Trial access ends ${trialDate}.`;
  return ACCESS_COPY[access.state].detail;
}

function PeriodPicker({ value, onChange }: { value: BillingPeriod; onChange: (value: BillingPeriod) => void }) {
  return (
    <fieldset className="m-0 flex flex-wrap gap-2 border-0 p-0" aria-label="Billing period">
      <legend className="mb-2 text-sm text-muted">Choose a billing period</legend>
      <Button
        type="button"
        size="sm"
        variant={value === 'annual' ? 'primary' : 'default'}
        aria-pressed={value === 'annual'}
        onClick={() => onChange('annual')}
      >
        {BILLING_PERIOD_LABEL.annual}
      </Button>
      <Button
        type="button"
        size="sm"
        variant={value === 'monthly' ? 'primary' : 'default'}
        aria-pressed={value === 'monthly'}
        onClick={() => onChange('monthly')}
      >
        {BILLING_PERIOD_LABEL.monthly}
      </Button>
    </fieldset>
  );
}

export function Billing() {
  const { cloudEnabled } = useAuth();
  const [searchParams] = useSearchParams();
  const [period, setPeriod] = useState<BillingPeriod>(() =>
    billingPeriodFromSearch(searchParams.get('period')),
  );
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { flash } = useToast();
  const billing = useQuery({
    queryKey: ['billing'],
    queryFn: () => api.get<BillingResponse>('/billing'),
    enabled: cloudEnabled,
  });

  const checkout = useMutation({
    mutationFn: async (billingPeriod: BillingPeriod) => {
      const transaction = await api.post<{ transactionId: string }>('/billing/checkout', {
        billingPeriod,
      });
      await openPaddleCheckout(transaction.transactionId);
    },
    onError: (error: Error) => {
      flash(error.message || 'Secure checkout could not open. Try again shortly.');
    },
  });
  const portal = useMutation({
    mutationFn: () => api.post<{ url: string }>('/billing/portal'),
    onSuccess: ({ url }) => {
      window.location.assign(url);
    },
    onError: (error: Error) => {
      flash(error.message || 'Billing management could not open. Try again shortly.');
    },
  });

  useEffect(() => {
    if (searchParams.get('checkout') !== 'completed') return;
    flash('Checkout submitted. Vitae will update access after the provider verifies payment.');
    void queryClient.invalidateQueries({ queryKey: ['billing'] });
    navigate('/settings/billing', { replace: true });
  }, [flash, navigate, queryClient, searchParams]);

  if (!cloudEnabled) return <Navigate to="/settings" replace />;

  return (
    <div className="page">
      <PageHeader
        title="Billing & access"
        subtitle="One private Cloud workspace, one clear lifecycle, and no hidden exit."
      />
      <RegisterRule
        ticks={[
          { at: 0.05, label: 'Trial' },
          { at: 0.5, label: 'Continue' },
          { at: 0.95, label: 'Export' },
        ]}
        label="Account lifecycle"
      />

      {billing.isError ? (
        <ErrorState
          title="Couldn’t load billing"
          detail={(billing.error as Error | null)?.message}
          onRetry={() => void billing.refetch()}
          retrying={billing.isFetching}
        />
      ) : billing.isLoading || !billing.data ? (
        <SkeletonRows rows={7} label="Loading billing and access" />
      ) : (
        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1.25fr)_minmax(280px,0.75fr)]">
          <div className="min-w-0">
            <Section
              title="Workspace access"
              actions={<Chip tone={ACCESS_COPY[billing.data.access.state].tone} mono>{ACCESS_COPY[billing.data.access.state].label}</Chip>}
            >
              <p className="m-0 text-sm text-ink-soft">{billingAccessDetail(billing.data.access)}</p>
              {billing.data.access.state === 'read_only' || billing.data.access.state === 'deletion_pending' ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link to="/data/exports" className="vt-btn vt-btn--sm">
                    Export your record
                  </Link>
                </div>
              ) : null}
            </Section>

            <Section title="Vitae Cloud Individual" meta="one workspace">
              <p className="m-0 mb-4 text-sm text-ink-soft">
                Capture, relationship intelligence, career evidence, tailoring, and full export are included. There are no contact or output credits.
              </p>
              {billing.data.subscription ? (
                <dl className="m-0 grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-6">
                  <div className="col-span-2 grid grid-cols-subgrid items-center border-b border-hairline py-2">
                    <dt className="text-sm text-muted">Plan</dt>
                    <dd className="m-0 text-right text-sm text-ink">
                      {billing.data.subscription.billingPeriod
                        ? BILLING_PERIOD_LABEL[billing.data.subscription.billingPeriod]
                        : 'Provider confirmation pending'}
                    </dd>
                  </div>
                  <div className="col-span-2 grid grid-cols-subgrid items-center border-b border-hairline py-2">
                    <dt className="text-sm text-muted">Provider status</dt>
                    <dd className="m-0 text-right"><Mono className="text-sm text-ink">{billing.data.subscription.status}</Mono></dd>
                  </div>
                  <div className="col-span-2 grid grid-cols-subgrid items-center py-2">
                    <dt className="text-sm text-muted">Current period</dt>
                    <dd className="m-0 text-right text-sm text-ink">{friendlyDate(billing.data.subscription.currentPeriodEndsAt) ?? 'Provider confirmation pending'}</dd>
                  </div>
                </dl>
              ) : (
                <p className="m-0 text-sm text-muted">No paid subscription is attached to this workspace yet.</p>
              )}
            </Section>
          </div>

          <aside className="min-w-0">
            <Section title={billing.data.subscription ? 'Manage subscription' : 'Continue after trial'}>
              {billing.data.subscription || billing.data.customer.configured ? (
                <>
                  <p className="m-0 mb-3 text-sm text-ink-soft">
                    Update payment details, view invoices, or cancel through the billing provider’s secure portal.
                  </p>
                  <Button
                    variant="primary"
                    disabled={portal.isPending}
                    onClick={() => portal.mutate()}
                  >
                    {portal.isPending ? 'Opening billing portal…' : 'Manage billing'}
                  </Button>
                </>
              ) : !paddleCheckoutReady() ? (
                <StatusTrace
                  tone="warning"
                  label="Checkout is not configured"
                  detail="This account remains usable through its current lifecycle state. Contact support before attempting a payment."
                />
              ) : (
                <>
                  <p className="m-0 mb-4 text-sm text-ink-soft">
                    Choose how you want to continue. The amount shown here is the server-owned plan price; access changes only after provider verification.
                  </p>
                  <PeriodPicker value={period} onChange={setPeriod} />
                  <Button
                    className="mt-4"
                    variant="primary"
                    disabled={checkout.isPending}
                    onClick={() => checkout.mutate(period)}
                  >
                    {checkout.isPending ? 'Preparing secure checkout…' : 'Continue to secure checkout'}
                  </Button>
                  <p className="m-0 mt-3 text-xs text-faint">
                    Checkout is handled by Paddle. Vitae does not receive your card number.
                  </p>
                </>
              )}
            </Section>
            <Section title="Your exit stays open">
              <p className="m-0 text-sm text-ink-soft">
                Cancellation keeps the workspace available through the paid period. If you do not continue after a trial, the record becomes read-only with a 30-day export path.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link to="/data/exports" className="vt-btn vt-btn--sm">Open exports</Link>
                <Link to="/security-and-ownership" className="vt-btn vt-btn--sm">Ownership details</Link>
              </div>
            </Section>
          </aside>
        </div>
      )}
    </div>
  );
}
