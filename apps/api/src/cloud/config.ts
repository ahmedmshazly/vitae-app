/**
 * Hosted-service configuration is deliberately opt-in.
 *
 * A self-hosted install keeps its historical single-owner semantics unless
 * `VITAE_CLOUD_ENABLED=true` is set by the deployment. Billing secrets are
 * read only when their endpoint is invoked, which keeps local/test runs free
 * of accidental provider traffic.
 */
import { CLOUD_INDIVIDUAL_PLAN, type CloudIndividualBillingPeriod } from '@vitae/core';

export type BillingPeriod = CloudIndividualBillingPeriod;

function bool(value: string | undefined): boolean {
  return value === 'true' || value === '1';
}

export function cloudEnabled(): boolean {
  return bool(process.env.VITAE_CLOUD_ENABLED);
}

export function paddleEnvironment(): 'sandbox' | 'production' {
  return process.env.PADDLE_ENVIRONMENT === 'production' ? 'production' : 'sandbox';
}

export function paddleApiBaseUrl(): string {
  return paddleEnvironment() === 'production' ? 'https://api.paddle.com' : 'https://sandbox-api.paddle.com';
}

const PADDLE_PRICE_ENVIRONMENT_VARIABLE: Record<
  BillingPeriod,
  'PADDLE_PRICE_CLOUD_MONTHLY' | 'PADDLE_PRICE_CLOUD_ANNUAL'
> = {
  monthly: 'PADDLE_PRICE_CLOUD_MONTHLY',
  annual: 'PADDLE_PRICE_CLOUD_ANNUAL',
};

export function paddlePriceFor(period: BillingPeriod): string | null {
  const value = process.env[PADDLE_PRICE_ENVIRONMENT_VARIABLE[period]];
  return value?.trim() || null;
}

export function paddleApiKey(): string | null {
  return process.env.PADDLE_API_KEY?.trim() || null;
}

export function paddleWebhookSecret(): string | null {
  return process.env.PADDLE_WEBHOOK_SECRET?.trim() || null;
}

export function publicAppUrl(): string {
  return (process.env.PUBLIC_APP_URL ?? process.env.WEB_ORIGIN?.split(',')[0] ?? 'http://localhost:5173').trim();
}

export const LEGACY_WORKSPACE_ID = 'workspace-legacy-real';
export const SYSTEM_DEMO_WORKSPACE_ID = 'workspace-system-demo';

export const TRIAL_LENGTH_DAYS = CLOUD_INDIVIDUAL_PLAN.trialDays;
export const PAYMENT_GRACE_DAYS = CLOUD_INDIVIDUAL_PLAN.paymentGraceDays;
export const EXPORT_GRACE_DAYS = CLOUD_INDIVIDUAL_PLAN.exportGraceDays;
