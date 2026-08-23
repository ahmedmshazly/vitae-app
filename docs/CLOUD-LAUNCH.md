# Vitae Cloud launch guide

This document is the release boundary for a hosted Vitae offering. It is not a
customer contract and it does not mean the service is open. The public site
must remain in its pre-launch state until every required item below is complete
and verified.

## Customer and offer

Vitae Cloud Individual is for an experienced professional preparing a deliberate
career move. They need to recover the people, work, and evidence behind an
opportunity quickly, not manage a sales pipeline, recruit a team, or generate a
generic résumé at volume.

The intended launch offer is one private personal workspace with the complete
product: capture, relationship intelligence, career evidence, tailoring, and
full export. The intended public price is **$24/month** or **$216/year** in USD,
with a 14-day no-card trial. There are no contact caps, export upsells, ads, or
usage credits at launch. Team workspaces, recruiter workflows, and additional
identity providers are outside this first release.

If a person does not subscribe at the end of trial, or a paid subscription ends,
their workspace becomes read-only and remains exportable for 30 days. Deletion
may be scheduled only after clear notices and a supported cancellation path.
The server, not the browser or a payment return page, is authoritative for
access state.

## Required engineering controls

- Every durable graph record, attachment, search result, export, cache entry,
  background job, and storage path is scoped to a server-derived workspace ID.
- A verified identity can bootstrap one private personal workspace safely and
  idempotently. Client headers never create or grant workspace access.
- Current owner data has a tested migration and rollback/restore path before
  any production schema change.
- Billing checkout maps only server-owned plan choices to provider prices.
  Signed provider webhooks use raw request bodies, replay protection,
  idempotent event persistence, and safe handling of out-of-order events.
- Trial, active, cancellation, failed-payment, read-only, export, deletion,
  and reactivation states are enforced on server-side mutations and covered by
  integration tests.
- Import, export, attachment, and compilation paths have workspace-aware rate
  limits, audit logging with sensitive data redaction, and operational alerts.

## Required customer and operational publication

Before enabling `VITE_PUBLIC_CLOUD_ENABLED=true`, configure a real canonical
site URL, legal entity name, legal-terms version, support email, and a public
Paddle client-side token. The browser token is checkout-scoped; Paddle API keys
stay server-only. Publish reviewed Terms, Privacy Notice, Data Processing
Addendum, subprocessor list, security disclosure path, service status route,
cancellation/refund policy, and data export/deletion policy. Do not publish
placeholders as customer terms.

Verify the merchant-of-record account, supported selling jurisdictions, tax
handling, payment lifecycle emails, and support ownership. Configure backups,
test a full restore, rehearse export and deletion, set alerts for webhook and
background-job failure, and prepare an incident response runbook.

## Release sequence

1. Run tenant-isolation, auth bootstrap, billing sandbox, lifecycle, and full
   browser tests against a staging environment with fictional records.
2. Complete a backup/restore drill and verify the legacy personal workspace
   migration without loss of graph identity or attachments.
3. Review live legal and support destinations, public metadata, sitemap,
   robots policy, pricing copy, and customer communications.
4. Enable the server provisioning gate and public Cloud build gate together.
   Confirm a new trial, checkout, webhook reconciliation, cancellation, export,
   and deletion-notice path end to end.
5. Monitor launch health, auth failures, workspace-boundary denials, webhook
   delivery, export completion, and deletion jobs. Disable public provisioning
   if the service cannot uphold these commitments.
