import { Router } from 'express';
import type { Intent } from '@vitae/core';
import { asyncHandler } from '../../middleware/error.js';
import { askWhoToCall, personStrength, reconnectLane } from '../../services/crm.js';
import { getSettings } from '../../services/settings.js';
import { repository } from '../../db/repository.js';
import { nowIso } from '../../db/util.js';

export const askRouter: Router = Router();

const HISTORY_DOC = 'ask_history';

/** Who should I call? (SRS FR-CON-006/007). Weights come from settings. */
askRouter.post(
  '/people',
  asyncHandler(async (req, res) => {
    const body = req.body ?? {};
    const intent: Intent = {
      need: body.need,
      terms: Array.isArray(body.terms)
        ? body.terms
        : String(body.topics ?? '')
            .split(/[,\n]/)
            .map((s: string) => s.trim())
            .filter(Boolean),
      org: body.org,
      city: body.city,
      country: body.country,
    };
    const settings = await getSettings();
    const results = await askWhoToCall(intent, { weights: settings.askWeights });

    // Remember the ask for recall chips (last 5, most recent first, de-duplicated).
    const label = [intent.need, intent.org && `at ${intent.org}`, intent.terms.length && `about ${intent.terms.join(', ')}`]
      .filter(Boolean)
      .join(' ');
    if (label) {
      const doc = await repository.docGet<{ asks?: Array<{ label: string }> }>('meta', HISTORY_DOC);
      const prev = (doc?.asks ?? []).filter((a) => a.label !== label);
      await repository.docPut('meta', HISTORY_DOC, {
        asks: [{ label, intent, asked_at: nowIso() }, ...prev].slice(0, 5),
      });
    }

    res.json({ intent, results, considered: results.length });
  }),
);

/** Recent asks, the recall chips on the Ask page. */
askRouter.get(
  '/history',
  asyncHandler(async (_req, res) => {
    const doc = await repository.docGet<{ asks?: unknown[] }>('meta', HISTORY_DOC);
    res.json({ asks: doc?.asks ?? [] });
  }),
);

/** Dashboard Reconnect lane (SRS FR-CON-004). */
askRouter.get(
  '/reconnect',
  asyncHandler(async (_req, res) => {
    res.json({ lane: await reconnectLane() });
  }),
);

/** Tie-strength decomposition for a person (SRS §10.3, person page). */
askRouter.get(
  '/people/:id/strength',
  asyncHandler(async (req, res) => {
    res.json({ strength: await personStrength(req.params.id) });
  }),
);
