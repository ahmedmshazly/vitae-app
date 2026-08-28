---
id: DSN-STATES
title: Loading, empty, error and unavailable
summary: The one contract every screen uses for the states where it has nothing true to show, and why each of them is a different state with a different exit.
audience: [designer, developer]
domain: design
type: explanation
status: verified
verified_at: 2026-08-24
sources:
  - apps/web/src/components/QueryBoundary.tsx
  - packages/ui/src/feedback.tsx
  - packages/ui/src/layout.tsx
  - packages/ui/src/toast.tsx
  - packages/ui/src/styles/components.css
  - apps/web/src/routes/Templates.tsx
related: [DSN-PATTERNS, DSN-MOTION, DSN-VOICE, DSN-A11Y]
order: 4
---

# Loading, empty, error and unavailable

## In short

Every screen has to answer four questions before it can show anything: is it
loading, is there nothing here, did something fail, or is this the content. The
identity rule is that all four ship - a screen that only handles the happy path
is unfinished. In practice the product needs two more: a screen that is
refreshing data it already has, and a screen whose dependency is unavailable
while the rest of it is still true. All six have one implementation, so a screen
does not get to invent its own dialect of "something went wrong".

## How it works

### Why there is one contract at all

The single boundary component exists because an audit of the route tree found
four different spellings of "is it loading" across roughly forty screens, plus
three hand-rolled boolean states, and eight secondary queries that destructured
only their data - so a failed request rendered as an empty list. That last one
is the failure worth naming: the screen stated a fact it did not have. An empty
list and a request that failed look identical to a reader, and only one of them
is true.

`QueryBoundary` is now the one place that decides. It takes a query result, or
several that must resolve together, and renders exactly one phase: error,
loading, empty, filtered-empty, or content.

### The states are genuinely different, and so are their exits

**Loading** is a skeleton shaped like the content that is coming. The default is
a row skeleton, and callers are expected to pass one that matches - a skeleton
that is not the shape of what arrives is worse than no skeleton, because it
moves the layout at the moment the data lands. Skeletons pulse opacity only,
never shimmer, and carry a polite loading label for anyone who cannot see them.

**Empty** is two states, not one. "There is nothing here yet" invites the first
record; "your filter matched nothing" offers the way back out of the filter.
They have different copy and different exits, and conflating them produces a
screen that tells a new user to clear a filter they never set. A filter applied
over a set that is itself empty is still the first case.

**Error** is a failure with no data behind it. It takes the alert role, states
what failed in the reader's terms, shows the underlying message as detail, and
offers Retry wired to every query the boundary was handed. It can also carry a
second way out, because reloading, going somewhere that still works, or opening
the readable twin of a canvas that failed are all better than a dead end - and
callers were rebuilding the error panel by hand to get one.

**Refreshing** is not a state that replaces anything. Cached data stays on
screen, and a compact live status line says so.

**Unavailable** is the one people forget. A dependency is down while the screen
itself is still telling the truth. That is not an error state for the whole
screen and it is not an empty one; it is a banner over content that keeps
rendering.

### Degradation is the default, not a special case

Two rules follow from that last one, and both are implemented once rather than
per screen.

A refresh that fails *after* data has arrived does not blank the screen. The
data stays, and the failure becomes a banner saying the last available version
is what you are looking at. Replacing truthful content with an error because a
later request failed is a downgrade, not a warning.

A secondary query that fails does not blank the region its primary query can
fill. All secondary failures gather into one banner that names them together and
says everything else on the screen is current. One banner rather than one per
failure, deliberately: two Retry buttons a gap apart would each implicitly claim
that everything other than its own subject was fine, while the other had in fact
failed too.

## Mechanics

### The feedback vocabulary

Five components carry every state in the product, and each one exists to stop a
particular thing being hand-rolled.

| Component | What it is for | The decision it makes for you |
| --- | --- | --- |
| Skeleton and row skeletons | Waiting for first data | Opacity pulse only, a polite label, a stagger index per row |
| `EmptyState` | Nothing to show | A glyph, a title, a hint, and a slot for the real next action - never an illustration |
| `ErrorState` | A failure with no data behind it | Alert role, plain-language title, detail in monospace, Retry, and an optional second exit |
| `Banner` | A condition over content that still renders | One glyph shape *and* one hidden word per tone, and the alert role for failures only |
| `StatusTrace` | An inline state signal | The label carries the meaning; the mark arrives once and never loops |

Two details in that table are load-bearing. The banner's four tones each get a
distinct glyph and a visually hidden word, so the tone is never carried by hue
alone - and the failure glyph is deliberately not the close mark, because the
dismiss control in the same row already draws that, and two identical marks one
gap apart would leave colour as the only thing telling the state from the
button. The status trace's mark animates once on mount; idle status never loops
or pretends that stalled work is progressing.

### Empty states have no illustration, on purpose

Decorative illustration in an empty state is one of the standing bans - tried in
a previous identity and removed. An empty state is a compact invitation with a
real next action, and its job is to be a doorway rather than a poster. This one
is convention rather than a gate: nothing in the build refuses an illustration,
but nothing in the component gives you a place to put one either.

### How the phases avoid overlapping

The skeleton must be gone before the content arrives - never cross-faded with
it. That is implemented structurally rather than by timing: the loading phase is
a plain element that does not animate, every resolved phase is an animated
element keyed on the phase name, and there is deliberately no exit animation
wrapper, because an exit animation is precisely what a cross-fade is made of.
The skeleton unmounts in the same commit that mounts the content.

Every phase, loading included, is exactly one element carrying the caller's class
name. That matters more than it sounds: if the loading phase spilled its rows
directly into the caller's element, a parent laying out a grid would receive six
skeleton rows as its own children and then a single wrapper a commit later, and
the region would change shape at the moment the data landed.

### The unavailable state, concretely

The résumé template screen is the clearest example. It reads a build-service
health endpoint and resolves it to one of three states: calibrated, partially
warmed, or unavailable. The first two report themselves inline on the shared
status grammar. The third is a blocking banner, because an unavailable build
service means nothing on that screen or in the tailoring workspace will compile,
and before the banner, that fact was a line of body copy announced to nobody.

The same shape appears wherever a screen can be partly true: a saved-view index
that could not load, a count that is unavailable beside a name that is not, a
system status the shell could not read. In each case the screen says which part
it could not get, and keeps the part it could.

### Toasts are the one transient channel

Everything above is state rendered in place. Toasts are the only thing that
appears and then leaves, and they are correspondingly constrained.

At most four are on screen; past that the oldest is dropped outright rather than
animated away, because the viewport grows upward and an uncapped burst pushes
the oldest items and their Undo buttons past the top edge where nothing can
reach them. Neutral and success messages last five seconds, errors eight, and
anything carrying an action twelve. They pause on hover and on focus, dismiss by
swipe, and are reachable with the documented `F8` hotkey as well as by normal
tab order. Success and error each add a glyph and a word - "Done", "Error" - so
the variant is never colour alone.

The announced string is composed by hand rather than left to the toast library,
which builds its live region by walking the item's DOM and concatenating the
parts with nothing between them: sighted readers got the spacing from the
layout, and the live region got "Notification ErrorNope".

### What is enforced here

Almost none of it. The rule that every screen ships four states has no gate, and
neither does the choice between the two empties, the alert role, or the
degradation banners. What the build does enforce is the motion around them: no
shimmer, because a sweep would need a gradient; and the two repeating animations
in the product - the spinner and the skeleton pulse - are named exceptions in
`docs/design/brand-ban-allowlist.json` rather than accidents. Everything else on
this page is held by the components being easier to use than to replace.

## Related

- [Layout and component patterns](patterns.md) - the compositions these states
  sit inside.
- [Motion, and why there is so little](motion.md) - why the skeleton stops
  before content enters, and what happens under reduced motion.
- [Voice and content design](voice.md) - what an empty state and an error
  actually say.
- [Accessibility commitments](accessibility.md) - the live-region discipline
  behind the announcements described here.
