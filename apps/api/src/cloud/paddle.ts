/**
 * Minimal Paddle boundary: no browser-supplied prices, no entitlement inferred
 * from a return URL, and signed raw webhook payloads only.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { CLOUD_INDIVIDUAL_PLAN, isCloudIndividualBillingPeriod } from '@vitae/core';
import { db } from '../db/pg.js';
import { nowIso } from '../db/util.js';
import { HttpError } from '../middleware/error.js';
import {
  EXPORT_GRACE_DAYS,
  type BillingPeriod,
  paddleApiBaseUrl,
  paddleApiKey,
  paddlePriceFor,
  paddleWebhookSecret,
} from './config.js';
import { applyBillingAccess, type WorkspaceAccessState } from '../services/control-plane.js';

const PADDLE = 'paddle';
const WEBHOOK_TOLERANCE_SECONDS = 5;

export interface PaddleCheckoutInput {
  workspaceId: string;
  userId: string;
  email: string;
  billingPeriod: BillingPeriod;
}

export interface PaddleWebhookEvent {
  event_id: string;
  event_type: string;
  occurred_at: string | null;
  data: Record<string, unknown>;
}

function providerUnavailable(): HttpError {
  return new HttpError(503, 'BILLING_UNAVAILABLE', 'Billing is not configured yet.');
}

async function paddleFetch(path: string, init: RequestInit): Promise<Record<string, unknown>> {
  const apiKey = paddleApiKey();
  if (!apiKey) throw providerUnavailable();
  const response = await fetch(`${paddleApiBaseUrl()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(10_000),
  });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    // Provider bodies can contain personal/payment detail. Return a stable
    // application error and leave exact diagnostics to provider-side logs.
    throw new HttpError(502, 'BILLING_PROVIDER_ERROR', 'The billing provider could not complete that request.');
  }
  return body;
}

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const asString = (value: unknown): string | null => (typeof value === 'string' && value ? value : null);

/** Create a provider transaction using only the server-owned plan catalog. */
export async function createPaddleCheckout(input: PaddleCheckoutInput): Promise<{ transactionId: string }> {
  const priceId = paddlePriceFor(input.billingPeriod);
  if (!priceId) throw providerUnavailable();
  const known = await db
    .selectFrom('billing_customers')
    .select('provider_customer_id')
    .where('workspace_id', '=', input.workspaceId)
    .where('provider', '=', PADDLE)
    .executeTakeFirst();
  let customerId = known?.provider_customer_id ?? null;
  if (!customerId) {
    const customerResponse = await paddleFetch('/customers', {
      method: 'POST',
      body: JSON.stringify({
        email: input.email,
        custom_data: { workspace_id: input.workspaceId, user_id: input.userId },
      }),
    });
    customerId = asString(asRecord(customerResponse.data).id);
    if (!customerId) {
      throw new HttpError(502, 'BILLING_PROVIDER_ERROR', 'The billing provider returned an invalid customer.');
    }
    await db
      .insertInto('billing_customers')
      .values({ workspace_id: input.workspaceId, provider: PADDLE, provider_customer_id: customerId, updated_at: nowIso() })
      .onConflict((oc) =>
        oc.column('workspace_id').doUpdateSet({ provider: PADDLE, provider_customer_id: customerId, updated_at: nowIso() }),
      )
      .execute();
  }
  const response = await paddleFetch('/transactions', {
    method: 'POST',
    body: JSON.stringify({
      items: [{ price_id: priceId, quantity: 1 }],
      collection_mode: 'automatic',
      customer_id: customerId,
      enable_checkout: true,
      custom_data: {
        workspace_id: input.workspaceId,
        user_id: input.userId,
        plan_code: CLOUD_INDIVIDUAL_PLAN.code,
        billing_period: input.billingPeriod,
      },
    }),
  });
  const transactionId = asString(asRecord(response.data).id);
  if (!transactionId) throw new HttpError(502, 'BILLING_PROVIDER_ERROR', 'The billing provider returned an invalid checkout session.');
  return { transactionId };
}

/** Return a provider-managed customer portal URL; it never changes access locally. */
export async function createPaddlePortal(workspaceId: string): Promise<{ url: string }> {
  const customer = await db
    .selectFrom('billing_customers')
    .select('provider_customer_id')
    .where('workspace_id', '=', workspaceId)
    .where('provider', '=', PADDLE)
    .executeTakeFirst();
  if (!customer?.provider_customer_id) {
    throw new HttpError(409, 'BILLING_PORTAL_UNAVAILABLE', 'Complete checkout before opening billing management.');
  }
  const response = await paddleFetch(`/customers/${encodeURIComponent(customer.provider_customer_id)}/portal-sessions`, {
    method: 'POST',
  });
  const data = asRecord(response.data);
  const urls = asRecord(data.urls);
  const general = asRecord(urls.general);
  const url = asString(data.url) ?? asString(general.overview);
  if (!url) throw new HttpError(502, 'BILLING_PROVIDER_ERROR', 'The billing provider returned an invalid portal link.');
  return { url };
}

/** Verify Paddle's `ts=...;h1=...` HMAC without parsing/re-serializing JSON. */
export function verifyPaddleWebhookSignature(
  rawBody: Buffer,
  signature: string | undefined,
  secret = paddleWebhookSecret(),
  now = Date.now(),
): boolean {
  if (!signature || !secret) return false;
  const fields = new Map<string, string[]>();
  for (const part of signature.split(';')) {
    const [key, value] = part.trim().split('=', 2);
    if (!key || !value) continue;
    const values = fields.get(key) ?? [];
    values.push(value);
    fields.set(key, values);
  }
  const timestamp = Number(fields.get('ts')?.[0]);
  if (!Number.isFinite(timestamp) || Math.abs(now / 1000 - timestamp) > WEBHOOK_TOLERANCE_SECONDS) return false;
  const expected = createHmac('sha256', secret).update(`${timestamp}:`).update(rawBody).digest('hex');
  return (fields.get('h1') ?? []).some((candidate) => {
    // Buffer.from silently truncates invalid hex. Validate the textual form and
    // byte length first so malformed attacker input is a clean false result,
    // never a timingSafeEqual length exception.
    if (!/^[0-9a-f]{64}$/i.test(candidate) || candidate.length !== expected.length) return false;
    const actual = Buffer.from(candidate, 'hex');
    const expectedBytes = Buffer.from(expected, 'hex');
    return actual.length === expectedBytes.length && timingSafeEqual(actual, expectedBytes);
  });
}

export function parsePaddleWebhook(rawBody: Buffer): PaddleWebhookEvent | null {
  try {
    const parsed = JSON.parse(rawBody.toString('utf8')) as Record<string, unknown>;
    const eventId = asString(parsed.event_id);
    const eventType = asString(parsed.event_type);
    const data = asRecord(parsed.data);
    return eventId && eventType
      ? { event_id: eventId, event_type: eventType, occurred_at: asString(parsed.occurred_at), data }
      : null;
  } catch {
    return null;
  }
}

function workspaceIdFrom(event: PaddleWebhookEvent): string | null {
  return asString(asRecord(event.data.custom_data).workspace_id);
}

function periodFrom(event: PaddleWebhookEvent): BillingPeriod | null {
  const value = asString(asRecord(event.data.custom_data).billing_period);
  return isCloudIndividualBillingPeriod(value) ? value : null;
}

function accessFrom(event: PaddleWebhookEvent): WorkspaceAccessState | null {
  const status = asString(event.data.status)?.toLowerCase();
  if (status === 'active') return 'active';
  if (status === 'trialing') return 'trialing';
  if (status === 'past_due') return 'past_due';
  if (status === 'canceled' || status === 'cancelled' || status === 'paused') return 'read_only';
  if (event.event_type === 'transaction.completed' || event.event_type === 'transaction.paid') return 'active';
  return null;
}

function providerTimestamp(event: PaddleWebhookEvent): string | null {
  const candidate = event.occurred_at ?? asString(event.data.updated_at);
  if (!candidate || Number.isNaN(new Date(candidate).getTime())) return null;
  return new Date(candidate).toISOString();
}

/**
 * Persist a verified provider event exactly once, then make its lifecycle
 * transition transactional from Vitae's perspective. Unknown/malformed events
 * are recorded as unlinked evidence but never grant access.
 */
export async function applyPaddleWebhook(event: PaddleWebhookEvent): Promise<{ duplicate: boolean; linked: boolean }> {
  return db.transaction().execute(async (tx) => {
    const suppliedWorkspaceId = workspaceIdFrom(event);
    const workspace = suppliedWorkspaceId
      ? await tx.selectFrom('workspaces').select('id').where('id', '=', suppliedWorkspaceId).executeTakeFirst()
      : null;
    const workspaceId = workspace?.id ?? null;
    const inserted = await tx
      .insertInto('billing_events')
      .values({
        provider_event_id: event.event_id,
        provider: PADDLE,
        event_type: event.event_type,
        workspace_id: workspaceId,
        payload: event as unknown as Record<string, unknown>,
        processed_at: null,
      })
      .onConflict((oc) => oc.column('provider_event_id').doNothing())
      .returning('provider_event_id')
      .executeTakeFirst();
    if (!inserted) return { duplicate: true, linked: Boolean(workspaceId) };

    if (!workspaceId) {
      await tx
        .updateTable('billing_events')
        .set({ processed_at: nowIso() })
        .where('provider_event_id', '=', event.event_id)
        .execute();
      return { duplicate: false, linked: false };
    }

    // A durable lifecycle row exists for every member workspace. Lock it first
    // to serialize *all* provider events for that workspace, including the
    // very first subscription row where `FOR UPDATE` alone cannot lock an
    // absent row. That makes timestamp ordering hold under concurrent webhook
    // delivery as well as ordinary out-of-order retries.
    await tx
      .selectFrom('workspace_lifecycles')
      .select('workspace_id')
      .where('workspace_id', '=', workspaceId)
      .forUpdate()
      .executeTakeFirst();

    const data = event.data;
    const subscriptionId = asString(data.id);
    const customerId = asString(data.customer_id);
    const status = asString(data.status);
    const billingPeriod = periodFrom(event);
    const billingPeriodData = asRecord(data.current_billing_period);
    const periodEndsAt = asString(billingPeriodData.ends_at);
    const scheduledChange = asRecord(data.scheduled_change);
    const cancelAtPeriodEnd = asString(scheduledChange.action) === 'cancel';
    const incomingProviderUpdatedAt = providerTimestamp(event);
    const existing = await tx
      .selectFrom('billing_subscriptions')
      .select('provider_updated_at')
      .where('workspace_id', '=', workspaceId)
      .forUpdate()
      .executeTakeFirst();

    // A provider timestamp is the authoritative ordering key. Once we have
    // one, an old *or un-timestamped* retry can only be audit evidence; it
    // must not roll a customer's entitlement backwards.
    const stale = Boolean(
      existing?.provider_updated_at &&
        (!incomingProviderUpdatedAt || incomingProviderUpdatedAt <= existing.provider_updated_at),
    );
    if (!stale) {
      if (customerId) {
        await tx
          .insertInto('billing_customers')
          .values({ workspace_id: workspaceId, provider: PADDLE, provider_customer_id: customerId, updated_at: nowIso() })
          .onConflict((oc) =>
            oc.column('workspace_id').doUpdateSet({ provider: PADDLE, provider_customer_id: customerId, updated_at: nowIso() }),
          )
          .execute();
      }
      await tx
        .insertInto('billing_subscriptions')
        .values({
          workspace_id: workspaceId,
          provider: PADDLE,
          provider_subscription_id: subscriptionId,
          provider_status: status,
          billing_period: billingPeriod,
          current_period_ends_at: periodEndsAt,
          provider_updated_at: incomingProviderUpdatedAt,
          cancel_at_period_end: cancelAtPeriodEnd,
          raw: data,
          updated_at: nowIso(),
        })
        .onConflict((oc) =>
          oc.column('workspace_id').doUpdateSet({
            provider: PADDLE,
            provider_subscription_id: subscriptionId,
            provider_status: status,
            billing_period: billingPeriod,
            current_period_ends_at: periodEndsAt,
            provider_updated_at: incomingProviderUpdatedAt,
            cancel_at_period_end: cancelAtPeriodEnd,
            raw: data,
            updated_at: nowIso(),
          }),
        )
        .execute();
      const access = accessFrom(event);
      if (access) {
        await applyBillingAccess(
          workspaceId,
          access,
          {
            providerStatus: status,
            deletionScheduledAt:
              access === 'read_only' ? new Date(Date.now() + EXPORT_GRACE_DAYS * 86_400_000).toISOString() : null,
          },
          tx,
        );
      }
    }

    await tx
      .updateTable('billing_events')
      .set({ processed_at: nowIso() })
      .where('provider_event_id', '=', event.event_id)
      .execute();
    return { duplicate: false, linked: true };
  });
}
