import { Router } from 'express';
import { asyncHandler, HttpError } from '../../middleware/error.js';
import {
  getPlaceRegistry,
  nominatimReverse,
  nominatimSearch,
  suggestMerges,
  upsertPlaceResolve,
} from '../../services/places.js';

export const placesRouter: Router = Router();

placesRouter.get(
  '/search',
  asyncHandler(async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    if (q.trim().length < 2) {
      res.json({ results: [] });
      return;
    }
    try {
      res.json({ results: await nominatimSearch(q) });
    } catch (err) {
      throw new HttpError(502, 'GEOCODER_UNAVAILABLE', (err as Error).message);
    }
  }),
);

placesRouter.get(
  '/reverse',
  asyncHandler(async (req, res) => {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw new HttpError(400, 'BAD_REQUEST', 'lat and lng are required numbers.');
    }
    try {
      res.json({ result: await nominatimReverse(lat, lng) });
    } catch (err) {
      throw new HttpError(502, 'GEOCODER_UNAVAILABLE', (err as Error).message);
    }
  }),
);

placesRouter.get(
  '/registry',
  asyncHandler(async (_req, res) => {
    res.json(await getPlaceRegistry());
  }),
);

placesRouter.get(
  '/suggest-merges',
  asyncHandler(async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    res.json({ suggestions: await suggestMerges(q) });
  }),
);

placesRouter.post(
  '/resolve',
  asyncHandler(async (req, res) => {
    const body = req.body ?? {};
    const aliases = Array.isArray(body.aliases)
      ? body.aliases.map((a: unknown) => String(a)).filter(Boolean)
      : typeof body.alias === 'string'
        ? [body.alias]
        : [];
    const label = String(body.label ?? aliases[0] ?? '').trim();
    const lat = Number(body.lat);
    const lng = Number(body.lng);
    if (!aliases.length) throw new HttpError(400, 'BAD_REQUEST', 'aliases required.');
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw new HttpError(400, 'BAD_REQUEST', 'lat and lng required.');
    }
    if (!label) throw new HttpError(400, 'BAD_REQUEST', 'label required.');
    const registry = await upsertPlaceResolve({
      aliases,
      label,
      lat,
      lng,
      osmId: typeof body.osmId === 'string' ? body.osmId : undefined,
      countryCode: typeof body.countryCode === 'string' ? body.countryCode : undefined,
      placeId: typeof body.placeId === 'string' ? body.placeId : undefined,
    });
    res.json(registry);
  }),
);
