---
id: USE-TROUBLE
title: When something does not work
summary: The states a Vitae screen can be in, the failures the code can genuinely produce, what each message means, and what to do about it.
audience: [user]
domain: use
type: reference
status: verified
verified_at: 2026-08-24
sources:
  - apps/web/src/components/QueryBoundary.tsx
  - apps/web/src/components/ErrorBoundary.tsx
  - apps/web/src/lib/api.ts
  - apps/web/src/routes/SignIn.tsx
  - apps/web/src/routes/NotFound.tsx
  - apps/web/src/routes/tailor/Tailor.tsx
  - apps/web/src/routes/tailor/PreviewPane.tsx
  - apps/web/src/routes/Templates.tsx
  - apps/web/src/routes/ImportHub.tsx
  - apps/web/src/routes/Settings.tsx
  - apps/web/src/routes/Billing.tsx
  - apps/web/src/app/Shell.tsx
  - apps/api/src/middleware/error.ts
  - apps/api/src/middleware/auth.ts
  - apps/api/src/middleware/workspace.ts
  - apps/api/src/routes/v1/status.ts
  - apps/api/src/routes/v1/resumes.ts
  - apps/api/src/routes/v1/imports.ts
  - apps/api/src/routes/v1/export.ts
  - apps/api/src/services/imports.ts
  - apps/api/src/services/restore.ts
  - apps/web/src/routes/docs/docsContent.ts
  - packages/ui/src/feedback.tsx
  - packages/ui/src/layout.tsx
requirements: [FR-010, FR-013, FR-011, FR-RES-013, FR-022, FR-023, FR-015, FR-SET-006]
covers:
  - route:/settings/system
related: [USE-SCREENS, USE-RESUME, USE-PORTABILITY]
---

# When something does not work

This page documents failures the code can actually produce. Every message
quoted here is a string in the source, not a paraphrase. If you are seeing a
message that is not on this page, it is most likely the underlying error text
being passed through, which the interface does on purpose rather than replacing
it with something vaguer.

## Read the state before reading the message

Almost every region in Vitae goes through one shared boundary, and it renders
exactly one of five things. Knowing which one you are looking at usually
answers the question on its own.

| State | What it looks like | What it means |
| --- | --- | --- |
| Loading | A skeleton shaped like the content that is coming | The request is in flight. It is not a spinner and it does not animate in. |
| Error | A panel with a title, the underlying detail in monospace, and **Retry** | The request failed and there is no data to show. |
| Empty | A short line and usually an action | The request succeeded and there is genuinely nothing there yet. |
| Empty, filtered | A different line, and an action that clears the filter | The records exist; your filter is hiding them. |
| Content | The thing itself | It worked. |

The two empties are deliberately different, and the difference is load-bearing.
*"No atoms yet"* and *"No atoms match these filters"* are separate claims with
separate exits, and a screen that showed the first when the second was true
would be telling you that you own nothing.

There are also two states that sit *above* content rather than replacing it:

**Refreshing.** A live status line reading *"Refreshing data · Keeping the
current view in place"* while cached data is being updated. Nothing is wrong.

**Degraded.** A red banner over a screen that is still rendering. Two forms:

- *"Couldn't load [the history and the favour ledger]"*, with the body
  *"Everything else on this screen is current."* — a secondary region failed;
  the rest of the screen is true.
- *"Couldn't refresh this data"*, with *"Showing the last available version."* —
  a refresh failed after data had already arrived. What you are looking at is
  real but may be stale.

A degraded banner never blanks a screen that has truthful content on it. That
is the rule: a failed secondary request must not be allowed to make a working
screen look like an empty one.

## Sign-in and session

### "No way in"

The build has neither Google sign-in nor the developer shortcut configured.
The screen says *"No sign-in method is configured. This build has neither Google
sign-in nor the developer shortcut. Check `VITE_FIREBASE_*` in the environment
it was built with."*

This is a build problem. Nothing you do in the browser will fix it.

### "Sign-in failed."

Whatever the identity provider said, passed through — a popup you closed, the
wrong account, an unauthorised domain. The specific reason is printed after the
bold lead.

### "Workspace setup needs attention."

Sign-in itself worked, but the private workspace could not be prepared. You stay
at the door rather than being dropped into a half-built workspace. On a Cloud
instance, an account that cannot be enrolled automatically produces *"This
account cannot be enrolled automatically."*

### "Sign-in required." / "This is a private system."

These come back from the API rather than the sign-in screen, and they usually
mean the session expired while the tab was open. The API answers `401` with
*"Sign-in required."* when there is no token at all, and with *"This is a
private system."* on a self-hosted instance — or *"A verified Google sign-in is
required."* on Cloud — when the token is present but the account is not the one
this instance admits. The message is deliberately neutral: it never reveals
whether a particular address is on the allow list.

Reload the page. The gate will send you back to the door if the session is
genuinely gone.

### The developer shortcut refuses

*"Developer sign-in is disabled."* means the build does not enable it.
*"Developer sign-in only answers local requests."* means you are trying to use
it from somewhere other than the machine the API is running on, which it will
not do.

## The build service

The résumé compiler runs LaTeX in a separate service, and it is the one
dependency whose absence changes what the product can do.

### "Build service offline"

Shown as a warning banner in the compile preview, with the body *"Start it with
`docker compose up -d buildsvc`, then compile again. The LaTeX source is
complete either way."*

Everything except the rendered page still works: selection, scoring, coverage
and the assembled document are all real, and the `.tex` source is offered for
download. When an API call needs a compile it cannot get, it answers `503` with
the code `BUILD_OFFLINE`.

### "Build service unavailable"

The same condition seen from the templates screen, with the detail *"Start
buildsvc to compile résumés and verify their page models."* It is shown as a
blocking banner there rather than a line of body text, because an unavailable
service means nothing will compile anywhere in the workspace.

### "Compile failed"

The service was reachable and the document did not typeset. The detail carries
the error code, the message, and the section it happened near when that is
known — for example `COMPILE_ERROR: … (near section: experience)`. The LaTeX
log tail is behind a disclosure below it, and the `.tex` source is offered for
download so you can reproduce it outside Vitae.

This is usually content rather than infrastructure: something in a bullet that
the template could not set. User content is escaped before it reaches LaTeX, so
a stray backslash is not the usual cause.

### "Couldn't reach the build service"

The request to the service failed rather than the compile. Retry from the
button on the panel.

## Finalising a résumé

### The output saved as a draft rather than final

Finalising judges two gates and reports each separately. The receipt shows two
chips: **One page** or *"[n] pages"*, and **Coverage gate passed** or *"Below
95%"*. An output that fails either is saved as a draft with the detail *"It did
not clear both gates, so it was not marked final"*.

That is not an error. It is the product refusing to call something final that
is not.

### "Needs manual trim"

The one-page fit loop ran its three iterations and the document is still over
one page. The screen says *"Still over one page after auto trim. Drop or reword
bullets in Selection, then finalize again."*

This usually means too many atoms are pinned. The loop cannot drop a pinned
atom, so pinning everything removes its ability to help you.

### "Couldn't finalize this résumé"

The finalise request failed. The detail carries the reason, or *"Nothing was
saved. Try again."* when there is none. Nothing was persisted.

### Marking sent refuses

Two refusals, both `409`:

- *"Only a finalized résumé can be sent, this one is still a draft. Re-run
  Finalize: it must fit one page and cover ≥95% of the job description's
  keywords."*
- *"This résumé has already been sent."*

Both exist because sending creates an application record. A draft becoming a
real application, or one application becoming two, are the outcomes these
refusals prevent.

### "Only a finalized output can be the base résumé."

Same principle, for setting the comparison baseline.

### "Compile succeeded but Cloudinary storage failed. Retry Rebuild artifacts shortly."

The document typeset but its files could not be stored. The output is still
listed; use **Rebuild artifacts** on it once storage is back.

## Tailoring

### "Not saving. Your last changes are only in this tab."

The Tailor autosave failed. This appears in the page header, where the header
also promises that everything is autosaved — so the promise and its withdrawal
are in the same place.

Do not navigate away. Copy anything you cannot lose, then retry by making
another change once the connection is back.

### "Couldn't score your atoms against this target."

Scoring failed, and the message continues *"Any numbers below are from the
previous run."* Scoring and saving fail for different reasons and have separate
signals, so this one never claims your work is unsaved.

### "Couldn't load your job targets" / "Couldn't load your atoms"

One of the two queries the workspace needs failed, and the message ends *"the
workspace below is incomplete."* The panes that depend on the failed query will
be empty — which is why the message is there, because an empty pane on its own
reads as *you have nothing*.

## Importing

### A file will not stage

Refused with `422` and the code `INVALID_IMPORT_CONTENT`. The message names the
problem. For an Aperture bundle: *"not valid JSON: expected a
vitae.graph.bundle export"*, or *"not a valid vitae.graph.bundle: [field]:
[message]; …"* listing the first few specific errors.

Nothing is staged and nothing is written. Fix the file and stage again.

### The batch operations

Each reports itself at the top of the import screen: *"Source could not be
staged"*, *"Batch was not committed"*, *"Batch was not discarded"*, *"Batch was
not rolled back"*, *"Row decision was not saved"*, *"GitHub sync stopped"*.

They are reported there rather than inside the review panel because the review
panel only exists while a batch is open, and a commit started from batch
history has to be able to fail somewhere you can see it.

### "This batch has no rows"

The file parsed but produced nothing. Discard it and import again from a
different source.

### GitHub

*"Add a GitHub token in Settings first."* — no credential is configured.

*"GitHub rejected the token, it may be revoked or expired."* — the credential
exists and GitHub refused it. Issue a new personal access token with repository
read scope and save it again.

## Exporting and restoring

### "Another export is already running."

One export runs at a time per workspace. Wait for the first to finish.

### "Export did not finish"

The status line above the export controls, carrying the underlying reason.
Nothing partial is left behind.

### A restore refuses

Restore verifies the whole bundle before writing anything, so these all happen
at the door:

- *"bundle has no manifest.json"*
- *"checksum mismatch for [file], bundle is corrupt"*
- *"bundle is missing [file] listed in the manifest"*
- *"[file]: manifest count [n] does not match [m]"*
- *"unsupported bundle schema_version …"*
- *"share-safe exports are intentionally incomplete; restore requires a full
  sensitive backup"*

The last one is the common surprise, and it is the export screen's warning
arriving late: a bundle that excluded sensitive records cannot rebuild a
database, because everything referencing them was excluded too.

## Validation refusals

The API validates the envelope of a record and then its type-specific
properties, and returns errors per field rather than as one rejection. A `422`
with the code `VALIDATION` carries a `details` list naming each field and what
was wrong with it.

Some refusals you will meet by hand:

| Message | Where |
| --- | --- |
| *"title is required"* | Creating almost any record, reported against the `title` field |
| *"Unknown application status."* | Filtering or setting an application stage |
| *"Unknown résumé template."* | Choosing a template |
| *"Unknown résumé emphasis."* / *"Unknown preferred wording emphasis."* / *"Unknown atom variant emphasis."* | Wording controls |
| *"Accent must be selected from the curated palette."* | Choosing a colour |
| *"a target may contain at most 40 keywords"* | Editing parsed keywords |
| *"owner_node must be a live role or project"* | Creating an atom |
| *"A view needs a name and a query."* | Saving a view |
| *"Nothing to capture."* | An empty capture line |
| *"decision must be accept or skip"* | An import row decision |
| *"keepId and dropId are required"* | A merge |

Edges are also checked against the record types their endpoints are allowed to
be, so an impossible connection is refused rather than stored.

## Requests that fail before they arrive

| Code | Message | Cause |
| --- | --- | --- |
| `PAYLOAD_TOO_LARGE` (413) | *"Upload is too large (limit [n] MB)."* | A file bigger than the body limit |
| `MALFORMED_JSON` (400) | *"Request body is not valid JSON."* | A truncated or corrupted request |
| `REQUEST_ABORTED` (400) | *"Upload was interrupted."* | The connection dropped mid-upload |
| `UNSUPPORTED_ENCODING` (415) | *"Unsupported content encoding."* | An encoding the server does not accept |

These used to fall through to the generic handler, which meant a too-large
import told you *"Something went wrong."* They are named now.

A request that takes longer than 60 seconds is aborted by the browser. A file
download is given 10 minutes, because building an archive legitimately takes
longer than answering a query.

## "Something went wrong."

The generic `500`. It means an error reached the server's outermost handler
without being classified. The response carries a `request_id`, and the server
logs the same id with the stack — so if you are self-hosting, that id is how you
find it.

## Read-only and account states

On a Cloud workspace, `402` with *"This workspace is read-only. Export your data
or manage billing to continue."* means writes are paused. Reading and exporting
still work; the billing screen puts the export link on the screen alongside the
access state rather than burying it.

The five access states are shown on the billing screen with what each one still
allows: full trial access, paid access active, payment needs attention,
read-only access, and deletion scheduled.

Billing itself is only present on a Cloud-enabled instance. On any other build
the address redirects to Settings, and a billing API call answers *"Billing is
not enabled for this installation."*

## The screen crashed

Two boundaries are wired into the application, and which one you hit tells you
how much broke.

**"This page hit an error"**, with the error message and a Retry, means one
screen's render failed. Navigation still works; the boundary is keyed by route,
so moving away and back gives you a fresh attempt.

**"Vitae hit an error"**, with *"Reloading usually clears this."*, Try again and
Reload page, means the shell itself failed. Navigation may be part of what
broke, which is why that one offers a hard reload as well as an in-place retry.

## Nothing at this address

**"Not found"** — *"That address does not match anything in this space."* — is
the signed-in 404, and it lists every workspace. It exists because a dead URL
used to render the dashboard, which made a broken link look exactly like a
successful navigation home.

**"There is no documentation page at this address."** is the documentation
surface's equivalent, and it says which of the two possibilities it cannot tell
apart: a page that was renamed, or a link older than the page it pointed at.

If you are signed out and followed a link into the workspace, you were sent to
the public home page rather than shown a login wall.

**"The documentation is private. Sign in at /signin with the account that owns
this instance, then open this page again."** means the address is fine and you
are not. The documentation is served by the API, which refuses it to anyone who
is not the owner, so a signed-out reader — or a reader signed in as somebody
else — gets the empty frame and this sentence rather than a redirect. It is
worded to stop you debugging a build that is working.

**"No documentation was built into this deployment, so there is nothing to read
here yet."** is the other one, and it is an operator's problem rather than
yours. The corpus is compiled separately from the application and the API has
to be pointed at the result; this message means it was not. See
[Operate](../operate/index.md).

## Where to look when nothing obvious is wrong

`/settings/system` is the health screen. It reports each service check
individually — the database, attachment storage, and the build service — with
its detail, alongside live record counts.

The database check is a **write**, not a read. That is deliberate: a database
that is up but read-only, because it failed over to a replica or filled its
volume, would pass a read check while nothing you did could be saved.

The same information drives the indicator in the rail's foot and the workspace
strip, which reads *Systems nominal*, *System attention needed*, *Status
unavailable*, or *Checking system*, and links to that screen.

## Two things that look like failures and are not

**"Nothing needs you today."** Today's queue is empty because nothing is due,
not because it failed to load. A genuine failure there says *"Couldn't load
today"*.

**A priority that ended up in a title.** The capture grammar's priority token is
`!p1` through `!p4`. The task example in the capture dialog itself writes `!2`,
which the parser does not recognise as a priority, so it becomes part of the
title. Edit the record's title and use `!p2` next time. This is a defect in the
example, not in the parser.

## Where to go next

- What each screen is supposed to do when it is working: [Every screen, and what it is for](screens.md).
- The résumé chain in full: [Producing a résumé](write-a-resume.md).
- Import, export and restore in full: [Getting data in and out](import-and-export.md).
- Running the instance behind all of this: [the operations section](../operate/index.md).
