import { Router } from 'express';
import { asyncHandler, HttpError } from '../../middleware/error.js';
import { getSettings, patchSettings, publicSettings } from '../../services/settings.js';
import { deleteSecret, SecretStoreError, setSecret } from '../../services/secrets.js';

export const settingsRouter: Router = Router();

settingsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json(publicSettings(await getSettings()));
  }),
);

settingsRouter.patch(
  '/',
  asyncHandler(async (req, res) => {
    const { profile, askWeights, skillAliases, resumeDefaults } = req.body ?? {};
    if (askWeights) {
      for (const [k, v] of Object.entries(askWeights)) {
        if (typeof v !== 'number' || v < 0 || v > 5) {
          throw new HttpError(400, 'BAD_REQUEST', `askWeights.${k} must be a number in [0, 5].`);
        }
      }
    }
    if (skillAliases && !Array.isArray(skillAliases)) {
      throw new HttpError(400, 'BAD_REQUEST', 'skillAliases must be an array.');
    }
    if (resumeDefaults) {
      const templates = ['cobalt', 'onyx', 'argon'];
      const accents = ['#2563eb', '#0f766e', '#7c3aed', '#b45309', '#be123c', '#111827'];
      const emphases = ['technical', 'leadership', 'concise', 'detailed'];
      if (resumeDefaults.templateKey && !templates.includes(resumeDefaults.templateKey)) {
        throw new HttpError(422, 'VALIDATION', 'Unknown résumé template.');
      }
      if (resumeDefaults.accent && !accents.includes(resumeDefaults.accent)) {
        throw new HttpError(422, 'VALIDATION', 'Accent must be selected from the curated palette.');
      }
      if (resumeDefaults.emphasis && !emphases.includes(resumeDefaults.emphasis)) {
        throw new HttpError(422, 'VALIDATION', 'Unknown résumé emphasis.');
      }
    }
    const next = await patchSettings({ profile, askWeights, skillAliases, resumeDefaults });
    res.json(publicSettings(next));
  }),
);

/**
 * Write-only PAT endpoint. The token goes to the secret store, never into
 * application data (FR-004). When the deployment injects GITHUB_PAT from a
 * secret manager the store is read-only and rotation belongs there, so this
 * returns 409 rather than keeping a second, divergent copy.
 */
settingsRouter.post(
  '/github-token',
  asyncHandler(async (req, res) => {
    const token = String(req.body?.token ?? '').trim();
    if (!token) throw new HttpError(400, 'BAD_REQUEST', 'token is required.');
    try {
      setSecret('github_pat', token);
    } catch (err) {
      if (err instanceof SecretStoreError) throw new HttpError(409, 'SECRET_READ_ONLY', err.message);
      throw err;
    }
    // Re-syncing with a new credential invalidates the cached ETag.
    await patchSettings({ github: { etag: null } });
    res.json({ ok: true, configured: true });
  }),
);

/** Disconnect GitHub: drop the credential, keep the imported records. */
settingsRouter.delete(
  '/github-token',
  asyncHandler(async (_req, res) => {
    deleteSecret('github_pat');
    await patchSettings({ github: { etag: null, lastSyncAt: null } });
    res.json({ ok: true, configured: false });
  }),
);
