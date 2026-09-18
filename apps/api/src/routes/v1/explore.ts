import { Router } from 'express';
import { asyncHandler } from '../../middleware/error.js';
import {
  findGraphPath,
  graphView,
  mapView,
  timelineReview,
  timelineView,
} from '../../services/explore.js';
import {
  communityConnectionDetail,
  communityDetail,
  graphDiscovery,
} from '../../services/graph-discovery.js';

export const graphRouter: Router = Router();
export const timelineRouter: Router = Router();
export const mapRouter: Router = Router();

/** Graph explorer neighborhood (reference P: graph). ?focus=&depth=&types=a,b */
graphRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const focus = typeof req.query.focus === 'string' ? req.query.focus : undefined;
    const depth = req.query.depth ? Number(req.query.depth) : undefined;
    const types =
      typeof req.query.types === 'string' && req.query.types.length
        ? req.query.types.split(',').filter(Boolean)
        : undefined;
    res.json(await graphView({ focus, depth, types }));
  }),
);

/** Shortest path between two nodes for Path mode. ?from=&to=&maxDepth= */
graphRouter.get(
  '/path',
  asyncHandler(async (req, res) => {
    const from = typeof req.query.from === 'string' ? req.query.from : '';
    const to = typeof req.query.to === 'string' ? req.query.to : '';
    if (!from || !to) {
      res.status(400).json({ error: 'from and to are required' });
      return;
    }
    const maxDepth = req.query.maxDepth ? Number(req.query.maxDepth) : undefined;
    res.json(await findGraphPath({ from, to, maxDepth }));
  }),
);

/** Whole-workspace community and bridge analysis for Life map discovery. */
graphRouter.get(
  '/discovery',
  asyncHandler(async (_req, res) => {
    res.json(await graphDiscovery());
  }),
);

/** Paginated members and bounded scene relationships for a computed community. */
graphRouter.get(
  '/discovery/community/:communityId',
  asyncHandler(async (req, res) => {
    const detail = await communityDetail({
      id: req.params.communityId,
      offset: req.query.offset ? Number(req.query.offset) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      q: typeof req.query.q === 'string' ? req.query.q : undefined,
    });
    if (!detail) {
      res.status(404).json({ error: 'Community not found' });
      return;
    }
    res.json(detail);
  }),
);

/** Actual original relationships joining two computed communities. */
graphRouter.get(
  '/discovery/connection',
  asyncHandler(async (req, res) => {
    const from = typeof req.query.from === 'string' ? req.query.from : '';
    const to = typeof req.query.to === 'string' ? req.query.to : '';
    if (!from || !to) {
      res.status(400).json({ error: 'from and to are required' });
      return;
    }
    const detail = await communityConnectionDetail({
      from,
      to,
      offset: req.query.offset ? Number(req.query.offset) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    });
    if (!detail) {
      res.status(404).json({ error: 'Community connection not found' });
      return;
    }
    res.json(detail);
  }),
);

/** Multi-lane timeline (reference P: timeline). */
timelineRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json(await timelineView());
  }),
);

/** Brush → review digest. ?from=YYYY-MM-DD&to=YYYY-MM-DD */
timelineRouter.get(
  '/review',
  asyncHandler(async (req, res) => {
    const from = typeof req.query.from === 'string' ? req.query.from : '';
    const to = typeof req.query.to === 'string' ? req.query.to : '';
    if (!from || !to) {
      res.status(400).json({ error: 'from and to are required' });
      return;
    }
    res.json(await timelineReview({ from, to }));
  }),
);

/** City pins & clusters (Atlas). ?from=&to= period filter. */
mapRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const from = typeof req.query.from === 'string' ? req.query.from : undefined;
    const to = typeof req.query.to === 'string' ? req.query.to : undefined;
    res.json(await mapView({ from, to }));
  }),
);
