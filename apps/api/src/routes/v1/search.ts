import { Router } from 'express';
import { parseFilterQuery } from '@vitae/core';
import { searchIndex } from '../../db/search-index.js';
import { asyncHandler } from '../../middleware/error.js';
import { loadGraph } from '../../services/resume-model.js';
import { buildOwnerIndex } from '../../services/subjects.js';

export const searchRouter: Router = Router();

/** Unified FTS + filter grammar (SRS FR-SRCH-001/002/003). */
searchRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = String(req.query.q ?? '');
    const hits = await searchIndex.search(q, { limit: req.query.limit ? Number(req.query.limit) : undefined });

    // Search spans everyone's records, so a result has to say whose it is.
    // "Chief Operating Officer" is a very different hit depending on the answer.
    // Resolved from the graph rather than stored on the index so it cannot go
    // stale against an ownership edge added after the last reindex.
    const graph = await loadGraph();
    const index = buildOwnerIndex(graph);
    const ownerFor = (id: string): { id: string; title: string; isSelf: boolean } | null => {
      const ownerId = index.ownerOf.get(id);
      const person = ownerId ? graph.nodesById.get(ownerId) : undefined;
      if (!person) return null;
      return {
        id: person.id,
        title: person.title,
        isSelf: (person.props as Record<string, unknown>).is_self === true,
      };
    };

    res.json({
      query: q,
      ast: parseFilterQuery(q),
      results: hits.map((h) => ({ ...h.node, _score: h.score, owner: ownerFor(h.node.id) })),
    });
  }),
);

/** ⌘P fuzzy quick-switcher (SRS FR-SRCH-004). */
searchRouter.get(
  '/switch',
  asyncHandler(async (req, res) => {
    const q = String(req.query.q ?? '');
    const typesRaw = req.query.types;
    const types =
      typeof typesRaw === 'string' && typesRaw.trim()
        ? typesRaw
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean)
        : undefined;
    const hits = await searchIndex.quickSwitch(q, { types });
    res.json({ results: hits.map((h) => ({ id: h.node.id, type: h.node.type, title: h.node.title, subtitle: h.node.subtitle })) });
  }),
);
