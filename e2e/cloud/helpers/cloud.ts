import { createHmac } from 'node:crypto';
import { expect, type Page } from '@playwright/test';
import { API_BASE, devToken } from '../../tests/helpers/api';

/**
 * Cloud-mode preconditions, driven the way production drives them.
 *
 * The tempting shortcut is `UPDATE workspace_lifecycles SET access_state=...`,
 * which is what the API integration suite does because it holds a database
 * handle. A browser test does not, and reaching for one would prove the banner
 * renders for a value someone wrote by hand rather than for a state the system
 * can actually reach. So the access state is moved by posting a signed provider
 * event to the real webhook, through the real signature check and the real
 * `applyPaddleWebhook` path.
 */

/** The origin, without the `/api/v1` the rest of the suite talks to. */
const ORIGIN = API_BASE.replace(/\/api\/v1$/, '');

/** Matches PADDLE_WEBHOOK_SECRET in the API's environment for this run. */
const WEBHOOK_SECRET = process.env.E2E_PADDLE_WEBHOOK_SECRET ?? 'ci-paddle-secret';

/** The workspace the owner's dev identity claims on first bootstrap. */
export const OWNER_WORKSPACE_ID = 'workspace-legacy-real';

/**
 * Sign in and let the SPA bootstrap the workspace.
 *
 * Cloud mode has no auto-creation: `workspaceMiddleware` resolves a membership
 * and refuses with 409 WORKSPACE_BOOTSTRAP_REQUIRED when there is none. The
 * browser is what calls `POST /auth/bootstrap`, from AuthProvider, so the page
 * load is the bootstrap and cannot be skipped by minting a token alone.
 *
 * The dev identity's email is OWNER_EMAIL, so it claims the pre-Cloud
 * workspace and inherits everything `pnpm seed` wrote.
 */
export async function signInToCloud(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('vitae.v1.welcomed', '1');
  });
  await devToken(page);
  await page.goto('/today');
  await expect(page.getByRole('img', { name: /^Days of this week/ })).toBeVisible({
    timeout: 15_000,
  });
}

/** Paddle's `ts=…;h1=…`, over `${timestamp}:` followed by the untouched body. */
function signature(body: Buffer, timestamp: number): string {
  const digest = createHmac('sha256', WEBHOOK_SECRET)
    .update(`${timestamp}:`)
    .update(body)
    .digest('hex');
  return `ts=${timestamp};h1=${digest}`;
}

/**
 * A strictly increasing stamp that is never in the future.
 *
 * `applyPaddleWebhook` orders by `provider_updated_at` and drops anything not
 * newer than what it holds, which is right for a provider that delivers out of
 * order and a trap for a test that reuses a clock.
 *
 * The obvious fix, a counter that adds a minute per delivery, is wrong and was
 * seen to be wrong: Playwright restarts its worker after a failing test, the
 * counter resets, and the fresh worker's first stamp lands behind a stored one
 * that is minutes ahead. Every later event is then accepted and discarded.
 * Stamping at the real clock, nudged forward only enough to break a tie within
 * one millisecond, keeps the sequence increasing across worker restarts and
 * across runs, because nothing ever writes a timestamp that has not happened.
 */
let last = 0;
function nextStamp(): Date {
  last = Math.max(last + 1, Date.now());
  return new Date(last);
}

/** What each provider status means to the control plane, per `accessFrom`. */
const RESULTING_ACCESS = {
  active: 'active',
  past_due: 'past_due',
  canceled: 'read_only',
} as const;

/**
 * Move the workspace's access state by delivering a subscription event.
 *
 * `accessFrom` maps the provider's status onto the lifecycle: active, trialing
 * and past_due pass through, and canceled, cancelled and paused all become
 * read_only.
 *
 * The delivery is not trusted to have worked. A 200 means the event was
 * accepted, not that it was applied: a stale one is accepted and discarded, and
 * `duplicate: true` looks identical from here. So this waits for the control
 * plane to report the state the event asked for, which turns an ignored event
 * into a failure that names itself instead of one that surfaces three
 * assertions later.
 */
export async function deliverSubscriptionStatus(
  page: Page,
  status: keyof typeof RESULTING_ACCESS,
): Promise<void> {
  const occurredAt = nextStamp();
  const body = Buffer.from(
    JSON.stringify({
      event_id: `evt-e2e-${status}-${occurredAt.getTime()}`,
      event_type: 'subscription.updated',
      occurred_at: occurredAt.toISOString(),
      data: {
        id: 'sub-e2e',
        customer_id: 'cus-e2e',
        status,
        updated_at: occurredAt.toISOString(),
        custom_data: { workspace_id: OWNER_WORKSPACE_ID, billing_period: 'monthly' },
      },
    }),
  );
  const timestamp = Math.floor(Date.now() / 1000);
  const response = await page.request.post(`${ORIGIN}/webhooks/paddle`, {
    headers: {
      'content-type': 'application/json',
      'paddle-signature': signature(body, timestamp),
    },
    data: body.toString('utf8'),
  });
  expect(
    response.ok(),
    `provider event ${status} was refused: ${response.status()} ${await response.text()}`,
  ).toBe(true);
  await expect
    .poll(() => accessState(page), {
      message: `the ${status} event was accepted but the workspace did not reach ${RESULTING_ACCESS[status]}`,
      timeout: 10_000,
    })
    .toBe(RESULTING_ACCESS[status]);
}

/** What `GET /billing` reports, which is the control plane's own answer. */
export async function accessState(page: Page): Promise<string> {
  const response = await page.request.get(`${API_BASE}/billing`, {
    headers: { authorization: `Bearer ${await devToken(page)}` },
  });
  expect(response.ok(), `billing read failed: ${response.status()}`).toBe(true);
  const body = (await response.json()) as { access?: { state?: string } };
  return body.access?.state ?? 'unknown';
}
