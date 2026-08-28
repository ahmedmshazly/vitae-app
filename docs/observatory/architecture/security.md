---
id: ARC-SECURITY
title: Trust boundaries and data handling
summary: The six routes that answer without a session and why, the default-deny gate, the sanitisation layers, and the gaps that are known rather than closed.
audience: [security, maintainer, operator]
domain: architecture
type: explanation
status: verified
verified_at: 2026-08-24
sources:
  - apps/api/src/app.ts
  - apps/api/src/middleware/auth.ts
  - apps/api/src/middleware/security.ts
  - apps/api/src/middleware/health.ts
  - apps/api/src/middleware/error.ts
  - apps/api/src/routes/v1/auth.ts
  - apps/api/src/routes/v1/docs.ts
  - apps/api/src/routes/v1/docs.integration.test.ts
  - apps/api/src/routes/webhooks/paddle.ts
  - apps/api/src/cloud/paddle.ts
  - apps/api/src/services/secrets.ts
  - apps/api/src/services/storage/cloudinary.ts
  - apps/api/src/services/export.ts
  - packages/config/src/env.ts
  - packages/core/src/algorithms/latex-escape.ts
  - services/buildsvc/src/server.ts
  - services/buildsvc/Dockerfile
  - docs/generated/api.json
  - docs/ARCHITECTURE.md
requirements: [FR-004, FR-012, FR-015, FR-027, FR-SET-001, FR-SET-007, FR-RES-012, INT-1]
related: [ARC-REQUEST, ARC-CLOUD, ARC-PERSISTENCE, ARC-RESUME]
---

# Trust boundaries and data handling

## In short

Vitae denies by default. Every route under the API prefix requires a verified
identity, and the six routes that answer without one do so for reasons you can
check individually. Three of those six sit outside the gate because of where
they are registered in the middleware stack, not because anything declares them
public - a distinction that matters, because the list that *looks* like the
declaration of public routes contains an entry it cannot actually govern.

Beyond the gate, the system has four other places where untrusted data crosses
a boundary: text on its way into a LaTeX document, a payment provider's webhook
on its way in, an uploaded file on its way to object storage, and a person's
graph on its way out through an export. Each has its own rule, and this page
states all four.

## How it works

The gate is one middleware mounted at the API prefix. It resolves a token -
either the local development session or a Google identity token - and then
applies an authorisation rule that depends on the mode: a self-hosted install
compares the verified email against the configured owner, and a hosted install
accepts any verified identity and lets workspace membership decide what it can
reach. Refusals are neutral: the message never reveals what would have been
accepted.

Everything registered *above* that middleware answers without a session. That is
a property of position, and it is why the two health probes and the payment
webhook are reachable: they are registered four lines and twelve lines earlier
respectively. Nothing in the codebase declares them public, and nothing would
notice if a future route were added above the gate by accident.

Configuration is the other half of the posture. The environment schema does not
merely validate values; it refuses combinations that are individually legal and
jointly unsafe, and it refuses them at boot rather than at request time. A
production process that still carries a published development secret does not
start.

The sanitisation layers are deliberately placed where the untrusted data
*arrives*, not where it is consumed. Escaping happens in the API before LaTeX is
handed to the compiler, so the compiler can stay too ignorant to be trusted.
Webhook verification happens on the raw bytes before any parsing, so there is no
parsed object to be confused about.

## Mechanics

### Correcting the architecture guide

`docs/ARCHITECTURE.md:167-168` states that *"only `/health` and the
dev-login/logout endpoints are public"*. That is wrong in both directions: it
omits three routes that are reachable without a session, and it credits the
public-path list with governing a route that list cannot match.

The real surface, derived from the routers by `docs/generated/api.json`, is six
routes out of 137. The catalog labels 131 endpoints as authenticated, 3 as
public within the gate, and 3 as outside it.

### The six routes that answer without a session

| Route | Why it answers | Is it safe |
| --- | --- | --- |
| `GET /health` | Registered above the gate (`app.ts:58`) | Yes. Returns a fixed object, touches no dependency, reads no data. |
| `GET /ready` | Registered above the gate (`app.ts:59`) | Mostly. See the caveat below. |
| `POST /webhooks/paddle` | Registered above the gate (`app.ts:50`) | Yes, on the shared secret. See below. |
| `POST /api/v1/auth/dev-login` | Listed in the public paths (`auth.ts:35-40`) | Yes, on three independent conditions. See below. |
| `POST /api/v1/auth/logout` | Listed in the public paths | Yes. Clears a cookie and returns an acknowledgement. |
| `GET /api/v1/auth/me` | Listed, and special-cased above the check (`auth.ts:128`) | Deliberate, with a small disclosure. See below. |

How a session is obtained, and how a request is attributed to a person:

```diagram
DGM-AUTHENTICATION
```

**`/ready` returns a diagnostic string.** When the database probe fails, the
response carries a `detail` field built by stringifying the underlying error
(`middleware/health.ts`). A driver error can name a host or a port, so an
unauthenticated caller learns something about the deployment's topology at the
moment it is broken. That is not a credential and it is not graph data, but it
is more than a liveness answer, and it should be treated as an intentional
trade for operability rather than as nothing.

**The payment webhook is unauthenticated by design and verified by HMAC.** It
receives the untouched request bytes, because parsing and re-serialising the
body would change what was signed. Verification requires a timestamp within five
seconds, validates the candidate digest's textual form and byte length before
comparing - so malformed attacker input is a clean false rather than an
exception - and compares in constant time. When the hosted mode is off the
handler returns a 404 before doing anything else. Possession of the shared
secret is the authentication; there is no session to present.

**Developer sign-in is defended three times over.** It is off unless a flag is
set; even with the flag on it refuses any caller that is not on the loopback
interface; and the environment schema refuses to start a production process with
the flag set at all. The issued token leaves as an `httpOnly` cookie and is not
echoed in the body - echoing it would put an owner credential in reach of
scripts and into every proxy log - with one exception for emulator runs, where
the test client has no cookie jar.

**`/api/v1/auth/me` is public because the browser has to ask who it is before it
can render a sign-in screen.** It resolves a token when one is present and
returns nulls when it is not. It also returns two booleans about the deployment
in either case: whether the hosted mode is on, and whether developer sign-in is
enabled. Both are things an anonymous caller learns, and the second is worth
knowing about - it tells a caller whether the dev-login route is worth probing,
though the loopback check and the production refusal are what actually stop it.

### The public-path list contains an entry it cannot match

`apps/api/src/middleware/auth.ts:35` lists a pattern for `/health` among the
public paths. The gate is mounted at `/api` (`app.ts:62`) and tests
`req.baseUrl + req.path` (`auth.ts:127`), which therefore always begins `/api`.
The pattern anchors on `/health` alone and can never match.

`/health` is reachable because `app.ts:58` registers it four lines above the
gate, and for no other reason. Anything that reads the public-path list as *the*
inventory of unauthenticated routes is describing a mechanism that does not
govern the route it names - and would also miss the two routes registered above
the gate that the list does not mention at all. The generated API catalog labels
these correctly, distinguishing `public` from `outside-auth-gate`.

### The documentation corpus sits below the gate

The table above is the surface that answers *without* a session, and the
documentation is not on it. That is worth saying rather than leaving to
inference, because it is a recent change and because the corpus is part of this
page's own subject matter: its curated half describes every trust boundary in
the system and names the gaps that are known rather than closed, and its
generated half enumerates every route, endpoint, configuration key, table,
migration and exported symbol in the repository. Until August 2026 it was
served as static files by the public web host, which made all of that readable
by anyone who knew the URL. Nothing in it is a credential; the objection is
aggregation. One document that names every boundary and lists every surface is
worth considerably more to somebody probing this system than the same facts
scattered through the source they would otherwise have to read.

It is now served by this API, from a router mounted inside the v1 tree and
therefore *below* `app.use('/api', authGate)`. It declares no public paths, so
it inherits the default-deny gate - but unlike every other router it does *not*
rely on that gate alone to decide who may read it, and the reason is worth
following.

Self-hosted, `authGate` admits nobody but `OWNER_EMAIL`, so an inherited gate
would be enough. In Cloud mode the same gate admits **any verified Google
account**, because that is what Cloud mode is for. A corpus that inherited only
the gate would therefore have been handed to every subscriber the moment
`VITAE_CLOUD_ENABLED` was turned on: silently, on a flag flip, with no diff to
review and nothing failing. That flag was turned on for the production
deployment on 2026-08-24.

So `apps/api/src/routes/v1/docs.ts` carries its own ownership test, applied to
every request before any file is resolved, and it does not consult the mode.
The corpus is a property of the installation rather than of a tenant: it
describes this system's trust boundaries and enumerates its whole surface, and
no subscriber has any business reading that. A non-owner receives `403` - not
`404`, because the caller is already authenticated and hiding the route's
existence would buy nothing while costing them an explanation.

Workspace resolution is skipped for this route for the same reason. Reading the
documentation has nothing to do with having finished account setup, and without
the exemption a signed-in owner who had not yet bootstrapped would be told to
finish setup before they could read the page explaining how to.

What the router does have to get right is file access, because it maps a URL
onto a path under one directory and that is the classic way to serve a file
nobody meant to publish. Containment is checked twice, and the second check is
there because the first was not enough.

The first check resolves the requested path against the root and asserts the
result is inside it, separator included - `startsWith` alone would accept a
sibling directory whose name merely begins with the root's. That is what
catches a traversal spelled in the URL. It has to catch the percent-encoded
form specifically, because Express normalises a literal `..` out of the path
before routing, so the literal form is answered by the router never matching
rather than by this check at all.

It does not defeat a symlink. Path resolution is string arithmetic and does not
follow links, so a link placed *inside* the corpus and pointing anywhere on the
filesystem passed that check and was then read. The first version of this
router had exactly that hole. Its own test suite found it, and the fix is the
second check: `realpathSync` both the candidate and the root, then assert
containment again on the paths that will actually be opened. This is the
difference between a defence that was reasoned about and one that was tried -
and it is why the suite spells the traversal cases out rather than assuming
them.

Every refusal - a traversal, an absolute path, a link pointing out, a
directory, a file that is not there - returns the same 404 with the same body,
so a caller cannot learn where the root is or what sits beside it.

Two response details follow from the corpus being private rather than merely
authenticated. Every file is sent `private, no-store`, because a shared proxy
holding a copy would hand it to the next person through it. And the content
type is stated as JSON rather than inferred from the extension, so a file that
somehow is not JSON cannot be served as something a browser will execute.

A file request against a deployment that was never given a corpus answers 503
with a code naming that specific condition, rather than an empty documentation
set - the difference between an operator's missing build step and a reader's
broken link.

The integration suite proves the part that matters: an anonymous request is
refused, and so is a request carrying a perfectly valid session for somebody
who is not the owner. A real token is not the same thing as permission.

The `/docs` address in the browser is a separate question and answers without a
session on purpose. It renders an empty frame and a sentence naming the account
to sign in with, because the alternative, the workspace gate's silent redirect,
sends a reader to debug a build that is working. The frame holds no corpus
text. Every page, the navigation and the search index arrive from an
authenticated request or not at all.

### Identity and authorisation

Three token paths are accepted, in order of cost. A locally issued development
session is tried first because it needs no network. A Google identity token from
the primary project is accepted only when the email is verified *and* the
sign-in provider is Google. A third path accepts a token from a configured
companion project, held to a deliberately stricter bar because that project's
sign-in methods are not this system's to govern, and its identifiers are
prefixed so a coincidental collision can never alias an account in the control
plane.

Every process and store, grouped by how far it is trusted:

```diagram
DGM-TRUST-BOUNDARIES
```

Authorisation then differs by mode. Self-hosted compares the verified email
against the configured owner. Hosted accepts any verified identity at this layer
and defers the real decision to workspace membership, which
[The Cloud workspace and billing plane](cloud-plane.md) covers.

Refusals carry a neutral message and no detail. A request with no credential is
told a sign-in is required; every other refusal - an invalid token, a token from
the wrong provider, an unverified email, a verified identity that is not the
owner - returns the same status, code and message, so a probe holding a token
learns nothing about why it was refused.

### Response headers and origins

Security headers come from Helmet with a content security policy whose script
source is nonce-based, with a fresh nonce generated per request and combined
with strict-dynamic. Framing is denied outright, plugin content is denied, the
base URI is restricted, the referrer policy sends the origin only on a
cross-origin request and nothing at all on a downgrade, and cross-origin
resource policy is same-site.

State the policy's soft edges honestly: inline styles are permitted, and both
image and connection sources allow any HTTPS origin. Scripts are the part that
is tightly held.

Cross-origin access is an explicit allow-list built from configured origins,
never an origin reflector, with credentials enabled.

### Configuration refusals at boot

The environment schema (`packages/config/src/env.ts`) parses and fails fast, and
then applies a second check for combinations that are each individually valid.
In production it refuses to start when developer sign-in is enabled, when the
build service secret is one of the published development defaults, when the
session secret looks like a placeholder, or when the database URL still points
at localhost - the last because a production process that quietly fell back to
the local default would come up healthy against an empty database and start
accepting writes into it.

Note that the hosted-mode and payment provider variables are read directly from
the process environment rather than through this schema, so none of them are
covered by these refusals. That gap is documented on
[The Cloud workspace and billing plane](cloud-plane.md).

### Third-party credentials are never application data

A credential for another service is never stored in the graph. The database
holds only non-secret synchronisation metadata and a reference saying where the
secret lives; the secret itself comes from the deployment's secret manager, or
from a git-ignored file store with restrictive permissions on a self-hosted
install. A credential found in the old location is migrated out and deleted on
read, so a backup taken afterwards no longer carries a usable token. The
practical consequence is the one that motivated the change: a database dump, a
backup or an export is no longer a way to obtain someone else's account.

### Text on its way into LaTeX

TeX is a programming language, so any user-controlled string that reaches a
document is a code-injection surface. Every such string passes the escape layer
first: a single-pass character map that neutralises the metacharacters, control
character stripping, and a whitelisted mini-markdown renderer that tokenises
emphasis over the raw string and escapes each segment before wrapping it, so
escaped content can never be re-read as markup. Link targets pass a scheme
allow-list, because a PDF annotation with a script scheme is honoured by some
viewers, and a résumé is a document handed to strangers.

The layer is held by a property suite of several thousand randomised
full-Unicode cases asserting that output is always safe and structurally
idempotent. [The deterministic algorithms](algorithms.md#latex-escaping) has the
detail; [From graph to compiled résumé](resume-pipeline.md) shows where in the
pipeline it sits.

### The compiler sandbox

The build service is reached only over HTTP and only with a request signed over
the timestamp and the raw body, within a five-minute skew window. It refuses to
start without a secret, and refuses to start in production with one of the
published development defaults. It binds to loopback unless told otherwise, so a
bare process is not on the network. Compilation runs in untrusted mode with no
shell escape, in a per-request temporary directory that is removed afterwards,
against a package cache warmed at image build time - the image build itself
proves the cache is complete by re-running the warm step with the network
disabled - and the container runs as an unprivileged user.

### Files and exports

Uploads are content-addressed by their SHA-256 and stored with a private
delivery type, reachable only through short-lived signed URLs, so an attachment
key is not a guessable address. The stored identifier is namespaced by the
workspace, with the reason recorded in place: a shared content hash across two
tenants is itself an information leak, even though the object would be
identical.

Where a person's data enters, where it rests, and every way it leaves:

```diagram
DGM-DATA-LINEAGE
```

On the way out, records marked sensitive are excluded from an export unless the
person explicitly opts in, and the exclusion is transitive - the edges that
touch a sensitive record, and the revisions and atoms that describe it, are
excluded too. A partial exclusion would be worse than none, because it would
leave the shape of what was hidden.

### Gaps that are known rather than closed

Three, stated because a security page that only listed defences would be
misleading.

The Cloud plane is the most security-sensitive code in the repository - tenant
isolation, entitlement, and a payment webhook - and none of its five modules has
a colocated test suite. Its only automated coverage is a single integration file
of four cases.

The design system's own test suite runs under no continuous-integration job. It
is the most depended-on code in the repository, so a regression in it would
reach nearly every screen without a failing signal.

The browser acceptance suite is type-checked by nothing: the package declares
neither a type-check nor a build script, so its files are compiled only at the
moment the browser driver runs them.

All three are recorded with reproduction commands in the documentation audit;
see [About these documents](../meta/index.md).

## Related

- [What happens to a request](request-lifecycle.md) puts the gate in the order
  of the middleware stack.
- [The Cloud workspace and billing plane](cloud-plane.md) covers tenant
  isolation and the payment path in full.
- [Storage, migrations and versioning](persistence.md) covers soft deletes,
  retention and the export bundle.
- [The deterministic algorithms](algorithms.md) has the escape layer's exact
  rules.
