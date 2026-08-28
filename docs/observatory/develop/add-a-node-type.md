---
id: DEV-NODETYPE
title: Adding a node or edge type
summary: The typed graph is one string union with several registries hanging off it: which of them the compiler enforces, which a named test enforces, and which nothing enforces.
audience: [developer]
domain: develop
type: task
status: verified
verified_at: 2026-08-24
sources:
  - packages/core/src/types.ts
  - packages/core/src/schema/node-props.ts
  - packages/core/src/schema/edge-props.ts
  - packages/core/src/schema/envelope.ts
  - packages/core/src/forms/node-forms.ts
  - packages/core/src/forms/edge-forms.ts
  - packages/core/src/forms/subjects.ts
  - packages/core/src/forms/descriptors.test.ts
  - packages/ui/src/glyphs.tsx
  - apps/web/src/features/forms/NewEntityMenu.tsx
  - apps/web/src/routes/reference/entityCatalogModel.ts
  - apps/web/src/routes/reference/entityCatalogModel.test.ts
  - docs/entity-catalog.template.json
  - apps/api/src/db/migrations/001-initial-schema.ts
  - docs/ONBOARDING.md
related: [DEV, DEV-WHERE, DEV-TESTING, DEV-GATES]
---

# Adding a node or edge type

## What a type is here

`packages/core/src/types.ts` holds two string-literal unions and everything
else follows from them. `NODE_TYPES` composes three groups - 16 career types,
11 life types and 7 proposed types, 34 in all. `EDGE_TYPES` is a flat list of
28 relationship types.

Those unions are the single source of truth shared by the Zod schemas, the API
and the web application. Adding a member is therefore not a local edit: several
registries are keyed by the union, and the difference between them is how loudly
each one complains when you forget it.

> [!NOTE]
> `docs/ONBOARDING.md` gives a four-step recipe for this (the union, the props
> schema, a glyph, and optionally the Browse navigation) and closes with "that's
> it". It is incomplete. It omits the form descriptor, which the compiler
> requires; the "+ New" menu groups, which three named tests require; and the
> entity catalog template, without which the reference explorer throws at module
> load. What follows is the list the code actually enforces.

## What you do not have to do

Worth knowing before the list, because it is most of the work you might expect.

**No migration.** Nodes and edges are stored as JSONB documents. The `type`
column on both tables is `GENERATED ALWAYS AS (data->>'type') STORED`, and
there is no `CHECK` constraint enumerating the permitted values. The database
does not know what a node type is, so it cannot object to a new one.

**No new endpoint.** The generic node and edge routes, capture, search,
revisions and export all operate on the envelope rather than on a type, so they
work for a new type the moment its schema exists.

**No subject registration.** Whether a record belongs to a person is derived
from the form descriptor's `subject` field, so declaring it there is enough;
`SUBJECT_BEARING_TYPES` and the read-path helpers pick it up automatically. A
type that belongs to nobody - organisations, skills, locations are shared
vocabulary rather than property - declares no subject.

## Adding a node type

### 1. Add the literal to the right group

In `packages/core/src/types.ts`, add the string to `CAREER_NODE_TYPES`,
`LIFE_NODE_TYPES` or `PROPOSED_NODE_TYPES`. The groups are not decorative:
they carry the intent of the type and `NODE_TYPES` is their concatenation, so
the composed union updates itself.

The moment you do this, `pnpm typecheck` starts failing in two places. That is
the design working - the next two steps are what it is asking for.

### 2. Add the props schema and register it

In `packages/core/src/schema/node-props.ts`, add a Zod object for the type's
per-type fields and register it in `NODE_PROPS_SCHEMAS`.

That registry closes with `satisfies Record<NodeType, z.ZodType>`, so a missing
key is a compile error rather than a runtime surprise. Existing schemas are
`.passthrough()` - unknown keys survive a `validate` and a `PATCH` instead of
being silently stripped, which is what lets an import or an older revision
round-trip.

### 3. Add the form descriptor

In `packages/core/src/forms/node-forms.ts`, add an entry to
`NODE_FORM_DESCRIPTORS`. It is typed `Record<NodeType, TypeFormDescriptor>`, so
this too is a compile error until it is there.

A descriptor names the title and subtitle labels, at least one section, the
fields, the edge sub-editors offered on the form, and optionally the `subject`
edge. Four assertions in `packages/core/src/forms/descriptors.test.ts` hold it
honest: every type has a descriptor with at least one section, every field key
exists in that type's props schema, every field's `section` is declared in the
descriptor's own sections, and every sub-editor names a real edge type whose
inline props exist in that edge's schema.

### 4. Add it to the "+ New" menu

In `apps/web/src/features/forms/NewEntityMenu.tsx`, add the type to one of the
`NEW_ENTITY_MENU_GROUPS`. This is not compiler-enforced - the groups are typed
as `readonly NodeType[]`, and a shorter list is still a valid one - but three
tests compare it against `NODE_TYPES` and will fail:
`NewEntityMenu.test.ts`, `Collections.test.ts` (the collection tiles reuse the
same groups) and `entityCatalogModel.test.ts`.

That triple check exists because a type once shipped that was creatable only
through an import, with no way to make one in the product.

### 5. Add it to the entity catalog template

`docs/entity-catalog.template.json` is a hand-maintained mirror of the schemas
and descriptors, and the reference explorer imports it directly. Add an
`entities.<type>` entry with its `group`, `props`, `create_subject` and
`form_edges`.

Skip this and the failure is loud but indirect: `CATALOG_ENTITIES` iterates the
menu groups and reads `catalog.entities[type]`, so an absent entry throws while
the module is being evaluated, taking every suite that imports it down with it.

### 6. Give it a glyph

In `packages/ui/src/glyphs.tsx`, add the type to `NODE_GLYPH`.

Nothing enforces this. `NODE_GLYPH` is typed `Record<string, GlyphName>` rather
than `Record<NodeType, GlyphName>`, the lookup falls back to `'dot'`, and no
test asserts that every node type has one. A type without a glyph ships, looks
unfinished, and no gate says so. It is the one step on this page you have to
remember on your own.

## Adding an edge type

The same shape, one list shorter.

1. Add the literal to `EDGE_TYPES` in `packages/core/src/types.ts`.
2. Add a props schema and register it in `EDGE_PROPS_SCHEMAS`
   (`satisfies Record<EdgeType, z.ZodType>` - compile error if missing).
3. Add a descriptor to `EDGE_FORM_DESCRIPTORS` in
   `packages/core/src/forms/edge-forms.ts`, typed `Record<EdgeType,
   EdgeFormDescriptor>` - also a compile error if missing.
4. Declare its endpoints. The descriptor's `srcTypes` and `dstTypes` are the
   matrix `edgeEndpointsAllowed()` enforces on edge creation, with `'*'`
   meaning any type. A relationship with real constraints should say so here
   rather than accept anything and fail later.
5. Add a `relations.edges.<TYPE>` entry to `docs/entity-catalog.template.json`,
   for the same reason as step 5 above:
   `entityCatalogModel.test.ts` compares `CATALOG_RELATIONS` against
   `EDGE_TYPES`, and the model reads the catalog while it loads.

An edge type needs no glyph and no menu entry - edges are created from a
record's form rather than from the global picker.

> [!WARNING]
> Do not add a branch on an edge type without adding the type. There is a
> branch in the path-finding algorithm testing for an edge type that
> `EDGE_TYPES` does not contain, so the branch cannot execute. A conditional on
> a string that is not in the union is unreachable code the compiler will not
> flag, because the comparison is against a string rather than against the type.

## What enforces what

| Registry | Enforced by | What happens if you forget |
| --- | --- | --- |
| `NODE_PROPS_SCHEMAS` | the compiler (`satisfies`) | `pnpm typecheck` fails |
| `NODE_FORM_DESCRIPTORS` | the compiler (typed `Record`) | `pnpm typecheck` fails |
| `EDGE_PROPS_SCHEMAS` | the compiler (`satisfies`) | `pnpm typecheck` fails |
| `EDGE_FORM_DESCRIPTORS` | the compiler (typed `Record`) | `pnpm typecheck` fails |
| Descriptor field keys, sections, sub-editors | `descriptors.test.ts` | `pnpm test:unit` fails, naming the type and the key |
| `NEW_ENTITY_MENU_GROUPS` | three web tests | `pnpm test:web` fails on a set comparison |
| `docs/entity-catalog.template.json` | the reference model, at load | `pnpm test:web` fails while the module is evaluated |
| `NODE_GLYPH` | nothing | it ships with a fallback dot |

One further side effect, harmless but surprising the first time: the public
landing page prints `NODE_TYPES.length` and `EDGE_TYPES.length` as product
facts. Its test asserts those figures come from the constants rather than being
written out, so the copy follows the union automatically and nothing fails.

## Verifying

```bash
pnpm typecheck
pnpm test:unit
pnpm test:web
pnpm test:map
pnpm docs:gen && pnpm docs:check
```

`pnpm typecheck` first: while it is failing, the test suites are failing for
reasons downstream of the same omission and will tell you less. `pnpm docs:gen`
matters because the generated catalogs count these types; skipping it leaves
`pnpm docs:check` reporting a stale artifact.

No new files means no new source-to-test map entry, unless you have created a
module of your own. If you have, [what counts as a test beside
it](testing.md#what-counts-as-a-test-beside-it) is the rule that decides
whether it needs one.

## Related

[Where a change belongs](where-to-change.md) explains why the vocabulary lives
in `packages/core` and what else that placement implies. [The gates a change
must pass](quality-gates.md) is the reference for the commands above. The
shape of the typed graph itself is in [Architecture](../architecture/index.md).
