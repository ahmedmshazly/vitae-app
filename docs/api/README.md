# Vitae REST API `/api/v1`

Machine-readable contract: [`openapi.json`](./openapi.json) (OpenAPI 3.1).
Regenerate with `pnpm openapi` after changing
`apps/api/src/openapi/` or adding a `v1` router mount (`V1_MOUNT_PREFIXES` in
`apps/api/src/openapi/mounts.ts`). `pnpm test:contract` fails if the checked-in
JSON drifts from `buildOpenApiDocument()`.

All endpoints require the owner session (cookie or `Authorization: Bearer
<token>`) except `POST /auth/dev-login`, `POST /auth/logout`, and `GET /health`.
Errors are `{ "error": { "code", "message", "details?", "request_id" } }`.
Requests/responses are JSON unless noted.

## Auth
| Method | Path | Body → Result |
|---|---|---|
| POST | `/auth/dev-login` | → `{ token, user }`; sets httpOnly session cookie (dev only) |
| POST | `/auth/logout` | → `{ ok }` |
| GET | `/auth/me` | → `{ user, devLoginEnabled }` |

## Nodes & edges
| Method | Path | Notes |
|---|---|---|
| GET | `/nodes?type=&limit=&includeArchived=&includeDeleted=&withOwner=` | list; `withOwner=true` adds `owner {id,title,isSelf}` per row (costs a graph pass) |
| POST | `/nodes` | create; body validated by per-type Zod schema |
| GET | `/nodes/:id` | → `{ node, edges, neighbors, owner }`. `owner` is whose record it is, resolved from the subject edge (ADR 0004) |
| PATCH | `/nodes/:id` | update (writes a revision) |
| DELETE | `/nodes/:id` | soft-delete (Trash) |
| POST | `/nodes/:id/restore` | restore from Trash |
| POST | `/nodes/:id/archive` | `{ archived }` |
| GET | `/nodes/:id/revisions` | audit history |
| POST | `/edges` / PATCH `/edges/:id` | first-class relationships |

## Capture
| POST | `/capture/preview` | `{ raw }` → `{ plan }` (parse only) |
| POST | `/capture` | `{ raw }` → creates linked records + reminders |

## Search
| GET | `/search?q=` | FTS + filter-grammar AST → `{ ast, results }`; each result carries `owner` |
| GET | `/search/switch?q=` | fuzzy ⌘P quick-switcher |

## CRM
| POST | `/ask/people` | `{ need, topics, org, city }` → ranked people with factor chips |
| GET | `/ask/reconnect` | reconnect lane |
| GET | `/ask/people/:id/strength` | tie-strength decomposition |
| POST | `/interactions` | `{ personId, kind, summary, occurredAt, followUps }` → logs + recomputes strength |
| GET | `/people` | directory with tie-strengths; each row carries `recordCount` + `isPlaceholder` |
| GET | `/people/:id/summary` | strength decomposition, KNOWS props, favor ledger (*my relationship with them*) |
| GET | `/people/:id/profile` | **their own records**, grouped as a CV reads, plus their skills (ADR 0004) |

## Résumé engine
| POST | `/targets` | `{ role_title, company?, jd_raw }` → parsed keywords (BM25F) |
| GET | `/targets/:id` | |
| PATCH | `/targets/:id/keywords` | edit parsed keyword set |
| GET | `/atoms?scope=` · POST `/atoms` · PATCH `/atoms/:id` | atoms + variants + skills; listed for the owner's records only (`scope=all` to include everyone's, plus `hiddenForeign`) |
| GET | `/resumes/templates` | template registry + line models |
| POST | `/resumes/tailor` | score + auto-select to the page budget |
| POST | `/resumes/compile` | render LaTeX → compile (or `.tex` if offline) + coverage |
| POST | `/resumes/finalize` | enforce 1 page + ≥95% coverage gate, persist |
| POST | `/resumes/:id/mark-sent` | create/link an application node |
| GET | `/resumes` | outputs library |

## Ops
| GET | `/dashboard` | aggregate for the Today screen; `counts` splits `myRecords` / `allRecords` / `unownedRecords` |
| GET | `/reminders` · POST `/reminders/:id/done|snooze` | |
| POST | `/export` | streamed ZIP (JSONL + vault + manifest) |
| GET | `/export/manifest` | preview counts + checksums |
| GET | `/status` | DB / storage / build-svc health + counts |

### Example: create a target

```http
POST /api/v1/targets
{ "role_title": "Senior ML Engineer", "company": "Nile", "jd_raw": "…" }

201 → { "target": { "id": "…", "parsed": {
  "parser_version": "2.0.0-bm25f",
  "keywords": [ { "term": "Python", "weight": 4.11, "skill_id": "s_py", "sections": ["requirements"], "spans": [[24,30]] } ]
} } }
```
