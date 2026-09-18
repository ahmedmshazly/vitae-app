# Knowledge system

Vitae keeps one curated whole-life graph and a separate evidence index. Gmail is
the first local source adapter; the contracts and reconciliation rules apply to
every importer.

## Invariants

- A source observation never overwrites a nonempty curated value merely because
  it is newer. Conflicting assertions remain separate and require review.
- Exact identifiers can resolve an identity. Names and context can only suggest
  one. People, organizations, shared mailboxes, and service accounts are distinct.
- A missing scalar or a complementary list item may be applied automatically
  when the identity and statement are unambiguous. Inferred facts require review.
- A source record contains a stable external identifier, content hash, locator,
  useful metadata, and at most a 160-character excerpt. Gmail bodies are not
  retained.
- `occurred_at`, `observed_at`, `valid_from`, and `valid_to` preserve event time,
  learning time, and fact validity as different concepts.
- Historical requests are evidence. The Gmail adapter does not create current
  tasks from old messages.
- Communication direction is derived from configured self addresses and message
  participants. Mailbox labels are not authoritative.
- Automated senders and bulk recipient lists cannot create personal relationships
  automatically.
- Every automatic graph change records an assertion, decision, before/after value,
  and resulting graph revision. Rollback refuses to clobber later edits.

## Storage and APIs

The migration `013-knowledge-evidence` adds workspace-scoped document tables for
sources, runs, source records, source identities, assertions, decisions, and
entity redirects. Every query uses the repository's active workspace and real or
demo space. These optional collections are included in full export and restore;
older backups that do not contain them remain valid.

Authenticated endpoints under `/api/v1/knowledge` list source coverage and the
review queue, register ingestion artifacts, return evidence for an entity, apply
or reject assertions, and roll back a run. Entity screens read accepted and
unresolved evidence from the same endpoint used by Data's review workspace.

## Gmail adapter

Run the adapter against a local SQLite database without modifying that database:

```sh
pnpm import:gmail -- /absolute/path/to/gmail.sqlite --self=me@example.com
```

Pass multiple owner addresses as a comma-separated `--self` value. `--limit=N`
supports a bounded inspection. The adapter inspects common message table and
column names, reads the database in read-only mode with extensions disabled,
hashes content locally, and persists only extracted facts and compact citations.
Coverage reports name missing dates, unavailable attachment text, skipped bulk or
automated messages, and unsupported schema instead of claiming those records were
understood.

## Shared read behavior

- Today adds unresolved assertions to the existing action queue.
- Entity pages show accepted, proposed, and conflicting evidence with locators.
- Network, Career, and Explore consume the same typed graph, so accepted source
  facts become visible without source-specific branches.
- Data shows run coverage, limitations, comparisons, decisions, and rollback.
- Analytics must report the source window and incomplete coverage alongside any
  communication count.
