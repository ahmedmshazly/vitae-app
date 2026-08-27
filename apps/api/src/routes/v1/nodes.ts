import { Router } from 'express';
import { z } from 'zod';
import { canonicalCountryCode, canonicalCountryName, NODE_FORM_DESCRIPTORS, NODE_TYPES, validateNodeUpdate, subjectAssignment } from '@vitae/core';
import { repository, ValidationError } from '../../db/repository.js';
import { searchIndex } from '../../db/search-index.js';
import { asyncHandler, HttpError } from '../../middleware/error.js';
import { invalidateDuplicateScan } from '../../services/duplicates.js';
import { loadGraph } from '../../services/resume-model.js';
import { buildOwnerIndex } from '../../services/subjects.js';
import { applicationTransitionRefusal } from './applications.js';

export const nodesRouter: Router = Router();

/**
 * Whose record this is. Types like role/education/publication are meaningless
 * without a person; the caller either names an existing person or supplies one
 * to create alongside.
 *
 * Optional on the API even for types whose *form* requires it, so existing
 * programmatic callers (capture, importers, scripts) that attach their own
 * edges keep working.
 */
const subjectSchema = z.union([
  z.object({ node_id: z.string().min(1) }),
  z.object({
    create: z.object({
      type: z.literal('person'),
      title: z.string().min(1).max(500),
      props: z.record(z.string(), z.unknown()).optional(),
    }),
  }),
]);

nodesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (q) {
      // Filter-grammar queries go through the search index (clauses + FTS).
      const hits = await searchIndex.search(q, { limit: req.query.limit ? Number(req.query.limit) : 200 });
      res.json({ nodes: hits.map((h) => h.node) });
      return;
    }
    const nodes = await repository.listNodes({
      type: req.query.type as string | undefined,
      includeArchived: req.query.includeArchived === 'true',
      includeDeleted: req.query.includeDeleted === 'true',
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    });
    // Opt-in: resolving owners needs the whole edge table, which would turn a
    // paged list into a full graph scan on every call. Views that label rows ask
    // for it; the rest keep the cheap query.
    if (req.query.withOwner === 'true') {
      const graph = await loadGraph();
      const index = buildOwnerIndex(graph);
      res.json({
        nodes: nodes.map((n) => {
          const ownerId = index.ownerOf.get(n.id);
          const person = ownerId ? graph.nodesById.get(ownerId) : undefined;
          return {
            ...n,
            owner: person
              ? {
                  id: person.id,
                  title: person.title,
                  isSelf: (person.props as Record<string, unknown>).is_self === true,
                }
              : null,
          };
        }),
      });
      return;
    }
    res.json({ nodes });
  }),
);

/** Live node counts per type, the Collections tiles. FR-104: per-type
 * aggregation counts instead of loading the whole collection to tally it. */
nodesRouter.get(
  '/counts',
  asyncHandler(async (_req, res) => {
    const { counts, total } = await repository.liveCountsByType(NODE_TYPES);
    res.json({ counts, total });
  }),
);

nodesRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const { subject: rawSubject, ...body } = (req.body ?? {}) as Record<string, unknown>;
    const value = repository.parseNodeCreate(body);
    // Exact country aliases are safe to canonicalize: retain one stable display
    // name and ISO identity while fuzzy/ambiguous geography still goes to review.
    if (value.type === 'location' && (value.props as Record<string, unknown>).kind === 'country') {
      const props = value.props as Record<string, unknown>;
      const code = canonicalCountryCode(String(props.country_code ?? value.title));
      const name = canonicalCountryName(String(props.country_code ?? value.title));
      if (code && name) {
        value.title = name;
        value.props = { ...props, country_code: code };
      }
    }
    const actor = req.user?.email;
    const id = repository.allocateId();

    // Node ids created in this transaction, so endpoint checks can see records
    // that have not yet been persisted.
    const pending = new Map<string, string>([[id, value.type]]);
    const edgeInputs: ReturnType<typeof repository.parseEdgeCreate>[] = [];
    let subjectPerson: { id: string; value: ReturnType<typeof repository.parseNodeCreate> } | null = null;

    if (rawSubject !== undefined) {
      const descriptor = NODE_FORM_DESCRIPTORS[value.type].subject;
      if (!descriptor) {
        throw new HttpError(400, 'NO_SUBJECT', `${value.type} records do not have a subject`);
      }
      const parsed = subjectSchema.safeParse(rawSubject);
      if (!parsed.success) {
        throw new ValidationError(
          'invalid subject',
          parsed.error.issues.map((i) => ({ path: `subject.${i.path.join('.')}`, message: i.message })),
        );
      }

      let personId: string;
      if ('node_id' in parsed.data) {
        personId = parsed.data.node_id;
      } else {
        personId = repository.allocateId();
        subjectPerson = {
          id: personId,
          // Inherit the record's provenance: a person named while importing is
          // an imported person, not a manually curated one.
          value: repository.parseNodeCreate({
            type: 'person',
            title: parsed.data.create.title,
            props: parsed.data.create.props ?? {},
            source: value.source,
            source_ref: value.source_ref,
            confidence: value.confidence,
          }),
        };
        pending.set(personId, 'person');
      }

      // 'in' → the edge runs person → this node (HELD, AUTHORED, EARNED …).
      const [src, dst] = descriptor.direction === 'in' ? [personId, id] : [id, personId];
      edgeInputs.push(
        repository.parseEdgeCreate({
          type: descriptor.edgeType,
          src,
          dst,
          source: value.source,
          source_ref: value.source_ref,
          confidence: value.confidence,
        }),
      );
    }

    // A *manually* created person becomes a KNOWS relationship with self, same
    // semantics as ⌘K capture (SRS E1: when self is involved, src = self).
    // Imported people do not: bulk-ingesting scraped profiles must not silently
    // claim hundreds of people as ones you know.
    if (value.type === 'person' && value.source === 'manual' && !(value.props as Record<string, unknown>).is_self) {
      const { getSelf } = await import('../../services/self.js');
      const self = await getSelf();
      if (self?.id) {
        edgeInputs.push(
          repository.parseEdgeCreate({ type: 'KNOWS', src: self.id, dst: id, props: { closeness: 2 }, source: 'manual' }),
        );
      }
    }

    const node = await repository.transaction(async (tx) => {
      // Read phase first, every endpoint check must precede the first stage.
      for (const edge of edgeInputs) await repository.assertEdgeEndpoints(tx, edge, pending);
      if (subjectPerson) await repository.stageNode(tx, subjectPerson.value, { actor }, { id: subjectPerson.id });
      const created = repository.stageNode(tx, value, { actor }, { id });
      for (const edge of edgeInputs) await repository.stageEdge(tx, edge, { actor });
      return created;
    });

    searchIndex.markDirty();
    await invalidateDuplicateScan();
    res.status(201).json({ node });
  }),
);

nodesRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const node = await repository.getNode(req.params.id, { includeDeleted: true });
    if (!node) throw new HttpError(404, 'NOT_FOUND', 'node not found');
    const edges = await repository.edgesForNode(node.id);
    // Hydrate the other end of each edge for the connections rail.
    const otherIds = [...new Set(edges.flatMap((e) => [e.src, e.dst]).filter((id) => id !== node.id))];
    const others = await Promise.all(otherIds.map((id) => repository.getNode(id, { includeDeleted: true })));
    const neighbors = Object.fromEntries(others.filter(Boolean).map((n) => [n!.id, n]));

    // Whose record this is. The edges and neighbours are already in hand, so
    // resolving the subject edge here costs nothing extra, and every view that
    // shows a record needs to be able to say whose it is now that the graph
    // holds more than one person.
    const typeOf = (id: string): string | undefined =>
      id === node.id ? node.type : neighbors[id]?.type;
    let owner: { id: string; title: string; isSelf: boolean } | null = null;
    for (const e of edges) {
      const assignment = subjectAssignment(e, typeOf);
      if (assignment?.recordId !== node.id) continue;
      const person = neighbors[assignment.personId];
      if (!person) continue;
      owner = {
        id: person.id,
        title: person.title,
        isSelf: (person.props as Record<string, unknown> | undefined)?.is_self === true,
      };
      break;
    }
    res.json({ node, edges, neighbors, owner });
  }),
);

nodesRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const existing = await repository.getNode(req.params.id, { includeDeleted: true });
    if (!existing) throw new HttpError(404, 'NOT_FOUND', 'node not found');
    // The update envelope strips system fields (deleted_at, rev, …) so clients
    // can never set them; props are validated against the type's schema.
    const parsed = validateNodeUpdate(existing.type, req.body);
    if (!parsed.ok) throw new ValidationError('invalid node update', parsed.errors);
    // An application's status machine runs here too. The dedicated endpoints
    // would otherwise be a front door with the back door standing open: this is
    // the patch the application form itself sends, so a guard it skipped would
    // be a guard nothing in the product actually obeyed. The check is silent
    // unless the incoming props name a status different from the stored one, so
    // re-saving an unchanged record still passes and a patch that never
    // mentions status is untouched.
    const refusal = applicationTransitionRefusal(existing, parsed.value.props);
    if (refusal) throw new HttpError(422, 'ILLEGAL_TRANSITION', refusal);
    const node = await repository.updateNode(req.params.id, parsed.value, { actor: req.user?.email });
    searchIndex.markDirty();
    await invalidateDuplicateScan();
    res.json({ node });
  }),
);

nodesRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const node = await repository.softDeleteNode(req.params.id, { actor: req.user?.email });
    searchIndex.markDirty();
    await invalidateDuplicateScan();
    res.json({ node });
  }),
);

nodesRouter.post(
  '/:id/restore',
  asyncHandler(async (req, res) => {
    const node = await repository.restoreNode(req.params.id, { actor: req.user?.email });
    searchIndex.markDirty();
    await invalidateDuplicateScan();
    res.json({ node });
  }),
);

nodesRouter.post(
  '/:id/archive',
  asyncHandler(async (req, res) => {
    const node = await repository.archiveNode(req.params.id, req.body?.archived !== false, {
      actor: req.user?.email,
    });
    searchIndex.markDirty();
    await invalidateDuplicateScan();
    res.json({ node });
  }),
);

nodesRouter.get(
  '/:id/revisions',
  asyncHandler(async (req, res) => {
    res.json({ revisions: await repository.revisionsFor(req.params.id) });
  }),
);
