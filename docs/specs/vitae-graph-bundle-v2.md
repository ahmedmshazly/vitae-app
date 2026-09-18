# `vitae.graph.bundle/2`

Version 2 extends the version 1 graph transfer with durable relationship
identities and compact evidence. Vitae continues to accept version 1 bundles.

An edge may carry a bundle-local `ref` and `identity_keys`. Its first explicit
identity key determines the durable edge ID. Without one, the ID is derived from
edge type, resolved endpoints, `start_date`, and `end_date`; repeated episodes do
not collapse.

The optional top-level `evidence` array contains assertions:

```jsonc
{
  "subject_kind": "node", // or "edge"
  "subject_ref": "p1", // node ref, or an edge ref
  "field": "props.city", // $record and $relationship are also valid
  "value": "Cairo",
  "basis": "explicit", // explicit, inferred, or manual
  "confidence": 0.98,
  "observed_at": "2026-09-01T10:00:00Z",
  "valid_from": null,
  "valid_to": null,
  "citation": {
    "external_id": "profile:123",
    "locator": "aperture://run/123/profile",
    "content_hash": "8a57d9d5d4f7a041",
    "excerpt": "Based in Cairo",
  },
}
```

Node evidence must resolve to a node ref. Edge evidence must resolve to an edge
with a `ref`. Excerpts are optional and limited to 160 characters. The importer
persists the producer as a knowledge source, the transfer as a knowledge run,
one compact source record per citation, and field-level assertions linked to the
committed graph IDs. Matching values become accepted supporting evidence;
missing values become suggestions and nonempty differences become conflicts.

Version 1 bundles must omit evidence. Unknown schema versions are rejected.
