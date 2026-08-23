import { Router } from 'express';
import { z } from 'zod';
import { CLOUD_INDIVIDUAL_BILLING_PERIODS, CLOUD_INDIVIDUAL_PLAN } from '@vitae/core';
import { cloudEnabled } from '../../cloud/config.js';
import { createPaddleCheckout, createPaddlePortal } from '../../cloud/paddle.js';
import { db } from '../../db/pg.js';
import { asyncHandler, HttpError } from '../../middleware/error.js';

export const billingRouter: Router = Router();

function requireCloudWorkspace(req: Express.Request): NonNullable<Express.Request['workspace']> {
  if (!cloudEnabled()) throw new HttpError(404, 'CLOUD_DISABLED', 'Billing is not enabled for this installation.');
  if (!req.user || !req.workspace) throw new HttpError(409, 'WORKSPACE_BOOTSTRAP_REQUIRED', 'Finish account setup before using billing.');
  return req.workspace;
}

billingRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const workspace = requireCloudWorkspace(req);
    const [customer, subscription] = await Promise.all([
      db
        .selectFrom('billing_customers')
        .select(['provider', 'provider_customer_id'])
        .where('workspace_id', '=', workspace.id)
        .executeTakeFirst(),
      db
        .selectFrom('billing_subscriptions')
        .select(['provider_status', 'billing_period', 'current_period_ends_at', 'cancel_at_period_end'])
        .where('workspace_id', '=', workspace.id)
        .executeTakeFirst(),
    ]);
    res.json({
      plan: CLOUD_INDIVIDUAL_PLAN.code,
      access: {
        state: workspace.accessState,
        trialEndsAt: workspace.trialEndsAt,
        graceEndsAt: workspace.graceEndsAt,
        deletionScheduledAt: workspace.deletionScheduledAt,
      },
      customer: { configured: Boolean(customer?.provider_customer_id), provider: customer?.provider ?? 'paddle' },
      subscription: subscription
        ? {
            status: subscription.provider_status,
            billingPeriod: subscription.billing_period,
            currentPeriodEndsAt: subscription.current_period_ends_at,
            cancelAtPeriodEnd: subscription.cancel_at_period_end,
          }
        : null,
    });
  }),
);

billingRouter.post(
  '/checkout',
  asyncHandler(async (req, res) => {
    const workspace = requireCloudWorkspace(req);
    const parsed = z
      .object({ billingPeriod: z.enum(CLOUD_INDIVIDUAL_BILLING_PERIODS) })
      .safeParse(req.body);
    if (!parsed.success) throw new HttpError(422, 'VALIDATION', 'Choose a monthly or annual billing period.');
    const transaction = await createPaddleCheckout({
      workspaceId: workspace.id,
      userId: req.user!.uid,
      email: req.user!.email,
      billingPeriod: parsed.data.billingPeriod,
    });
    // The browser opens this transaction; entitlement remains webhook-only.
    res.status(201).json(transaction);
  }),
);

billingRouter.post(
  '/portal',
  asyncHandler(async (req, res) => {
    const workspace = requireCloudWorkspace(req);
    res.json(await createPaddlePortal(workspace.id));
  }),
);
