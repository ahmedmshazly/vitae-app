# Frontend completion manifest

This is the authoritative completion ledger for Vitae interfaces. A row is
marked **verified** only when its stated test or browser evidence exists.
`implemented` and `verified` are intentionally separate.

## Inventory sources

### Active implementation pass — 2026-09-14

Existing evidence below is historical. Each checkbox in this pass requires its own
rendered and behavioral verification; completing a family does not complete its children.
The current design is the implemented Living Ledger palette with task-first layouts.
The personal installation on port 8080 is not a write-test target.

Current surface: **Career overview — pending.**

Correspondence complete for `/network/correspondence` within documented verification
bounds: an evidence-first reactivation queue with client-side name/quiet-time filters,
explicit no-results recovery, a factual explanation of relative priority scores, balance
and broker ledgers, and an actual InteractionLogger handoff. Existing response, empty,
error and refetch states are retained. Links use 32px precise-pointer and 44px coarse-
pointer targets. No backend/API contract changed; client filters do not change the server
rollup.

Verification passed: Correspondence state units 4/4, the existing Correspondence Chromium
suite 4/4 including axe, and the dedicated 1440/390px Chromium/Axe journey after the final
correction. Scoped typecheck, lint and diff check were clean; the reviewer returned
**ship** after the addendum. Captures are retained under
`e2e/test-results/correspondence-review-final/correspondence-repair-Corr-4ed59--usable-across-screen-sizes-chromium/`.
The production build was started with no observed errors at this checkpoint; completion
is not yet confirmed here. Coverage is Chromium responsive emulation only; physical
devices, Firefox and WebKit remain unverified. Logging retains its existing non-idempotency
and uncertain-save limits. This completion covers the Correspondence screen, not every
consumer of the shared connection/logging overlays. PRODUCT.md and DESIGN.md are unchanged.

Warm paths complete within documented verification bounds: destination rail → ranked
route evidence → explicit draft request. Target/path responses are validated; URL recovery,
history selection and filter recovery preserve context. Loading, refresh, error, no-path
and direct-affiliation states are explicit. Mobile Composer acknowledgement has scroll
clearance; selected state remains visible in forced colors, and coarse-pointer controls
have touch targets. No backend behavior changed.

Verification passed: twenty focused unit tests, one dedicated Chromium/Axe journey at
1440/834/390px, eleven existing intros Chromium cases and one existing composer-consumer
Chromium case. Lint and diff check were clean; the production build ran and completed.
Rendered captures are retained in
`e2e/test-results/warm-paths-review-closure/warm-paths-repair-Warm-pat-42525-ff-usable-at-every-viewport-chromium/`.
The reviewer returned **ship** after the bounded addendum. Coverage is Chromium responsive
emulation only; physical devices, Firefox and WebKit were not verified. Composer drafts
and copies but does not send; logging remains non-idempotent. PRODUCT.md and DESIGN.md
remain unchanged. Correspondence remains pending.

Who to contact complete within documented verification bounds: URL-keyed query state supports Back/Forward, trimmed input,
repeat ranking and history recall. Malformed rank/history/pack payloads are errors;
cached/history failures retain usable content with retry. Match caveats cover all results,
factors retain their signs, and expanded context wraps with truthful recorded-follow-up
and related-record labels and canonical links. Composer sessions include the target in
their reset key, reject stale responses, retain draft/evidence after regeneration failure,
confirm edited replacement and guard unsaved dismissal. An external-sent acknowledgment
precedes Log outreach & follow-up; the API records activity and does not send messages.
Submission freezes synchronously against duplicates, handles uncertain failure locally,
offers retry/profile recovery and respects read-only logging. Logger options use 32px
precise-pointer targets and 44px targets on phones/coarse pointers.

Unit evidence: an initial 56/56 batch passed (Ask 19, Ask states 7, Composer 3 + 10 +
repair 5, Logger 11, Intros states 1); Ask states subsequently grew to nine. The latest
25/25 post-review batch passed (Ask states 9, composer repair 5, Logger 11). There are
58 distinct covered cases across overlapping runs, not one 58-test run. One React 19/JSDOM
act/Suspense warning remains in the composer discard test; browser focus behavior passed.
Scoped lint, typecheck and diff check passed. The first two production builds passed,
including the logger-sizing fix, with 3310 modules; existing large-chunk warnings remain for Map
1.036MB, graph 1.419MB and index 1.5605MB. No bundle optimization is claimed.

Browser evidence: ten existing Ask tests individually passed in `contact-ranking-confirmed`
before the aggregate stopped; this is not an aggregate completion claim. The new query/
evidence/recovery journey passed there. `contact-composer-confirmed` passed 2/2 for complex
draft recovery and real scratch-API interaction plus seven-day reminder proofs.
`composer-consumer` passed 1/1 for Warm paths' target-organization handoff, phone layout
and Escape focus return; it does not complete Warm paths. Latest `contact-review-fixes`
passed 4/4: three-width help keyboard/focus and selector/pending behavior; real contact
actions with eight measured logger button heights; Today logger multiline/date/discard;
and actual lost-response idempotent retry/Undo. Widths are 1440/834/390px with axe/overflow
checks. Intentional 503s produce expected console errors; no page errors were observed
in the new mocked journeys.

Main and reviewer inspected the original 32 captures: eighteen ranking, eleven composer
and three logger views. The reviewer resolved the logger-sizing finding. Its secondary-
control addendum found three further fixes: request options were 28px instead of 32/44px,
the help heading used the public display font instead of Space Grotesk, and factor-bar
help did not explain deductions in a positive-only bar. All three are fixed: request
options now use scoped 32/44px targets, the help heading uses Space Grotesk, and help copy
explains positive values and deductions. The reviewer returned **ship** for those three
scored fixes only, with no visible regression in the four recaptures; the earlier logger
finding was already resolved. This is not a renewed whole-screen or whole-app audit.
Main opened all eleven new captures (three logger, four
help/dropdown, four Today logger) plus one Warm paths consumer view. Earlier attempts
included selector mismatches, a fixed axe finding for recovery-link underlining, and an
aggregate exit 143 after a test tried to dismiss a toast outside the modal; corrected
waiting and dedicated runs passed. PRODUCT.md, DESIGN.md and this manifest supplied
review context.

Final controls verification passed 1/1 in `e2e/test-results/contact-controls-reviewed`,
including computed font and option heights at all three widths, help keyboard/focus,
selector and pending states. Main and reviewer individually opened all four captures in
`contact-controls-Contact-h-28427-anking-support-keyboard-use-chromium/`: ranking-help at
1440/834/390px and request-options at 390px. Production build passed a third time after
these final production changes (3310 modules, the same existing chunk warnings); scoped
lint and diff check passed. Final Ask units passed 28/28 (19 helpers, nine states),
overlapping the 58 distinct cases above. Earlier attempts failed sign-in when invoked
with localhost instead of the configured 127.0.0.1, then an exact 32px assertion received
31.99997px. Correcting the host and rounding the assertion to 0.01px produced the pass;
these harness corrections did not change app behavior. Reproduction uses
`http://127.0.0.1:5183` and `http://127.0.0.1:4010/api/v1`.

Retained limits: responsive Chromium checks do not cover physical devices, Firefox or
WebKit. Read-only behavior is unit-tested, not a restricted-session browser run. History
deduplication ignores city even though it is displayed. `/composer/draft` accepts an
organization ID, not a freeform name; a name is context and is not synthesized into an ID.
`/composer/send` logs rather than sends and is not idempotent: an interrupted response
may already have committed, and the UI warns that retry can duplicate records. No backend
changes occurred. All browser work used scratch 5183/API 4010; personal 8080 was untouched.
Existing Living Ledger design files are preserved. Who to contact is complete within
these recorded checks and independently scored fixes; Warm paths remains pending.

Organization detail complete within the verification bounds below: saved details/notes,
safe website links, parallel record/profile queries with explicit partial, incomplete,
failed and cached recovery, and section navigation. Ranked people and roles precede
related organizations; people, roles, related records and connections independently
disclose twenty then twenty-three rows. Phone titles and connection names remain visible.
Route-keyed state and read-only guards protect writes; Edit, Add connection, property
editing and unlink reuse existing protected forms. Trash has a synchronous submission
guard, initial Cancel focus, stacked local alerts, retry and a fallback for blank error
messages. Organization dialogs use the app font. Implementation is scoped to `Org.tsx`,
`OrganizationRecord.tsx` and Network styles, without dependencies or API changes.

Unit evidence: the initial ten Org tests and typecheck passed. A new 44-test batch passed
42; two failures involved JSDOM's unsimulated native Enter and transient visibility timing.
Corrected tests passed the final 45/45 batch (Org 6, states 5, upgrade 6, Evidence 5,
ConnectionRow 12, NodeFormDialog 11). Added connection-disclosure coverage passed 7/7
upgrade tests; after reviewer fixes, 13/13 Org/upgrade tests passed. These runs overlap.
Scoped lint and typecheck passed. Full production `tsc -b`/Vite builds passed twice with
3309 modules; existing large chunks remain (MapView 1.036MB, graph 1.419MB, index 1.560MB).
The last build/lint preceded only the final two-pixel-to-one-pixel alert border correction;
final browser and `git diff --check` passed afterward.

Both journeys passed in `e2e/test-results/organization-detail-confirmed`: long profiles
with 23 records in bounded lists, notes/evidence keyboard access, cached 503, reload and
partial-record failure/recovery/empty states; and real Edit/Keep editing/save → existing
person membership → property save → unlink retaining the person → DELETE 503/retry/Trash,
with GET proofs. Captures at 1440/834/390px include axe, horizontal overflow and header
bounds checks. The first 1/2 browser run exposed a blank error suppressing Trash feedback;
the fallback and unit regression fixed it. Header clipping, tablet title compression and
mobile connection truncation were also fixed. A cached-error replay passed with the phone
error actually visible. Later review-fix and alert-confirmation real workflows each passed
1/1, including computed Space Grotesk checks; no page errors were observed.

Main and reviewer individually inspected all 48 required captures across the first,
confirmed and cached-error runs. The finish reviewer requested two fixes: cramped Trash
error text and public-display modal headings. Both were fixed and inspected in fifteen
`organization-detail-review-fixes` recaptures, but review found a two-pixel alert border
regression. After correction, both inspected three `organization-detail-alert-confirmed`
captures; the final **ship** disposition covers those scored fixes and regression only.
The fifteen Edit/Add/properties/unlink/Trash captures establish associated-overlay coverage,
not every possible typed relationship. Read-only, null and unsafe URL cases are unit-tested,
not separate browser permission captures. Generic edge POST idempotency and unseen
concurrent-edit limits remain unchanged. All runs used fictional scratch fixtures on
5183/API 4010; personal port 8080 was untouched. The approved city repair below is preserved.
`PRODUCT.md`, `DESIGN.md` and the absent sidecar remain unchanged; no broader completion
or renewed whole-app certification is claimed.

Organizations directory implemented and reviewed; the approved HQ-city repair is verified below:
URL-backed search and four sorts, twenty-row disclosure, title/kind/domain/city search,
hidden-selection warnings, read-only guards and mobile action layout. Missing collections
are explicit errors; refresh failure retains cached rows. Brief explanations distinguish
affinity and recorded roles. Main and reviewer individually inspected all thirty directory
and basic-form screenshots; the reviewer returned **ship** for that scope.

Organization creation also covers a populated Has member draft: select an existing
fictional person, choose a role, add/remove/re-add and save; a subsequent GET verifies
exactly one correct MEMBER_OF edge. The populated-draft review found truncated names
and missing visible labels. ConnectionComposer and scoped app styles now fix both;
main and reviewer opened all three `organization-membership-fixes` recaptures, and the
reviewer scored both findings resolved only. NodeFormDialog save failures focus the
local alert while preserving the draft and retry; focus and viewport were verified
before capture.

Verification: all 34 unit tests passed (NodeFormDialog 11, Organizations 8 + axe 2,
People 11 + axe 2). A later batch passed 23/24; its one failure was a new test expecting
an empty string where the existing input emits `undefined`. The corrected test passed
its 1/1 rerun; Organizations' eight unit tests also passed. The final clean batch passed
24/24 tests across five files: composer coverage (3), composer draft (1), AddConnection
(1), NodeFormDialog (11), Organizations (8). These overlap earlier runs and are not a
combined unique-test total. Latest composer/new-test/E2E lint reported zero errors or
warnings; NodeFormDialog lint reported zero errors and its existing duplicate-lookup
`setState`-in-effect warning. Directory browser coverage passed twice; basic creation,
retry and Trash passed; membership passed initially and after its fixes. After the alert-
focus repair, three Person profile and two Person AddConnection browser journeys passed.
Post-composer membership and existing-target AddConnection journeys passed; the new-target
journey timed out after unexpected full-page navigation during a unit-test-file edit.
A Vite reload is a possible cause, not a proven diagnosis. That failed flow passed its
isolated 1/1 replay with file writes paused in
`e2e/test-results/organization-membership-shared-confirm`. Both AddConnection journeys
therefore have passing post-composer evidence across the batch and replay. Only the three
membership-fix captures received the latest main/reviewer visual inspection; replay Person
PNGs do not establish new visual approval. Full web build (`tsc -b` plus Vite) passed after
all composer/focus changes, processing 3308 modules. Existing chunks-above-500kB warnings
remain: MapView 1.036MB, EntityObservatoryGraph 1.419MB and index 1.560MB; no bundle
optimization is claimed. Final `git diff --check` passed. All runs used isolated web
5183/API 4010 and fictional fixtures.

Approved backend repair (2026-09-15): `crm.orgsOverview` and `crm.orgProfile` now use
the same read-only normalization: prefer nonblank `hq_city`, fall back to legacy `city`,
trim display whitespace, and return null if neither is recorded. The response field is
still `city`; stored properties, permissions and write contracts are unchanged. Seven
new integration cases verify canonical precedence, legacy/blank fallback, whitespace,
missing values and unchanged stored properties in both responses. All ten organization/
CRM tests, API typecheck and scoped lint pass on the isolated test setup.
The real browser creation/recovery/Trash journey passed in `organization-city-final`,
including a form-saved HQ shown in the profile and its record returned by city search.
Search-state captures and axe/overflow checks cover 1440, 834 and 390px;
all three city-search captures were inspected by hand. These do not constitute an Organization-detail
design review. Earlier browser attempts exposed a title-only test selector and duplicate
fictional fixtures; selectors and fixture identity/duplicate confirmation were corrected.
Only scratch API 4010 was restarted; no migration or personal-install deployment occurred.
The HQ-city dependency is resolved. This ordinary Living Ledger extension
preserves `PRODUCT.md` and `DESIGN.md` and leaves the absent sidecar absent.

Person complete within the verification bounds below (2026-09-15; earlier evidence retained):

- Relationship editor: implemented cadence/date validation, preservation of saved cadence,
  draft/navigation guard, pending/write locks, observed-update conflict warning, and
  normalization of the null derived contact date rejected by PATCH. Eleven unit tests
  pass. One real save/reload browser journey passes at 1440/834/390px; all nine captures
  in `e2e/test-results/person-relationship-confirmed` were individually inspected.
  The first inspection found and fixed mobile footer overflow. Edge updates still have
  no atomic revision precondition; an unseen cross-client edit remains a backend limit.
- Introduction dialog: implemented guarded/frozen drafts, missing-self states, existing
  introducer selection excluding both participants, and favor-only partial-save recovery.
  The favor retry uses the backend's existing `x-idempotency-key`; the confirmed
  introduction is not reposted. Five unit tests plus the API header transport test pass.
  One real introduction/favor browser journey passes, and all six three-width captures
  in `e2e/test-results/person-introduction-confirmed` were inspected. Generic introduction
  edge creation still lacks idempotency after an unconfirmed first response; copy warns
  to check connections before resubmitting.
- Approved additional backend repair: favor mutations normalize legacy null
  `last_interaction_at`; strength recomputation now omits an absent date. Nine favor/edge
  integration tests pass on `vitae_frontend_unit_20260914`, including legacy data,
  repeat-key deduplication, settlement, retained topics, and recomputation. The final
  regression independently injects legacy null before both add and settle; all twelve
  backend tests passed (favors 3, edges 6, reminders 3), and API typecheck passed.
  The user explicitly approved this repair. Only isolated review API 4010 was restarted
  earlier; no personal-install deployment or port 8080 data write was performed.
- Favor ledger: extracted focused component; stable-key save recovery, draft guard,
  per-row errors and queued settlements, missing-relationship guidance, and 20-row
  disclosure implemented. Four targeted and thirteen Person route tests pass. The real
  lost-response → same-key retry → settle/reload journey passes; all nine captures in
  `e2e/test-results/person-favors-confirmed` were inspected after mobile/text-area fixes.
- Connection editor: replaced the clipped phone popover with a scrollable dialog;
  guarded drafts, validation, observed-conflict protection, property-preserving saves,
  safe initial unlink focus, pending locks and broad named relationship-cache refresh
  are implemented. Thirteen editor/shared-input tests pass.
- Bulk unlink: failed deletes remain selected; failed Undo retries only outstanding
  restores. Selection and confirmation freeze during submission, names appear in the
  confirmation, and the phone bar clears the dock with measured page space. Connections
  use a semantic list with twenty-row disclosure; route changes reset the dossier state.
  Two real-data browser journeys pass in `e2e/test-results/person-connections-final`;
  all twelve three-width editor/unlink/bulk captures were inspected. Eight bulk tests,
  23 shared-overlay tests, and a 75-test shared/Person/Record regression batch pass.
  The shared confirmation now disables Cancel during pending actions, with an explicit
  exception for the unsaved guard's harmless Stay here action.
- Connection editor/unlink/bulk review: the fresh reviewer initially found draft removal
  after write permission was revoked, ghost selection after single unlink, and a raw-label
  mismatch. All three were fixed and scored resolved; disposition **ship** applies only
  to that fix scope, including the twelve valid final connection/bulk recaptures.
- Add connection: draft, pending, read-only and type-switch guards are implemented;
  validation does not send schema defaults. Local errors suppress a duplicate global
  failure toast that covered the phone footer. KNOWS upserts offer no destructive Undo
  that could erase a preexisting relationship. New targets use the full NodeFormDialog,
  with a contextual person seeding a role's subject, instead of invalid empty-props role
  stubs. A link already created by that form is reused/PATCHed rather than POSTed again.
  Existing-target failures retain the draft and warn that the first response may have
  committed. Backend merge semantics are unchanged.
- Final connection browser evidence: all four journeys passed in
  `e2e/test-results/person-connection-review`. The main pass individually inspected all
  21 PNGs: twelve connection/bulk captures at 1440/834/390px, six AddConnection draft and
  recovery captures including 390×600 short-phone recovery, and three New role forms.
  Latest unit checks passed all 36 cases: ConnectionRow states (12, including runtime
  permission revocation), AddConnection states (14), NodeFormDialog (10). Earlier evidence
  includes the passing 32-test AddConnection/NodeFormDialog/EntityPicker batch, 75 shared
  regression tests and 23 overlay tests. These overlapping runs are not a unique-test total.
- Add connection recovery complete: a failed post-save target GET retains the exact saved
  ID and retries that read without reposting the target or link. The contextual full-form
  transition suppresses only its child saved toast through `notifyOnSave`, whose default
  remains true for normal consumers. A unit regression covers role/edge save → GET 503 →
  retry → PATCH of the existing link. All 15 AddConnection, 10 NodeFormDialog and eight
  EntityPicker tests passed in a 40-test batch that also included seven Correspondence
  cases; these overlapping counts are not a unique-test total. Both browser journeys
  passed in `e2e/test-results/person-add-confirmed`; the main pass and fresh reviewer
  individually inspected all twelve captures. The reviewer returned **ship** for
  AddConnection and the contextual role transition only.
- Correspondence complete at sub-surface scope: five native disclosures independently
  reveal twenty rows at a time, with named interaction links, introduction context,
  finite/missing latency distinctions and cached/error/loading retry states. Seven unit
  tests and a 21-test Person/Record regression batch passed. Both browser journeys passed
  in `e2e/test-results/person-correspondence-confirmed`, with all eighteen captures
  individually inspected by the main pass and reviewer. The reviewer requested underlined
  nested anchors; that fix passed both latest journeys within the three-test
  `e2e/test-results/person-evidence-review` run. Main and reviewer individually inspected
  all six introduction/reply-latency recaptures. The follow-up **ship** verdict confirms
  that one fix resolved, not whole-Person completion.
- EntityEvidence complete at sub-surface scope: inline Source details use metadata from
  the existing response. A source `record_id` identifies `source_records`, not a graph
  node; navigation leads to `/data/knowledge`, with no invented individual-record route.
  Twenty-row disclosure resets with the entity, and loading/empty/error/cached retry
  states are explicit. Five unit tests, 19 Person/Record regression tests and 31 Org/Record
  regression tests passed, as did direct web typecheck and scoped lint. The final browser
  journey passed in `e2e/test-results/person-evidence-pane-confirmed`; main and fresh
  reviewer individually inspected all six Source details/cached captures at 1440/834/390px.
  The reviewer returned **ship** for the entire EntityEvidence scope with no fixes.
  Earlier evidence screenshots in `person-evidence-review` and `person-evidence-confirmed`
  used invalid camera positions, not product failures; only `person-evidence-pane-confirmed`
  counts as EntityEvidence visual evidence.
- Profile/action implementation: PersonDetails now supports canonical contact arrays and
  legacy values, mailto/tel links, safe HTTP(S) profile links and birthday year/preference.
  Contact precedes Profile; do-not-contact status appears in the header and details,
  contact targets are 44px, and deletion uses local Banner errors and pending locks.
  Date-offset/invalid-tick repairs and main-action read-only guards are implemented.
  The person NodeFormDialog's unknown-year helper preserves `year_known: false`;
  undated contact history says Date not recorded. Shared form fieldsets use
  `min-inline-size: 0`; connection-composer grids use `minmax(0, …)` with row/label
  wrapping to prevent right clipping. All 52 tests passed in one batch (PersonDetails 3,
  Person.log 12, Person 2, Person states 14, InteractionLogger 11, NodeFormDialog 10).
  The latest batch passed 134 tests (PersonDetails 3, Person.log 12, Person states 15,
  NodeFormDialog 11, EntityForm 85, EntityPicker 8). These overlapping runs are not a
  unique-test total. The earlier 31-test checkpoint's twelve cases were Person.log,
  not InteractionLogger.
- Profile/action browser and review checkpoint: the initial `profile-first` journey
  passed with twelve main-inspected captures. Two confirmed journeys then passed with
  21 main-inspected captures: fifteen top/details/edit/edit-lower/delete and six logger
  views. The fresh reviewer found four material issues: form containment, unknown birth
  year, undated contact history and a two-pixel rule. All were fixed. The first reviewed
  contact journey's new geometric assertion exposed a 1251px composer-row overflow
  despite the fieldset fix; undated and logger journeys passed. Row wrapping and grid
  containment resolved that same finding. All three final journeys passed in
  `e2e/test-results/person-profile-reviewed-final`. Main and reviewer individually
  inspected fifteen final fix captures: profile edit-lower/edit-connections/birthday/
  details at three widths plus three undated views. The reviewer returned **ship** for
  the four resolved fixes only, not whole-Person completion. Both AddConnection browser
  regressions passed in `e2e/test-results/person-form-regression-final` after the shared
  CSS changes; no complete inspection of that run's latest PNGs is claimed here.
- Latest verification: direct web typecheck passed; scoped lint reported zero errors
  and one existing NodeFormDialog duplicate-check effect warning at line 242;
  `git diff --check` passed. Runtime billing read-only behavior is unit-tested; browser
  runs with Cloud disabled do not establish billing read-only coverage. Scratch API 4010
  and web 5183 were used; personal port 8080 was untouched.
- Earlier verification checkpoint retained: direct web typecheck passed; scoped lint reported zero
  errors and one existing NodeFormDialog duplicate-check `setState`-in-effect warning;
  `git diff --check` passed. The additional seven-file frontend regression batch passed
  all 68 tests: unsaved (35), bulk unlink (8), KnowsEditor (1 + 10), Person (2 + 11), and
  Record states (1). These overlap earlier checks and are not a unique-test total.
  Final scoped backend/frontend lint excluding the already documented NodeFormDialog
  warning file returned zero; final `git diff --check` passed.
- Long-record verification: the journey in `e2e/test-results/person-long-confirmed`
  passed. Main and fresh reviewer individually inspected all twelve PNGs; the reviewer
  returned **ship** for the bounded long-record scope. Coverage expands 42 history entries,
  eleven roles and thirty skills, with layout/axe checks at three widths. The 20 → 23
  selection, Clear and Back/reset sequence was exercised at 390px only. A two-row title
  grid prevents different long titles from truncating to an identical visible label.
- Associated dialogs revisited: all five journeys passed in
  `e2e/test-results/person-associated-final`. Main and final reviewer individually
  inspected all 36 captures covering relationship, introduction, favors, connection,
  single unlink and bulk actions after the shared heading/layout changes.
- Integration review: the fresh review found duplicate favor error stacks and an undated
  history/correspondence contradiction. Local `onError` owners now preserve inline errors
  and same-key retry without duplicate global errors. Zero-coverage logic checks supplied
  interactions and empty-state copy describes what was measured. Both integration-fix
  browser journeys passed; main and reviewer individually inspected all fifteen required
  fix captures: six favor recovery/settlement, three profile-undated, three correspondence-
  undated and three empty views. The follow-up **ship** verdict scores those two findings
  resolved only; it is not blanket approval of every file. Every associated surface was
  inspected by the main pass; the final reviewer sampled other ancillary surfaces as
  recorded in the earlier scoped reviews. Both correspondence browser regressions passed
  in `e2e/test-results/person-correspondence-regression-final`; its eighteen new PNGs are
  not claimed as individually inspected.
- Final verification checkpoint: 110 unit tests across fourteen files passed before the
  two integration fixes; 28 tests across three files passed afterward. A CorrespondencePanel
  fixture was corrected from `at: null` to `at: ''`; all eight final tests passed.
  Full `pnpm --filter @vitae/web build` (`tsc -b && vite build`) passed after all corrections,
  processing 3308 modules. Existing warnings remain for chunks above 500kB: MapView about
  1MB, EntityObservatoryGraph about 1.4MB and index about 1.56MB. Compilation/build success
  does not establish bundle optimization. Latest scoped lint passed; the earlier diff check passed.
  Counts across all checkpoints overlap and are not a combined unique-test total.
- Retained limits: runtime billing read-only coverage is unit-only; the existing
  NodeFormDialog effect warning remains documented. Generic POST response-loss idempotency,
  absent atomic edge revision checks and cross-client favor locking remain backend limits.
  The approved favor/snooze repairs are unchanged. No personal port 8080 writes or
  deployments occurred. This ordinary Living Ledger extension preserves `DESIGN.md` and
  `PRODUCT.md`, leaves the absent sidecar absent, and completes only Person's documented
  scope. Other unchecked surfaces remain pending.

People complete: URL-backed search/filter/sort includes profile context, real recent-contact
timestamps and distinct missing-history/cadence states. The legacy `decaying` filter key
is retained with the label To revisit. Twenty-row disclosure bounds rendered rows;
hidden-selection warnings, read-only entry guards and readable phone controls preserve
context. Recoverable moves to Trash name selected people, initially focus Cancel, freeze
selection during requests, block duplicate requests and retain partial failures. The
phone bulk bar clears the bottom dock with measured space. Changes are scoped to People,
its directory styles and minimal BulkNodeDelete/BulkBar safety adjustments.

All 78 unit tests across ten files passed; after the `Date.now` purity fix, all 13 People
tests passed again. Final direct web typecheck passed after the latest changes; targeted
lint reported zero warnings/errors, and final `git diff --check` passed. All four browser
journeys passed in `e2e/test-results/people-confirmed`: real create → detail → filtered
return → Trash → reload; URL sorting and bounded selection; request errors, empty states,
refresh and partial Trash recovery; and three-width visual, axe, focus, header-collision,
dock-clearance and console-error checks. The main pass individually opened all 18 final
captures under
`e2e/test-results/people-confirmed/people-repair-People-direc-d8557-on-form-work-at-three-sizes-chromium/`
(top, lower, sort, selection, confirm and add at 1440/834/390px).

The independent reviewer initially found mobile header collision, bulk-bar/dock overlap
and same-day sorting that ignored timestamps. Its follow-up scored all three resolved
and returned **ship** for that fix scope using 16 `people-reviewed` captures of the same
UI; the final main run added selection checks at every width. Earlier `people-first`
evidence remains historical: four passing journeys and 15 inspected captures preceded
these refinements. The backend still fetches the entire directory: 20-row disclosure is
client rendering, not server pagination. No backend contract changed. This ordinary
Living Ledger extension preserves `DESIGN.md`; the absent sidecar was not created.

Network home complete: People and Organizations lead the directory, Add person opens
the existing guarded form, and four secondary discovery links follow with new-user
guidance. The ruled layout stacks on mobile. Changes are confined to the Network home
component, its WorkspaceHomes re-export and scoped Network styles; other workspace
components are unchanged.

All 13 unit tests passed: WorkspaceHomes (3), NodeFormDialog (10). Final direct web
typecheck passed; targeted lint reported zero warnings/errors; `git diff --check` passed.
All three browser journeys passed in `e2e/test-results/network-home-final`: three-width
page/form top/lower views with keyboard, axe, overflow, focus and console-error checks;
all six destination links and Back; and real person save/reload with the draft guard.
The main pass and fresh reviewer individually inspected all 12 final screenshots under
`e2e/test-results/network-home-final/network-home-repair-Networ-39b30-d-accessible-at-three-sizes-chromium/`;
the reviewer requested only
that `DESIGN.md` stop assigning Network the generic workflow-trace/numbered-lead template.
Its Workspace and screen composition section now records the implemented Network
exception without changing the Living Ledger identity or other workspace rules.
The scoped reviewer confirmation returned **ship**; the design-persistence fix is resolved.

Task templates complete for available capabilities: list, URL-backed search/category
filters (`q`/`kind`), 20-row disclosure, stored-body inspection, create/edit with basic
and advanced JSON modes, and preview/apply with navigation to the created record.
Stable drafts have dismissal guards, pending/read-only states and error retry; edits
preserve revisions and unknown fields. Refinements fixed advanced-mode buttons submitting
their forms, fast category → search changes losing the category, count plurals and the
pending-apply guard prompt.

All 40 final screens unit tests passed, including six new Task templates cases. Another
17 shared checks passed: API (5), routes (9), productivity accessibility (3). Direct
`pnpm --filter @vitae/web exec tsc --noEmit --incremental false` passed; two preceding
standard typecheck processes ended with SIGTERM and no TypeScript diagnostics and are
not counted as passes. Targeted lint reported zero warnings/errors; `git diff --check`
passed. All four browser journeys passed in `e2e/test-results/task-templates-refined`.
The main pass and fresh reviewer individually inspected all 18 final screenshots under
`e2e/test-results/task-templates-refined/task-templates-repair-Task-dc03e-preview-work-at-three-sizes-chromium/`.
The fresh Task templates review returned **ship**, with no fixes. The pinned Living
Ledger identity in `DESIGN.md` remains unchanged.

Task templates backend boundaries: both item and project categories create one task;
they do not create a project or subtasks. The existing apply helper copies only title,
status, due, target, priority, importance, follow_up and project_id. Extra notes,
recurrence and subtasks are not copied, and the UI explains this limit. No delete API
exists; deletion requires separately authorized backend work. No backend behavior changed.

Automation complete for available capabilities: rule list, basic/advanced create/edit,
enable/disable, URL-backed search/state filters and stored-definition details. Basic
conditions are explicit; advanced conditions, actions, sort order and revisions survive
editing. Stable drafts have dismissal guards, exact-operation retry and conflict handling,
with explicit pending, success, error and read-only states.

All 34 screens unit tests passed; web typecheck, targeted lint and `git diff --check`
passed. Five browser journeys are verified across three result directories:
`e2e/test-results/automation-final` covers the three-width visual journey, advanced-editor
guards/exact retry, and filters/conflicts; `e2e/test-results/automation-real-final` covers
real create → edit → disable → reload; `e2e/test-results/automation-states-final` covers
failed versus empty data and refresh retention/recovery. The main pass and fresh reviewer
individually inspected all 15 final visual captures under
`e2e/test-results/automation-final/automation-Automation-list-32628-r-modes-work-at-three-sizes-chromium/`.
The first desktop list capture showed loading and was corrected to wait for content.
A later real-flow test matched an identical old fixture; scoping its selector to the
unique row produced the passing rerun. Earlier failed attempts are not counted as passes.
The fresh Automation review returned **ship**, with no fixes. This ordinary Living Ledger
extension uses the pinned `DESIGN.md`; the reviewer accepted it as sufficient while
This pass does not create or change design files.

Automation boundary: the existing API stores rule definitions but does not execute them.
It exposes no rule deletion command. The frontend makes both limitations explicit;
deletion and execution require separately authorized backend work. No backend contract
has been changed for this screen.

Automation follow-up: the advanced-mode button now explicitly uses `type="button"`;
a create-mode unit assertion verifies that switching modes sends no POST. All five
Automation browser journeys passed in `e2e/test-results/templates-automation-final`,
and the reviewer follow-up returned **ship**. The existing Automation visual evidence
remains applicable because this repair changed behavior without changing appearance.
Three Task templates journeys also passed in that combined run; the fourth exposed
the category/search filter race corrected before the four-pass refined run above.

Analytics complete: URL-backed 30/90/365-day windows and
Activity / Current workload / Connections groups; all ten figures retained. Each figure
has a readable table, optional keyboard-operable comparison, 20-row disclosure and
specific empty state. Durations use readable units; task names load independently with
retry, and related records are linked. Unknown urgency and throughput remain unmeasured,
not zero. Dates, time zone, privacy scope and current-versus-window data are explicit.
The table container now contains its hidden caption: previously the caption could enlarge
the outer document and let lower-chart scrolling move the shell out of view. This is a
scoped Analytics repair, with an outer-scroll regression assertion for every figure.

All 14 final unit tests passed: `analytics-review` (12, including five Review regressions)
and FigureBlock (2). Final web typecheck passed; targeted lint reported zero errors or
warnings; `git diff --check` passed. All four browser journeys passed in
`e2e/test-results/analytics-scroll-final`: all ten figures with keyboard comparisons at
1440/834/390px, axe, row/page overflow and outer-document scrolling checks; URL groups
and windows, load more and record links; failed names, unknown history and refresh
recovery; and real-API 30/90/365-day windows → Waiting → back → Review.
The main pass and fresh reviewer individually inspected all 33 final screenshots under
`e2e/test-results/analytics-scroll-final/analytics-repair-Analytics-41a9b-d-comparison-at-three-sizes-chromium/`.
Initial visual batches led to mobile label stacking, underlined record links and hidden
caption containment to prevent outer-document growth and shell scrolling. Earlier test
selector mismatches were corrected and were not product failures. The fresh reviewer
returned **ship**, with no material fixes. This ordinary extension of the pinned Living
Ledger design leaves `DESIGN.md` unchanged and introduces
no new backend behavior.

Existing backend calculation boundaries, not changed: estimates use all-time sessions
with saved durations; focus time uses full durations of sessions started within the
window (including running sessions at refresh); overdue follow-up counts include every
non-archived task, not just waiting tasks. The UI explains these scopes and does not link
that broader overdue count to a narrower Waiting filter. Archived/missing task names may
remain record IDs because the task read model contains live records only.

Review complete: URL-persisted period, exact API date range
and time zone, explicit rolling seven-day definition, readable recorded durations,
ruled factual summary, and links to Today, follow-ups, Tasks and Analytics. Incomplete
history remains visible even without bullets; a missing summary is not an empty result.
Refresh failures retain existing facts. Current-workspace snapshots are distinguished
from date-window activity; sensitive-record exclusion follows the existing API.
No backend contract or historical aggregation behavior changed.

All eight final `analytics-review.test` unit tests passed (five Review, three Analytics).
Web typecheck passed; targeted lint reported zero warnings or errors;
`git diff --check` passed. All four browser journeys passed in
`e2e/test-results/review-final`: delayed/failed initial load; daily/weekly views at three
widths with axe, overflow and console-error checks; real-API weekly URL reload and
keyboard navigation to Waiting; and unknown/empty history with refresh failure/recovery.
The main pass and fresh reviewer inspected all 12 final screenshots under
`e2e/test-results/review-final/review-Review-daily-and-we-a94f8-tay-readable-at-three-sizes-chromium/`
(daily/weekly × 1440/834/390px × top/lower). Initial visual inspection shortened the
warning and corrected the test's top-scroll capture; all four journeys passed the final
rerun. The fresh Review review returned **ship**, with no material fixes, accepting the
pinned `DESIGN.md` for this ordinary Living Ledger extension without a new identity,
seed or comp. `DESIGN.md` remains unchanged.

Waiting complete: URL-backed title/timing filters, chronological
follow-ups, 20-row disclosure to bound relationship lookups, independent contact errors/retry,
task/contact links, saved-date context, preserved drafts across filters and failed saves,
navigation guard, pending lock and explicit save feedback. No backend changes. A contact
cannot be inferred from a failed lookup; absent and unavailable relationships remain distinct.

All 32 final unit tests passed: screens (29) and productivity accessibility (3). Web
typecheck passed; targeted Waiting and E2E lint reported zero warnings or errors;
`git diff --check` passed. All four browser journeys passed in
`e2e/test-results/waiting-final`: real save → reload, filters/URL state and guarded draft
navigation, lookup failure and same-operation retry, and visual/accessibility checks at
1440, 834 and 390px. Axe, overflow and console-error checks passed. The visual journey
subsequently passed again after correcting the test's asynchronous scroll capture.
All six final screenshots under
`e2e/test-results/waiting-final/waiting-Waiting-keeps-long-5b7ea-ols-readable-at-three-sizes-chromium/`
were inspected, including the recaptured phone lower view with the last form fully visible
above the dock. The fresh full Waiting review returned **ship**, with no material fixes,
accepting the pinned `DESIGN.md` as an ordinary extension without a new seed or comp.
`DESIGN.md` remains unchanged.

Tasks complete: list/matrix hierarchy, capture, URL-backed search/project/saved-view
filters, explicit invalid-view and no-results states, and a person/organization waiting
picker are implemented. Inspector drafts survive background changes and revision
conflicts; dismissal is guarded. Recurrence supports save/removal, retained exceptions
and partial-save retry. Dependencies use a link-only picker with add/remove controls.
Timer loading, failure and start/stop states are explicit. Per-command duplicate guards,
same-operation retry and truthful Undo eligibility preserve the intended operation.

All 41 current unit tests passed: screens (25), API (5), productivity accessibility (3)
and EntityPicker (8). All five browser journeys passed in `e2e/test-results/tasks-final`,
including real capture → recurrence → dependency → timer → reload → waiting → Undo →
complete → reload. Eighteen final screenshots under
`e2e/test-results/tasks-final/tasks-repair-Tasks-list-ma-43900-emain-usable-at-three-sizes-chromium/`
cover 1440, 834 and 390px. The main pass inspected all surfaces and final repaired overlays
and long content; the reviewer inspected all 18 screenshots. Axe, overflow, keyboard,
focus and console-error checks passed. Final web typecheck passed; lint reported zero
errors and one warning for the guarded one-shot async-record draft hydration effect.
`git diff --check` passed. The fresh review found impossible Undo, an app-dialog Archivo
typeface and a red left stripe; all were fixed. The final disposition was **ship**, with
no material regression, explicitly scoped to that fix batch. Additional routes (9),
Analytics/Review (4) and Shell (17) regression checks passed: 71 relevant checks in total.
This ordinary Living Ledger extension preserves `DESIGN.md` unchanged.

Task backend boundaries: update_task accepts optional values, not nullable/reset fields,
so clearing a stored date/priority/importance cannot be silently supported. The editor
blocks that misleading save with a specific explanation. Stored recurrence intentionally
does not spawn occurrences on completion (existing FR-PROD-005). No new backend behavior
is introduced. “Defer” is reviewed through Target date; no standalone defer command exists.

Ledger complete: the existing paper/graphite Living Ledger register now pairs local
date/time margins with readable action and subject, revision/source metadata, and
disclosures of every supplied changed field. Long titles and field names wrap; phone
rows move the time above the subject and retain accessible disclosure targets.
Before/after values remain in record history. URL-backed search, action and entry-type
filters explicitly cover loaded entries, with shown/loaded counts and clear-filter
recovery. Infinite-query pagination uses the response's real cursor, deduplicates IDs,
prevents overlapping loads, and preserves loaded pages on refresh or pagination errors.

Thirteen Ledger unit tests passed the final rerun; web typecheck passed. Targeted lint
reported no errors; its one spacing warning was subsequently fixed. All eight browser
journeys passed across `e2e/test-results/ledger-review` (seven passes) and
`e2e/test-results/ledger-record-history-final` (the real Capture → Ledger → Record History
journey). The latter rerun corrected an old selector matching a hidden Edited option;
the earlier failed attempt is retained as evidence and is not counted as a pass.
Coverage includes the Los Angeles local-date boundary, retries, loading and empty
states, filters after reload, full field disclosures, and record history navigation.
All six screenshots in
`e2e/test-results/ledger-review/ledger-Ledger-keeps-long-r-70fe6--readable-at-every-viewport-chromium/`
were individually inspected, covering initial and later content at 1440, 834 and 390px.
All three viewport checks passed axe and overflow checks with no console/runtime errors.
The fresh reviewer returned **ship**, with no material fixes, accepting the existing
`DESIGN.md` plus the Ledger extension direction without a new comp or design seed.
This ordinary extension preserves `DESIGN.md` unchanged.

Known backend dependency: the existing ledger cursor contains only a timestamp.
Revisions tied at a page boundary can be skipped by the API's strict timestamp
comparison. A timestamp-plus-ID cursor requires a backend contract repair beyond the
approved snooze change; the Ledger API contract remains unchanged.

Planner complete: all future reminders now use the existing shared all-reminders query;
task/date snapshot limits are disclosed with full-list navigation. URL-backed type
filters, exact-date grouping, malformed-date recovery, missing-subject safety and
responsive two-line rows implemented. Partial failures retain available records.
Eleven Planner unit tests and 17 Shell tests passed; all four browser journeys passed
across `planner-completion` and the corrected `planner-visual-final` rerun. Desktop,
tablet and phone screenshots including long titles and malformed dates inspected;
axe scans passed and no console/runtime errors were observed in the populated journey.
One shared-header regression checked Today and Planner at seven widths (1440 through
390); current location is readable and utilities do not overlap search. Reminder badge
now correctly says open, not due. Web typecheck and targeted lint passed.
Earlier concurrent runs encountered severe host memory/swap pressure and timeouts;
they were rerun sequentially and were not counted as passes.
No Planner backend contract was expanded: dashboard still caps tasks/dates at six.

Sequential completion checklist (secondary surfaces belong to their parent and are
reviewed individually before moving on):

- [x] Sign-in; signup, splash, unavailable provider, provider failure, account failure.
- [x] Shell; rail, workspace strip, mobile dock, More, route focus, access restrictions.
- [x] First run; setup steps and dismissal.
- [x] Capture; parsing, preview, correction, save and retry.
- [x] Structured new; entity menu and each schema-backed entity form.
- [x] Quick switcher; search, commands, keyboard navigation and no results.
- [x] Reminders; Capture entry, complete, reopen, snooze and drawer dismissal. No edit endpoint exists.
- [x] Appearance; persisted light/dark/high-contrast and system preference.
- [x] Toasts and unsaved-change confirmation; pending Undo, failure and focus return.
- [x] Today; queue, habits, reconnect/logger, momentum, onboarding and summary.
- [x] Planner.
- [x] Ledger; filters, revisions and record navigation.
- [x] Tasks; list, matrix, filters, detail, timer, defer, waiting and conflicts.
- [x] Waiting.
- [x] Review; daily and weekly.
- [x] Analytics.
- [x] Automation; available list, create/edit, enable/disable, conflicts and recovery verified. Delete unavailable; separate backend authority required.
- [x] Task templates; available list, create/edit, preview/apply and recovery verified. Delete unavailable; separate backend authority required.
- [x] Network home.
- [x] People; filters, selection and bulk archive.
- [x] Person; profile, evidence, interactions, relationships, edit and archive, within documented verification bounds.
- [x] Organizations; directory, search/sort and create reviewed within documented bounds.
  Approved HQ city display/search repair verified through API tests and a real form save.
  Post-composer shared regressions passed across the batch and isolated
  replay described above. `/orgs` remains supported.
- [x] Organization; sections, relationships, edit and archive within documented verification bounds.
- [x] Who to contact; query, rankings, explanations, composer and logging within documented verification bounds.
- [x] Warm paths; target selection, paths, evidence and composer within documented verification bounds.
- [x] Correspondence; filters and reactivation actions within documented verification bounds.
- [ ] Career overview.
- [ ] Applications; filters, runway and create.
- [ ] Application detail; status, interviews, referrers and related records.
- [ ] Dossiers; list and create.
- [ ] Dossier editor; audience, entries, conflicts, appendix and delete.
- [ ] Résumé hub.
- [ ] Evidence; filters, create, edit and archive.
- [ ] Tailor; job description, selection, wording, preview, save and compile.
- [ ] Outputs; preview, download, failure and archive.
- [ ] Letters; create, edit, compile and archive.
- [ ] Templates; edit, defaults and archive.
- [ ] Explore home.
- [ ] Library; types, query, saved views and bulk actions.
- [ ] Search results; filters, URL state and recovery.
- [ ] Generic record; each entity type, fields, sensitive values, revisions and archive.
- [ ] Connections; each relationship descriptor, endpoint selection, edit and unlink.
- [ ] Life map; search, toolbar, preferences, inspector, discovery and pathfinder.
- [ ] Chronograph; toolbar, canvas/list, selection, preferences and review.
- [ ] Atlas; filters, map/list, place details, comparison and unresolved places.
- [ ] Data home.
- [ ] Imports; source selection, staging, proposal diff, commit, discard and rollback.
- [ ] Knowledge review; assertions, evidence, conflicts and decisions.
- [ ] Identity audit; candidates, merge preview, partial failures and confirmation.
- [ ] GitHub source; connection, import and recovery.
- [ ] Gemini source; configuration, connection state and disconnect.
- [ ] Exports; options, pending, download and recovery.
- [ ] Trash; selection, restore and permanent deletion.
- [ ] Settings home.
- [ ] Profile; owner, aliases and draft recovery.
- [ ] Preferences; ranking, appearance and draft recovery.
- [ ] System; health and configuration states.
- [ ] Billing and access; feature gate, read-only, checkout and recovery.
- [ ] Help; shortcuts and navigation.
- [ ] Landing.
- [ ] How it works.
- [ ] Warm paths product page.
- [ ] Career evidence product page.
- [ ] Pricing.
- [ ] Security and ownership.
- [ ] Tour; tabs and captures.
- [ ] Manifesto.
- [ ] Resources.
- [ ] Guides index and every supported article.
- [ ] Changelog.
- [ ] Terms, privacy, DPA and subprocessors, each separately.
- [ ] Status.
- [ ] Documentation; index, article, search, command palette, diagrams and print.
- [ ] Entity reference; catalog, matrix, atlas, observatory and print.
- [ ] Not found; public and authenticated recovery.
- [ ] Compatibility routes and cross-application regression journeys.

Today completion: agenda-first responsive layout, explicit Planner action, full-length
record titles, recoverable background-refresh errors, and a compact/restorable setup
checklist. Habits serialize writes through refresh and roll back only their own fields;
older Undo actions do not invert an already restored habit. Reconnect logging now has
multiline notes, draft protection, pending locks, validation recovery and exact-payload
idempotent retry after an unconfirmed save. Summary uses evidence terminology, honest
zero-data states and discoverable application navigation. Shared dialogs have a focusable
scrolling region and skip disabled controls when choosing initial focus.
Verification: 35 Today/setup/logger/queue unit tests, 22 shared-overlay tests, web
typecheck, 13 Chromium Today/logger journeys and four shared-dialog/history regressions
passed. Desktop/tablet/phone captures (1440/834/390) including long titles, summary,
multiline logger and unconfirmed save inspected. Browser axe checks passed; the long-data
journey recorded no console/runtime errors. Evidence: `e2e/test-results/today-completion/`
and `e2e/test-results/today-shared-regression/`. Read-only behavior covered in unit tests;
cloud account/payment gates were not live-tested on the local scratch stack.
Remaining backend dependency: habit endpoint is a toggle, not an idempotent desired-state
write. Exact-once behavior after a lost response or simultaneous cross-device changes
requires a backend contract change; this frontend serializes same-screen actions only.
Snooze regression rerun: all nine isolated API/service tests passed.
Logger follow-up refinement: the existing DELETE interaction endpoint retains its
follow-up reminder. The form and success message now state that Undo removes only
the interaction. Eleven logger unit tests and both logger browser journeys passed
again in `e2e/test-results/logger-follow-up-final/`, including one real follow-up,
lost-response retry, uniqueness, soft-delete Undo and retained-reminder verification.
An atomic Undo that also removes follow-ups would require a separately authorized
backend change; only the approved snooze backend repair was added in this pass.

Verification record: Sign-in unit/axe 14 passed; Chromium browser checks 7 passed
(six on initial run, three-viewport test passed on rerun after allowing 60 seconds
for its three navigation/axe/capture passes). Source desktop/mobile images inspected.
Browser screenshots: `e2e/test-results/signin-sign-in-stays-visib-4714f-ne-tablet-and-desktop-sizes-chromium/`.
Sign-in copy now matches local owner versus Google versus developer access; no backend
authentication behavior changed. Baseline Today/queue/routing Vitest: 26 passed.
Shell/shared controls: 65 UI and 34 web tests passed; web typecheck passed.
First run: unit and browser dismissal/persistence/axe checks passed; captures at
1440/834/390 saved under `.review/first-run/`.
Shell browser: seven journeys passed across initial run and focused mobile rerun.
Rendered widths 1440/834/390 reviewed; fixed mobile 72px content collapse, sidebar
theme contrast, capture-slot overlap and low-contrast workspace labels. Added
mobile stage-width and capture alignment regressions. Artifacts: `.review/shell/`
and `e2e/test-results/shell-mobile-review/`. No runtime errors in capture session.
Known initial risk: Today habit requests permit repeated activation and roll back
the whole cached dashboard on error. Initial global typecheck identified `listLabel`
on ComboboxItem instead of ComboboxProps; corrected during the shared-controls pass.

Capture: five unit tests and three desktop/mobile browser journeys passed; visible
save/cancel actions, pending input lock, draft guard, and normal Tab navigation.
Captures: `.review/capture/`. Final shared-dialog focus regression pending.

Structured forms, active: all 36 canonical types remain in New (catalog unit test).
The form suite plus Capture passed 171 checks; 12 focused dialog/journal checks passed
after adding partial-save recovery. Web typecheck passed after correcting test-only
Testing Library options. Five form browser journeys passed; the new mobile guard
test revealed shared destructive-button contrast and focus-return defects, now under
retest. Screenshots at 1440/834/390 in `.review/entity-form/` show the repaired
single-column phone layout and scalar suggestion fields without nested borders.
Save now retains the created node ID and a journal of completed connection mutations,
locks the submitted draft, and explains partial saves honestly. Endpoint changes
replace their connection instead of silently retaining the old target.

Backend dependency: node and edge writes are separate requests, not a transaction.
The frontend can resume acknowledged writes within an open form; exact-once recovery
after a lost successful response or a browser restart requires server idempotency
keys/transactional save support. No backend contract was changed in this pass.

Structured forms completion: all 36 forms opened sequentially, captured at desktop
and phone widths, checked for horizontal overflow and reachable submit controls,
axe-scanned and dismissed without false dirty warnings. Final catalog run passed
under `e2e/test-results/entity-form-catalog-final/`; seven behavioral browser journeys
passed under `e2e/test-results/entity-form-behavior-verified/`, including a real node
save followed by a simulated edge failure and successful retry without duplication.
All 36 mobile catalog captures individually inspected; desktop/tablet representative
captures inspected. New menu now wraps and scrolls within the viewport; wide entity
type catalogs use a compact dropdown. Shared dialog regression: four Capture/first-run
journeys passed; 44 UI checks passed. Final web forms/picker suite: 178 passed, followed
by 17 focused checks including the compact picker; 23 core descriptor/subject tests
and web typecheck passed. Lint has no errors; two existing-style state-in-effect
warnings remain in self-defaulting and duplicate hint reset. Browser runs interrupted
by process exit 143 or server unavailability were rerun, not counted as passes.

Final money-field refinement: recurring billing periods no longer squeeze amounts
to a few pixels. Phone entry/period selection/axe browser check passed with inspected
capture in `e2e/test-results/money-field-verified/`; eight UI form tests passed.

Quick switcher: stale-query hits removed immediately, empty-list arrow bounds fixed,
IME confirmation ignored, explicit retry added and data-space switching moved below
everyday commands. Thirteen unit/command checks and five browser checks passed;
desktop/tablet/phone captures in `.review/switcher/`, mobile inspected.
Browser evidence: `e2e/test-results/switcher-final/`.

Reminders: full notes wrap on phones; accessible named drawer, explicit seven-day
snooze label, write-access gating, pending locks through cache refresh and Capture
entry. Five browser checks passed in `e2e/test-results/reminders-resumed/`, covering
Done → Undo, mobile long notes/axe, Escape/focus, empty → Capture and error → Retry.
Five reminder unit tests and 16 shell checks passed. Mobile populated capture inspected.
No independent reminder-edit endpoint exists; creation remains Capture/interaction logging.
User approved the snooze backend repair on 2026-09-14. Drawer and Today now share a
read-time resolver for expired snoozes: effective status becomes open on the user's
calendar date, without GET-side mutations or a scheduler. Stored snooze metadata is
retained until an explicit action; Reopen clears it. Nine API/unit tests passed against
the isolated `vitae_frontend_unit_20260914` database, including due-date boundary,
timezone, future snooze exclusion, Done/Reopen, data-space isolation and Today.
API and web typechecks passed; restarted scratch API and inspected reminder/Today
at three widths with no overflow, alerts or console/runtime errors.

Appearance: explicit choices matching an inferred theme now persist; System is
available to restore device tracking. Active selection and keyboard focus use
strong foreground contrast rather than the decorative accent. Forty-two UI and
21 web unit checks passed (final Shell rerun: 16 passed without act warnings).
Three browser journeys passed in `e2e/test-results/appearance-final/`, including
reload persistence, OS/high-contrast precedence, keyboard navigation/focus return,
nine theme/viewport captures and Capture axe regressions in each theme. Desktop
light, phone dark and tablet/phone high-contrast images inspected. Web tsc passed.

Feedback: Undo waits for asynchronous completion, rejects duplicate clicks, retains
failed actions for retry, and keeps in-flight items through notification bursts.
Phone notifications clear the navigation dock. Fifty-two UI and 44 web checks passed.
Three browser journeys passed in `e2e/test-results/feedback-verified/` (slow Undo →
failure → retry; browser Back/Forward keep/discard; navigation while saving).
Four shared form/palette regressions passed in `e2e/test-results/unsaved-focus-final/`.
Popstate now uses a pre-router dispatcher and restores indexed history without
destroying Forward entries. Navigation Discard closes the form; delayed overlay
focus restoration no longer steals destination focus. Pending writes cannot be
discarded. Error toast captures at three widths and nested confirmation inspected.
Web tsc passed. One pre-existing React act/suspense warning remains in QuickAdd's
unit test; browser journeys show no equivalent runtime problem.
Additional shell regression: search no longer overlaps utilities at 1280px. Seven
intermediate widths passed in `e2e/test-results/shell-width-regression/`.


| Scope                              | Authority                                              | Completion rule                                                                                         |
| ---------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| Canonical and compatibility routes | `apps/web/src/App.tsx`, `apps/web/src/app/routes.ts`   | Route, alias, title, navigation, states, and breakpoint evidence are recorded.                          |
| Public/auth/docs/reference routes  | `apps/web/src/App.tsx`                                 | Public claims and auth-state evidence are recorded.                                                     |
| Entity and relationship types      | `packages/core/src/schema/bundle.ts`                   | Form, serialization, dossier, relationship, destructive-path, and state evidence are recorded per type. |
| Shared overlays                    | `packages/ui/src/overlay.tsx`, `apps/web/src/features` | Focus, dismissal, layering, error, and mobile evidence are recorded per overlay.                        |

## Status vocabulary

- **planned** — catalogued, not yet changed.
- **implemented** — code exists, but the focused completion gate is pending.
- **verified** — focused tests and the required rendered check have passed.
- **blocked** — an unavailable capability prevents an honest implementation; record the recovery state and owner.

## Completion records

| ID                                   | Family               | Canonical route / owner                                                                | Primary task                                                                    | Variants / dependent regions                                                                                  | Implemented | Verified evidence                                                                                         | Open defects                                                                                        |
| ------------------------------------ | -------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `foundation.combobox`                | shared primitive     | `packages/ui/src/combobox.tsx`                                                         | Choose a suggested record without losing keyboard or nested-overlay behavior    | loading, empty, error, disabled, create option, popover layering, chip-field and map composition              | yes         | Combobox (43); EntityPicker (6); SuggestTextInput (9); SuggestTagInput (10); GraphSearch (10)             | Entity, scalar, tag, and map searches migrated. Browser nesting confirmation remains.               |
| `foundation.toast`                   | global feedback      | `apps/web/src/features/Toast.tsx`                                                      | Report a completed, failed, or reversible operation                             | status, success, error, queued Undo                                                                           | yes         | `apps/web/src/features/Toast.test.tsx` (9 cases)                                                          | Audit individual mutation call sites for success vocabulary.                                        |
| `foundation.confirm-focus`           | shared overlay       | `packages/ui/src/overlay.tsx`                                                          | Confirm an irreversible operation without surprising focus placement            | confirm focus; safe cancel focus for unsaved work                                                             | yes         | `packages/ui/src/overlay.test.tsx`; `apps/web/src/lib/unsaved-changes.test.tsx`                           | Migrate any remaining bespoke confirmation surfaces.                                                |
| `global.new-entity-area-opportunity` | creation and library | `apps/web/src/features/forms/NewEntityMenu.tsx`; `apps/web/src/routes/Collections.tsx` | Find and create an Area or Opportunity                                          | desktop menu, mobile menu, Library type register                                                              | yes         | `NewEntityMenu.test.ts`; `Collections.test.ts`                                                            | Add browser create/serialize/reload coverage in the entity matrix.                                  |
| `global.shell-and-commands`          | authenticated shell  | shell, capture, switcher, reminders, appearance, and global feedback                   | Navigate, switch context, capture work, and recover from global feedback        | rail/dock, named More sheet, route focus/live title, command Home/End, named mutation feedback, themes        | yes         | shell/command overlay gate (26); Toast (9); NewEntity (2)                                                 | Wide/tablet/phone and nested-overlay browser walkthrough remains part of the shell gate.            |
| `global.record-and-bulk-delete`      | generic records      | `/n/:id`, Record dossier, and bulk node delete                                         | Inspect a record and safely archive one or many records                         | provenance/revisions, retryable archive failure, partial failure, sensitive reveal/redaction, selection       | yes         | Record dossier/recovery/privacy suite (19); `BulkNodeDelete.states.test.tsx` (8)                          | Per-entity browser create/edit/delete/restore matrix remains open.                                  |
| `global.relationship-matrix`         | relationships        | edge descriptors, connection picker, and `/api/v1/edges`                               | Form a valid, intelligible relationship without accepting an invalid endpoint   | all 36 edge types, directional picker labels, duplicate folding, invalid-pair rejection                       | yes         | core descriptor/connection suite (24); edge API integration (6)                                           | Per-type browser/mobile edit and unlink paths remain open.                                          |
| `global.structured-fields`           | generic forms        | `FieldRenderer`, shared form controls, and Record dossier                              | Enter and read lists, money, and structured properties without storage syntax   | named amount/currency/period and list rows, object-list removal, nested credential redaction                  | yes         | `FieldRenderer.test.tsx` and Record display/privacy tests (25 focused cases); `@vitae/ui` (276)           | Browser/tablet/mobile rendering confirmation remains part of the entity matrix.                     |
| `global.date-bearing-entities`       | generic forms        | `EntityForm` and `NodeFormDialog`                                                      | Record truthful date spans and precision without timezone distortion            | day/month/year precision, open spans, reversed-span recovery, edit rehydration                                | yes         | EntityForm and NodeFormDialog suite (55); web typecheck                                                   | Browser/tablet/mobile formatting confirmation remains part of the entity matrix.                    |
| `global.entity-create-matrix`        | entities             | `EntityForm`                                                                           | Create every shipped entity type with a truthful descriptor-required payload    | all 36 node types, required field fixtures, title naming, subject ownership isolated as connection draft      | yes         | EntityForm parameterized create matrix (37 cases)                                                         | Optional field fill, edit/reload, relationships, deletion/restore, and browser matrix remain open.  |
| `auth.sign-in`                       | auth                 | `/signin`, `/signup` · `apps/web/src/routes/SignIn.tsx`                                | Choose the configured sign-in method and recover from failure                   | Google, developer, local owner, no provider, pending auth, provider error, workspace error, Cloud signup      | yes         | `SignIn.test.tsx` (14 cases); `e2e/tests/signin.spec.ts` Chromium wide/phone/splash/failure paths         | The local browser bridge was unavailable; Playwright provides the rendered evidence for this slice. |
| `today.agenda`                       | Today                | `/today` · `apps/web/src/routes/Dashboard.tsx`                                         | See what needs attention now and complete a reminder                            | loading, error/retry, empty, singular/plural queue, habits, reconnect, partial knowledge payload, Undo        | yes         | `Dashboard.test.tsx` (9 cases); `Dashboard.queue.test.ts` (8 cases); source-level formatting and UI audit | Browser desktop/tablet/phone confirmation remains part of the family gate.                          |
| `today.tasks`                        | Today / productivity | `/today/tasks` · `apps/web/src/features/productivity/TasksScreen.tsx`                  | Capture, prioritize, complete, defer, and inspect a task                        | list/matrix, saved view/project filter, lock, conflict, retryable wait dialog, Undo, detail sheet, timer      | yes         | screens (16); component axe (3); routes (9); productivity E2E axe added, flag-gated locally               | Run the E2E axe path with productivity flags enabled.                                               |
| `today.planner`                      | Today / productivity | `/today/planner` · `apps/web/src/routes/workspaces/Planner.tsx`                        | Review reminders, tasks, and dated evidence in their time order                 | loading, error/retry, empty, populated ledger, missing optional dashboard collections                         | yes         | `Planner.test.tsx` (5 cases); source-level formatting and UI audit                                        | Browser desktop/tablet/phone confirmation remains part of the family gate.                          |
| `today.productivity-aux`             | Today / productivity | `/today/waiting`, `/today/review`, `/today/analytics`, rules and templates             | Follow up, review facts, understand measured work, and manage recurring work    | loading/error/empty, daily/weekly, sparse history, lock/conflict, automation and templates                    | yes         | productivity suite (43) plus automation failed-create draft recovery (15)                                 | Browser desktop/tablet/phone confirmation remains part of the family gate.                          |
| `network.directories`                | Network              | `/network`, `/network/people`, `/network/organizations`                                | Orient, browse relationship records, filter people, and select bulk actions     | loading/error/empty/populated, filters and URL state, bulk selection, delete confirmation, axe                | yes         | `WorkspaceHomes.test.tsx` (1); People (5) + axe (2); Organizations (3) + axe (2)                          | Browser desktop/tablet/phone confirmation remains part of the family gate.                          |
| `network.contact-intelligence`       | Network              | `/network/intelligence?lens=contact` · `apps/web/src/routes/Ask.tsx`                   | Ask a concrete question and inspect ranking evidence                            | URL/history/repeat ranking, recovery, factors, expanded context, guarded composer and outreach logger       | yes         | 58 distinct unit cases across overlapping runs; final Ask 28/28; ranking/composer/recovery and controls browser evidence above; scoped reviewer fixes resolved | Chromium responsive only; read-only unit-only; history city dedup and non-idempotent composer logging limits documented above. |
| `network.warm-paths`                 | Network              | `/network/intelligence?lens=reach` · `apps/web/src/routes/Intros.tsx`                  | Select an organization, inspect a path, and ask the best opener                 | Destination rail, ranked evidence, explicit draft request, URL/history/filter recovery, state handling, composer | yes      | Complete within bounds: 20 focused units; one three-width Chromium/Axe journey; 11 intros and one composer-consumer Chromium cases; bounded reviewer ship | Chromium responsive emulation only; composer does not send and logging remains non-idempotent. |
| `network.person-dossier`             | Network              | `/network/people/:id` · `apps/web/src/routes/Person.tsx`                               | Understand a relationship record and act with its supporting evidence           | profile degradation, interactions, connections, archive retry, stale refused-link clearance, safe focus       | yes         | Person/Organization/connection recovery gate (34)                                                         | Expand per-overlay browser coverage.                                                                |
| `network.organization-dossier`       | Network              | `/network/organizations/:id` · `apps/web/src/routes/Org.tsx`                           | Inspect organization context and safely archive it when appropriate             | dossier evidence, destructive confirmation, error recovery, focus restoration                                 | yes         | `Org.test.tsx` and `Org.states.test.tsx` (10 cases)                                                       | Browser desktop/tablet/phone confirmation remains part of the family gate.                          |
| `network.correspondence-and-links`   | Network              | `/network/correspondence`; shared interaction logging and connection overlays           | Reactivate a tie and safely log, connect, edit, or unlink relationship evidence | Reactivation filters/recovery, priority evidence, balance/brokers, logger handoff; shared overlay states     | yes         | Correspondence screen complete: states 4/4, existing Chromium/axe 4/4, dedicated 1440/390 journey, scoped reviewer ship; prior logger/connection evidence retained above | Screen-only completion; other overlay consumers keep their scoped status. Chromium emulation only; client filters preserve rollup and logging retains uncertain-save/non-idempotency limits. |
| `career.applications`                | Career               | `/career`, `/career/applications`, `/career/applications/:id`                          | Move from opportunity to a clear next move and evidence-backed status           | loading/error/empty/filtered-empty, runway, outcomes, dossier, status correction recovery, Job Posting fields | yes         | CareerOverview (5); ApplicationDossier (3); ApplicationStatusControl (12); NodeFormDialog (7)             | Browser desktop/tablet/phone confirmation remains part of the family gate.                          |
| `career.dossiers`                    | Career               | `/career/dossiers`, `/career/dossiers/:id`                                             | Assemble evidence into a revision-safe dossier                                  | self-owner readiness, audience, entry grammar, conflict, deletion, appendix, axe                              | yes         | `Dossiers.test.tsx` (6); `Dossiers.states.test.tsx` (5); `DossierEditor` (16)                             | Browser desktop/tablet/phone confirmation remains part of the family gate.                          |
| `career.resume-artifacts`            | Career               | atoms, outputs, letters, templates, and tailoring routes                               | Curate evidence, compile a document, and recover honestly from compiler state   | filtering, create/edit/archive, autosave sequencing, archive/default retry, compiler/finalization retry       | yes         | Atoms (12); Outputs/Letters/Tailor/Preview recovery gate (37); reduced-motion SelectionPane (10)          | Browser desktop/tablet/phone confirmation remains part of the family gate.                          |
| `explore.graph`                      | Explore              | `/explore/graph` · graph canvas, toolbar, search, preferences, peek, pathfinder        | Explore records and paths without concealing evidence or interaction state      | loading/error/empty, pressed map controls, labelled groups, search, inspector, alternate path origin          | yes         | graph canvas/search/pathfinder/peek gate (35); migrated GraphSearch suite (10)                            | Browser desktop/tablet/phone confirmation remains part of the family gate.                          |
| `explore.library-search`             | Explore              | `/explore/library` and `/search`                                                       | Search and narrow record results with shareable, recoverable URL state          | grammar, type register, saved views, loading/error/empty, `q` and `kind` URL state                            | yes         | Search Results (20); Collections (15)                                                                     | Browser desktop/tablet/phone confirmation remains part of the family gate.                          |
| `explore.timeline`                   | Explore              | `/explore/timeline` · timeline canvas, list, toolbar, review                           | Understand date-bearing evidence through a navigable timeline or readable list  | loading/error/empty, keyboard selection, named zoom/lane controls, Popover preferences, brushed review        | yes         | timeline focused suite: 27 cases; timeline/map integration confirmation (26)                              | Browser desktop/tablet/phone confirmation remains part of the family gate.                          |
| `explore.atlas`                      | Explore              | `/explore/map` · atlas canvas, toolbar, dossiers, comparison, place resolution         | Explore location evidence and resolve incomplete place records                  | tile degradation/total failure, filters, dossiers, comparison, unmapped, save failure, stale city/trip links  | yes         | Atlas focused suite (30); Atlas stale-link recovery (2); Chronograph/entity suite (28)                    | Browser desktop/tablet/phone confirmation remains part of the family gate.                          |
| `data.import-and-trash`              | Data                 | import hub, proposal diff, export, Gemini, Knowledge, duplicates, and `/data/trash`    | Stage, export, review, merge, and recover records without obscuring mutations   | source readiness, confirmed discard/rollback retry, protected edits, alias removal, partial merge lock, purge | yes         | destructive recovery gate (21); proposal/export/Gemini (18); Knowledge/Duplicates (8); merge audit (6)    | Browser desktop/tablet/phone confirmation remains part of the family gate.                          |
| `settings.profile-and-health`        | Settings             | `/settings`, billing, and authenticated recovery                                       | Maintain profile, preferences, ranking, aliases, health, subscription, recovery | loading/error/retry, retained draft/save-again, aliases, held ranking save, health, billing period            | yes         | Settings/Billing recovery and axe gate (29); route compatibility assertions                               | Cloud billing browser confirmation remains owned by `e2e/cloud/billing.spec.ts`.                    |
| `public.marketing`                   | Public               | marketing routes, guides, legal pages, and public chrome                               | Explain Vitae accurately and offer accessible public navigation                 | landing, tour, pricing, manifesto, guides, invalid-route recovery, content truth, skip navigation             | yes         | marketing suite (19); public guide/unknown-document recovery suite (13)                                   | Browser desktop/tablet/phone confirmation remains part of the public release gate.                  |
| `docs.app-and-reference`             | Docs                 | docs routes, search, command palette, generated reference                              | Find, read, and deep-link factual product documentation                         | loading/error/retry/replaced/unmatched, search/facets, command navigation, diagrams, print, generated rows    | yes         | docs focused suite: 190 cases; recovery state (26); print contract (2)                                    | Browser print and breakpoint confirmation remain part of the documentation gate.                    |
| `reference.catalog-observatory`      | Reference            | entity catalog, atlas, matrix, and observatory                                         | Explore typed entities and directed relationships without inaccessible gaps     | catalog states, export/import rejection, print atlas, matrix navigation, focus restoration                    | yes         | catalog and observatory state/model suites; matrix updated for 37 schema entity types                     | One existing React `act` harness warning remains outside product runtime behavior.                  |

## Next records to open

1. Migrate `SuggestTagInput` and graph search separately after their existing state suites pass against the shared primitive.
2. Verify EntityPicker and SuggestTextInput inside nested Sheets at desktop and coarse-pointer sizes in the browser suite.
3. Add focused browser wide/tablet/phone evidence for the Today family, then open the Network family.
