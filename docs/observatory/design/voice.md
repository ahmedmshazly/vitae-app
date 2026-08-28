---
id: DSN-VOICE
title: Voice and content design
summary: How the interface talks (active, specific, one name per thing, no apologies), and which of those rules a script actually checks.
audience: [designer, user]
domain: design
type: explanation
status: verified
verified_at: 2026-08-24
sources:
  - docs/design/IDENTITY.md
  - CONTRIBUTING.md
  - packages/ui/src/layout.tsx
  - packages/ui/src/toast.tsx
  - apps/web/src/components/QueryBoundary.tsx
  - apps/web/src/routes/marketing/Chrome.tsx
  - scripts/check-test-prose.mjs
  - scripts/check-public-release.mjs
related: [DSN-IDENTITY, DSN-STATES, DSN-PATTERNS]
order: 7
---

# Voice and content design

## In short

The interface talks the way a good instrument reads out: it says what happened
and what to do next, in the fewest words that stay specific. Active voice,
sentence case, no exclamation marks, no emoji, and never an apology - a message
that opens with "Oops" or "Sorry" has spent its first word on feelings instead
of on the fact the reader needs. One idea has one name, everywhere. And a
surprising amount of the product's wording is not written by whoever built the
screen: the shared components already chose it.

## How it works

### Say what happened, then what to do about it

An error names what failed and how to fix it. "Couldn't load your people" is a
sentence a reader can act on; a status code is not. An empty state is an
invitation with a real next action attached, not a statement that there is
nothing here. A confirmation says what was done, in the same words as the
control that did it.

That last one is a rule with a shape: **the verb survives**. A control that says
"Save changes" produces a confirmation that says "Saved". If the toast has to
introduce a new verb, the button was named wrong.

### One name per thing

The product has a small fixed lexicon, and it exists because a graph-shaped
application is unusually easy to describe two ways. A thing you keep is a
**record**, never a node or an entity. A relationship between two records is a
**connection**, never an edge. The visual view of them is the **life map**,
never the graph view. The other fixed terms are **atom**, **target**,
**output**, **capture**, **owner**, and **demo data**.

The point is not that these are better words than the alternatives. The point is
that a reader who learns one of them has learned it, and a screen that switches
to a synonym costs them the learning. Implementation vocabulary - node, edge,
vertex - belongs in the code and in the developer documentation, not on a
button.

### Sentence case, with one exception

Everything is sentence case: page titles, section headings, buttons, labels,
messages. The single exception is the display treatment, which is uppercase with
wide tracking and is reserved for page and section titles. It never labels a
control, and it never renders small. That treatment is a typographic device
rather than a writing style, so it does not change how the words are chosen -
only how they are set.

### Public copy is held to a stricter standard than product copy

The marketing pages describe a product that a reader cannot yet inspect, so they
carry rules the signed-in application does not need.

Screenshots are real product captures and are labelled as such, with the demo
data named - the marketing chrome renders a fixed caption saying the interface
is real and the data is fictional. Nothing fabricates a screenshot, an
endorsement, a customer, a benchmark, or a commercial or legal term. Claims
about a hosted service stay pre-launch until the release gate that opens it is
actually opened, because a call to action for something nobody can buy is a
false statement about operating status rather than an aspirational one.

## Mechanics

### The words the components already chose

Before writing a message, check whether the component is going to supply one.

- The **banner** emits a hidden tone word - Note, Success, Warning or Error -
  alongside its glyph, so a reader receiving it as text gets the tone in words.
  Your title should not repeat it.
- The **toast** adds "Done" or "Error" to its success and error variants for the
  same reason.
- The **query boundary** owns the whole failure vocabulary for data: the
  couldn't-load title, the couldn't-refresh title, "Showing the last available
  version", and "Everything else on this screen is current" for a partial
  failure. What a caller supplies is the noun phrase in the middle - "your
  people", "the history", "the favour ledger" - sized to sit inside a sentence.

Two typographic details are conventions the existing copy keeps: the apostrophe
is the typographic one rather than the straight quote, and a message ends on a
full stop when it is a sentence.

### An announcement is composed, not assembled

The toast builds the string it announces rather than letting the underlying
library walk its own DOM and concatenate the parts, which produced runs like
"Notification ErrorNope". Each fragment is ended on a stop before the next is
joined. This is the general shape of the problem: sighted readers get sentence
separation from the layout, and a live region gets none of it, so anything
announced has to be written as a sentence rather than laid out as one.

### What is checked, and what is not

Two prose gates run in continuous integration, and **neither of them reads a
single word of product copy**.

`scripts/check-test-prose.mjs` flags em and en dashes and a short list of filler
phrases, and it looks only at test titles and single-line comments under six
source roots. Its allowlist exists for deliberate product and fixture strings.

`scripts/check-public-release.mjs` scans every tracked file for a small set of
private identifiers left over from a pre-release project. It is a hygiene guard on what ships publicly, not
a style checker.

So every rule on this page - the lexicon, sentence case, the surviving verb, the
absence of apologies - is held by review and by the components making the right
words the default. A button labelled with the wrong noun will not fail a build.

### The contributor prose rules

`CONTRIBUTING.md` sets the same standard for everything written around the code:
write plainly, prefer specific behaviour over announcements about a change,
avoid placeholder praise, generic conclusions and decorative punctuation, and
keep formal material - interface names, legal text, URLs, protocol values -
exact. Documentation is updated in the same change as the behaviour it
describes, which is the rule that keeps a page like this one true.

## Related

- [The Quiet Observatory](identity.md) - the restraint this voice is the verbal
  half of.
- [Loading, empty, error and unavailable](states.md) - where most of the
  product's words actually appear.
- [Layout and component patterns](patterns.md) - the primitives that supply a
  heading, a label, or a hidden word before you write one.
