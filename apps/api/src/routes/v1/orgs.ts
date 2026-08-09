import { Router } from 'express';
import { asyncHandler, HttpError } from '../../middleware/error.js';
import { orgProfile, orgsOverview } from '../../services/crm.js';

export const orgsRouter: Router = Router();

/** Organizations list with affinity + inroad counts (reference P: orgs). */
orgsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json({ orgs: await orgsOverview() });
  }),
);

/** Org profile: affinity, ranked inroads, linked roles (reference P: org). */
orgsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const profile = await orgProfile(req.params.id);
    if (!profile) throw new HttpError(404, 'NOT_FOUND', 'Organization not found.');
    res.json({ org: profile });
  }),
);
