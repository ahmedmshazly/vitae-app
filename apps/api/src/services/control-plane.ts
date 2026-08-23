/**
 * Cloud identity and workspace control plane.
 *
 * This module is intentionally outside the graph repository: identities,
 * memberships, lifecycle, and provider events are control-plane records, not
 * exportable career data. Graph access gets a workspace only after this module
 * has resolved membership from a verified server-side identity.
 */
import { sql, type Transaction } from 'kysely';
import type { Database } from '../db/schema.js';
import type { AuthedUser } from '../middleware/auth.js';
import { db } from '../db/pg.js';
import { repository } from '../db/repository.js';
import { newId, nowIso } from '../db/util.js';
import {
  EXPORT_GRACE_DAYS,
  LEGACY_WORKSPACE_ID,
  PAYMENT_GRACE_DAYS,
  TRIAL_LENGTH_DAYS,
} from '../cloud/config.js';
import { env } from '../env.js';

export type WorkspaceAccessState = 'trialing' | 'active' | 'past_due' | 'read_only' | 'deletion_pending';

export interface WorkspaceAccess {
  id: string;
  role: 'owner' | 'member';
  accessState: WorkspaceAccessState;
  trialEndsAt: string | null;
  graceEndsAt: string | null;
  deletionScheduledAt: string | null;
}

export interface BootstrapResult {
  workspace: WorkspaceAccess;
  created: boolean;
  claimedLegacy: boolean;
}

export class IdentityConflictError extends Error {
  constructor() {
    super('This verified email is already associated with a different account.');
  }
}

const asAccessState = (value: string): WorkspaceAccessState => {
  if (value === 'trialing' || value === 'active' || value === 'past_due' || value === 'read_only' || value === 'deletion_pending') {
    return value;
  }
  // A malformed control row must fail closed at the request gate.
  return 'read_only';
};

const plusDays = (days: number, from = new Date()): string => {
  const value = new Date(from);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString();
};

function rowToAccess(row: {
  id: string;
  role: string;
  access_state: string;
  trial_ends_at: string | null;
  grace_ends_at: string | null;
  deletion_scheduled_at: string | null;
}): WorkspaceAccess {
  return {
    id: row.id,
    role: row.role === 'member' ? 'member' : 'owner',
    accessState: asAccessState(row.access_state),
    trialEndsAt: row.trial_ends_at,
    graceEndsAt: row.grace_ends_at,
    deletionScheduledAt: row.deletion_scheduled_at,
  };
}

type ControlConnection = typeof db | Transaction<Database>;

async function recordLifecycleEvent(
  workspaceId: string,
  kind: string,
  details: Record<string, unknown> = {},
  conn: ControlConnection = db,
): Promise<void> {
  await conn
    .insertInto('workspace_lifecycle_events')
    .values({ id: newId(), workspace_id: workspaceId, kind, details })
    .execute();
}

/**
 * Move time-expired access states forward. This is intentionally idempotent and
 * executes at request resolution, so a missed worker run cannot leave a lapsed
 * workspace writable. A future lifecycle worker can call the same transition.
 */
async function refreshAccess(access: WorkspaceAccess): Promise<WorkspaceAccess> {
  const now = nowIso();
  let next: WorkspaceAccessState | null = null;
  let graceEndsAt = access.graceEndsAt;
  let deletionScheduledAt = access.deletionScheduledAt;

  if (access.accessState === 'trialing' && access.trialEndsAt && access.trialEndsAt <= now) {
    next = 'read_only';
    deletionScheduledAt ??= plusDays(EXPORT_GRACE_DAYS);
  } else if (access.accessState === 'past_due' && access.graceEndsAt && access.graceEndsAt <= now) {
    next = 'read_only';
    deletionScheduledAt ??= plusDays(EXPORT_GRACE_DAYS);
  }

  if (!next) return access;
  await db
    .updateTable('workspace_lifecycles')
    .set({
      access_state: next,
      grace_ends_at: graceEndsAt,
      deletion_scheduled_at: deletionScheduledAt,
      updated_at: now,
    })
    .where('workspace_id', '=', access.id)
    .execute();
  await recordLifecycleEvent(access.id, 'access_became_read_only', {
    previous_access_state: access.accessState,
    deletion_scheduled_at: deletionScheduledAt,
  });
  return { ...access, accessState: next, graceEndsAt, deletionScheduledAt };
}

/** Resolve a member workspace, optionally validating an explicit selection. */
export async function resolveWorkspaceForUser(
  userId: string,
  requestedWorkspaceId?: string,
): Promise<WorkspaceAccess | null> {
  let query = db
    .selectFrom('workspace_members as members')
    .innerJoin('workspaces as workspaces', 'workspaces.id', 'members.workspace_id')
    .innerJoin('workspace_lifecycles as lifecycle', 'lifecycle.workspace_id', 'workspaces.id')
    .select([
      'workspaces.id as id',
      'members.role as role',
      'lifecycle.access_state as access_state',
      'lifecycle.trial_ends_at as trial_ends_at',
      'lifecycle.grace_ends_at as grace_ends_at',
      'lifecycle.deletion_scheduled_at as deletion_scheduled_at',
    ])
    .where('members.user_id', '=', userId)
    .where('workspaces.state', '=', 'active')
    .orderBy('workspaces.created_at', 'asc');
  if (requestedWorkspaceId) query = query.where('workspaces.id', '=', requestedWorkspaceId);
  const row = await query.executeTakeFirst();
  return row ? refreshAccess(rowToAccess(row)) : null;
}

/** Active non-system workspaces for maintenance jobs such as retention. */
export async function activeWorkspaceIds(): Promise<string[]> {
  const rows = await db
    .selectFrom('workspaces')
    .select('id')
    .where('state', '=', 'active')
    .where('kind', '!=', 'system')
    .execute();
  return rows.map((row) => row.id);
}

/**
 * Idempotently persist a verified Firebase principal and give a first-time
 * Cloud user exactly one personal workspace. The configured legacy owner gets
 * a one-time claim on the pre-Cloud graph rather than a silent data copy.
 */
export async function bootstrapPersonalWorkspace(user: AuthedUser): Promise<BootstrapResult> {
  if (!user.emailVerified || !user.uid) throw new Error('Cloud bootstrap requires a verified Firebase UID.');

  return db.transaction().execute(async (tx) => {
    const email = user.email.toLowerCase();
    const existingEmail = await tx
      .selectFrom('users')
      .select('id')
      .where(sql<boolean>`lower(email) = ${email}`)
      .executeTakeFirst();
    if (existingEmail && existingEmail.id !== user.uid) throw new IdentityConflictError();

    await tx
      .insertInto('users')
      .values({
        id: user.uid,
        email,
        email_verified: user.emailVerified,
        provider: user.via,
        updated_at: nowIso(),
      })
      .onConflict((oc) =>
        oc.column('id').doUpdateSet({
          email,
          email_verified: user.emailVerified,
          provider: user.via,
          updated_at: nowIso(),
        }),
      )
      .execute();

    const existing = await tx
      .selectFrom('workspace_members as members')
      .innerJoin('workspaces as workspaces', 'workspaces.id', 'members.workspace_id')
      .innerJoin('workspace_lifecycles as lifecycle', 'lifecycle.workspace_id', 'workspaces.id')
      .select([
        'workspaces.id as id',
        'members.role as role',
        'lifecycle.access_state as access_state',
        'lifecycle.trial_ends_at as trial_ends_at',
        'lifecycle.grace_ends_at as grace_ends_at',
        'lifecycle.deletion_scheduled_at as deletion_scheduled_at',
      ])
      .where('members.user_id', '=', user.uid)
      .where('workspaces.state', '=', 'active')
      .orderBy('workspaces.created_at', 'asc')
      .executeTakeFirst();
    if (existing) return { workspace: rowToAccess(existing), created: false, claimedLegacy: false };

    const isLegacyOwner = email === env.OWNER_EMAIL.toLowerCase();
    const legacy = isLegacyOwner
      ? await tx
          .selectFrom('workspaces')
          .select(['id', 'owner_user_id'])
          .where('id', '=', LEGACY_WORKSPACE_ID)
          .executeTakeFirst()
      : null;
    const claimedLegacy = Boolean(legacy && legacy.owner_user_id === null);
    const workspaceId = claimedLegacy ? LEGACY_WORKSPACE_ID : newId();
    const now = nowIso();
    const accessState: WorkspaceAccessState = claimedLegacy ? 'active' : 'trialing';
    const trialEndsAt = claimedLegacy ? null : plusDays(TRIAL_LENGTH_DAYS);

    if (claimedLegacy) {
      await tx
        .updateTable('workspaces')
        .set({ owner_user_id: user.uid, updated_at: now })
        .where('id', '=', workspaceId)
        .execute();
    } else {
      await tx
        .insertInto('workspaces')
        .values({ id: workspaceId, kind: 'personal', state: 'active', owner_user_id: user.uid, updated_at: now })
        .execute();
      await tx
        .insertInto('workspace_lifecycles')
        .values({
          workspace_id: workspaceId,
          access_state: accessState,
          trial_ends_at: trialEndsAt,
          grace_ends_at: null,
          deletion_scheduled_at: null,
          updated_at: now,
        })
        .execute();
    }

    await tx
      .insertInto('workspace_members')
      .values({ workspace_id: workspaceId, user_id: user.uid, role: 'owner' })
      .execute();

    // Billing control records are created before any checkout request so the
    // workspace's source-of-truth state exists even when a browser closes the
    // checkout overlay.
    await tx
      .insertInto('billing_customers')
      .values({ workspace_id: workspaceId, provider: 'paddle', provider_customer_id: null, updated_at: now })
      .onConflict((oc) => oc.column('workspace_id').doNothing())
      .execute();

    await tx
      .insertInto('workspace_lifecycle_events')
      .values({
        id: newId(),
        workspace_id: workspaceId,
        kind: claimedLegacy ? 'legacy_workspace_claimed' : 'trial_started',
        details: claimedLegacy ? {} : { trial_ends_at: trialEndsAt },
      })
      .execute();

    return {
      workspace: {
        id: workspaceId,
        role: 'owner',
        accessState,
        trialEndsAt,
        graceEndsAt: null,
        deletionScheduledAt: null,
      },
      created: true,
      claimedLegacy,
    };
  });
}

/** Create the graph's self anchor once, inside the resolved workspace context. */
export async function ensureWorkspaceSelf(user: AuthedUser): Promise<{ id: string; title: string }> {
  const people = await repository.listNodes({ type: 'person', limit: 1000 });
  const existing = people.find((person) => (person.props as Record<string, unknown>).is_self === true);
  if (existing) return { id: existing.id, title: existing.title };
  const node = await repository.createNode(
    {
      type: 'person',
      title: 'My profile',
      props: { is_self: true },
      source: 'manual',
    },
    { actor: user.uid, source: 'cloud-bootstrap' },
  );
  return { id: node.id, title: node.title };
}

/** Transition provider-derived access safely; used only by verified webhooks. */
export async function applyBillingAccess(
  workspaceId: string,
  next: WorkspaceAccessState,
  details: {
    providerStatus?: string | null;
    graceEndsAt?: string | null;
    deletionScheduledAt?: string | null;
  } = {},
  conn: ControlConnection = db,
): Promise<void> {
  const current = await conn
    .selectFrom('workspace_lifecycles')
    .select(['access_state', 'grace_ends_at', 'deletion_scheduled_at'])
    .where('workspace_id', '=', workspaceId)
    .forUpdate()
    .executeTakeFirst();
  if (!current) return;
  const now = nowIso();
  const graceEndsAt = details.graceEndsAt ?? (next === 'past_due' ? plusDays(PAYMENT_GRACE_DAYS) : null);
  const deletionScheduledAt =
    details.deletionScheduledAt ??
    (next === 'read_only' || next === 'deletion_pending' ? current.deletion_scheduled_at ?? plusDays(EXPORT_GRACE_DAYS) : null);
  await conn
    .updateTable('workspace_lifecycles')
    .set({
      access_state: next,
      grace_ends_at: graceEndsAt,
      deletion_scheduled_at: deletionScheduledAt,
      updated_at: now,
    })
    .where('workspace_id', '=', workspaceId)
    .execute();
  if (current.access_state !== next) {
    await recordLifecycleEvent(workspaceId, 'billing_access_changed', {
      previous_access_state: current.access_state,
      access_state: next,
      provider_status: details.providerStatus ?? null,
      grace_ends_at: graceEndsAt,
      deletion_scheduled_at: deletionScheduledAt,
    }, conn);
  }
}
