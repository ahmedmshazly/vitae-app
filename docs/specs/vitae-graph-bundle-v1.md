# `vitae.graph.bundle/1`

The transfer format for moving atomic graph records into Vitae from an external
system (today: Aperture).

This document is the single source of truth. It is implemented twice: Zod in
`vitae/packages/core/src/schema/bundle.ts`, Pydantic in
`aperture/apps/console/fathom/core/bundle.py`. Both implementations are
pinned to the same golden fixture, `fixtures/vitae-bundle.golden.json`, which is
byte-identical in both repos. Change the spec, change the fixture, and both
contract tests fail until both sides agree.

## Shape

```jsonc
{
  "format": "vitae.graph.bundle",
  "schema_version": 1,
  "source": {
    "system": "aperture",
    "run_id": "3f2b...",           // optional; the producing run
    "exported_at": "2026-07-28T12:00:00Z"
  },
  "nodes": [
    {
      "ref": "p1",                              // bundle-local handle, see below
      "type": "person",                         // a Vitae NodeType
      "identity_keys": ["linkedin:person:jsmith"],
      "title": "Jane Smith",
      "subtitle": "Staff Engineer at Acme",
      "props": { "headline": "...", "city": "Cairo" },
      "start_date": "2019-04-01",               // optional, YYYY-MM-DD
      "end_date": null,
      "date_precision": "month",
      "notes_md": "",
      "source": "import_aperture",
      "source_ref": "aperture:run:3f2b...",
      "confidence": 0.9
    }
  ],
  "edges": [
    {
      "type": "AUTHORED",
      "src": "p1",                              // a node ref in THIS bundle
      "dst": "po1",
      "props": {},
      "start_date": null,
      "end_date": null,
      "source": "import_aperture",
      "source_ref": "aperture:run:3f2b...",
      "confidence": 0.9
    }
  ]
}
```

## Refs

`ref` is a **bundle-local** handle, not an id. It exists so the producer can
express edges between records that do not have Vitae ids yet. At commit time the
importer builds a `ref → nodeId` map and rewrites every edge.

- Unique within a bundle. Duplicates are a validation error.
- Every `edge.src` and `edge.dst` MUST match a `node.ref` in the same bundle.
  Edges to records already in Vitae are not expressible in v1. Include the
  target node in the bundle with its `identity_keys` and let the importer
  resolve it to the existing record.
- Refs carry no meaning across bundles. Do not persist them.

## Identity keys

`identity_keys` are stable external identifiers. They are the entire basis of
idempotence: importing the same bundle twice MUST NOT create a second copy of
anything.

Format: `<system>:<kind>:<key>`, lowercased, no whitespace.

| Kind | Example |
|---|---|
| person | `linkedin:person:jsmith` |
| company | `linkedin:company:acme-corp` |
| job | `linkedin:job:3812004421` |
| post | `linkedin:post:urn-li-activity-7012...` |

Rules:

- The **first** key in the array is the primary. The importer derives the Vitae
  document id from it as `ext-<sha256(primary).slice(0,40)>`, so the same
  external record always lands on the same document.
- A node MAY carry additional keys (aliases, prior handles). They are matched on
  import but do not affect the document id.
- A node MAY carry zero keys. Such records get a random id and are deduplicated
  by the existing fuzzy matcher instead. Derived records with no stable external
  id of their own (a role, a school stint) are expected to be keyless.
- Keys are matched exactly. Normalization is the producer's job.

## Node fields

`type`, `title`, and `props` follow the Vitae node envelope
(`packages/core/src/schema/envelope.ts`) and the per-type props schema. A bundle
node is exactly a `nodeCreateEnvelope` plus `ref` and `identity_keys`.

Props are validated against the target type's schema at **stage** time, not at
parse time, so a bundle carrying a props key Vitae does not know is accepted and
round-trips (every props schema is `.passthrough()`).

`source` SHOULD be `import_aperture` for Aperture-produced bundles. `source_ref`
SHOULD be `aperture:run:<run_id>`. The importer's rollback works by
soft-deleting everything sharing a `source_ref`.

`confidence` is 0..1 and reflects the producer's certainty. Scraped fields that
were inferred rather than read (an estimated date, a name parsed out of a
headline) SHOULD carry a lower confidence than fields read directly.

## Edge fields

`type` is a Vitae `EdgeType`. The pair (`type`, src node type, dst node type)
MUST satisfy `edgeEndpointsAllowed()`. The importer rejects the row otherwise
rather than writing an edge the UI could never have created.

## Limits

| | |
|---|---|
| Max nodes per bundle | 20 000 |
| Max edges per bundle | 60 000 |
| Max `identity_keys` per node | 20 |
| Max serialized size | 15 MB (the `/api/v1/imports` body limit) |

Producers that exceed these split by run.

## Versioning

`schema_version` is an integer. A consumer MUST reject a bundle whose
`schema_version` it does not implement. No best-effort parsing of an unknown
version. Additive changes that keep old bundles valid (a new optional field, a
new node type) do not bump it; anything that would make a v1 bundle parse
differently does.
