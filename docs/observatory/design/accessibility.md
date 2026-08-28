---
id: DSN-A11Y
title: Accessibility commitments
summary: What the interface promises, which promises a test actually holds, and the surfaces and criteria that no automated gate can currently see.
audience: [designer, developer, maintainer]
domain: design
type: explanation
status: partial
verified_at: 2026-08-24
sources:
  - packages/ui/src/styles/base.css
  - packages/ui/src/styles/tokens.css
  - packages/ui/src/layout.tsx
  - apps/web/src/app/Shell.tsx
  - apps/web/src/test/a11y.ts
  - e2e/tests/helpers/a11y.ts
  - .github/workflows/ci.yml
  - docs/generated/tests.json
  - DESIGN.md
requirements: [NFR-A11Y-001]
related: [DSN-TOKENS, DSN-PATTERNS, DSN-STATES, DSN-MOTION]
order: 6
---

# Accessibility commitments

## In short

Vitae's stated contract is WCAG 2.2 AA, and a good deal of the interface is
built so that meeting it is the default rather than an effort: the focus
indicator is defined once for the whole product, contrast is measured against
the worst surface a value can land on, targets have a floor, and no state is
carried by colour alone. What is *tested* is narrower than what is promised.
Two automated gates run, both filtered to WCAG 2.1 and earlier, and several
surfaces they never reach. This page separates the two, because a commitment
nobody checks is a commitment that decays quietly.

## How it works

### The mechanisms that make the default correct

**One focus indicator, defined once.** A single rule replaces the user-agent
outline with a two-part ring built from tokens, on every element that can take
focus. Because it is defined once and unqualified, a new control cannot ship
without one. A forced-colours block restores a real outline, because a
box-shadow is discarded in that display mode and the ring would otherwise
vanish for exactly the readers who need it most. This is the product's one
registered accessibility requirement, and its definition was reconstructed from
that rule rather than from a specification, so it carries a needs-review mark.

**Contrast is measured against the worst case.** Every ink value is quoted
against the lightest surface it can appear on rather than against the page
background, and the ramp has a floor that must not be darkened. The reasoning
is on [Tokens and the scales they enforce](tokens.md).

**A control whose only boundary is a border gets a stronger token.** WCAG 1.4.11
asks 3:1 of non-text contrast for the thing that identifies a control, and the
ordinary emphasis rule does not clear it. A separate control-boundary token
does, and reaching for it is a rule rather than a taste.

**Targets have a floor that follows the pointer, not the viewport.** Painted
controls may stay compact on a precise pointer but never drop below 32px, and a
coarse pointer promotes the same token to 44px at any width.

**Nothing means anything by colour alone.** This is enforced by the components
rather than by a linter: banners carry a distinct glyph shape *and* a visually
hidden word per tone, toasts add a word to the success and error variants, rows
emit a real selection attribute plus a check glyph and the word for their state,
and every categorical encoding ships a shape and a direct label alongside its
ink.

**Live regions are rationed.** Polite for loading, route changes, refreshes,
selection counts and ordinary completion; assertive only for failures that need
to interrupt. Components that report state take an opt-out for the case where a
surrounding region already announces the same thing, because two live regions
describing one event is worse than none.

**Overlays are borrowed, not rebuilt.** Dialog, sheet, select, menu, tooltip and
toast are library-backed. Focus trapping, escape behaviour, announcement timing
and swipe handling are the things most often reimplemented badly, and they have
already been argued through once here.

**The route target can hold focus.** The skip link points at the content region,
which carries a negative tab index - the attribute that makes an element
focusable by script without adding a tab stop. Without it a skip link moves the
viewport and leaves focus where it was, so the reader tabs and lands back at the
top of the navigation they were trying to skip.

## Mechanics

### The two gates, and what each one is filtered to

**Component scans** run under the unit-test runner in a simulated DOM. The
helper disables the colour-contrast rule, because that environment has no real
layout or colour pipeline and would produce noise rather than findings. Eight
test files call it today.

**Page scans** run under the browser test suite with the accessibility engine
configured to the tag set `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`. Thirty-three
specs call it, at 41 call sites.

Before each page scan the helper finishes every running animation and waits a
frame. That is not a convenience: scanning mid-transition sampled half-opacity
ink and reported contrast failures the settled screen never shows - a heading at
2.19:1, a primary button at 4.33:1. Infinite animations are skipped, because
they have no end to jump to.

### The gap between the contract and the tag filter

The written contract is WCAG 2.2 AA. The page scan's tag filter tops out at
WCAG 2.1 AA. Nothing in the automated suite therefore evaluates a criterion that
2.2 added, and the target-size and focus-appearance thinking recorded in the
tokens is held by review rather than by a rule.

That is not a claim that the product fails 2.2. It is a statement that the
evidence for 2.2 does not currently exist in this repository, and anyone
asserting the contract to an outside party should treat it as intent supported
by design decisions rather than as a tested result.

### What no gate can see

Four gaps, each verified rather than inferred.

**The design system's own tests run in no gate.** `@vitae/ui` is the most
depended-on code in the repository, and 226 test cases across 9 files belong to
it. No continuous-integration step names that workspace, and the aggregate test
script does not include it. The tests pass; nothing runs them. That is the
shape of gap that reports nothing rather than reporting red, which is why it
went unnoticed. Several of those cases are the assertions behind the
never-colour-alone promises described above.

**Five public pages have no browser test at all.** The marketing rebuild added
five routes that no specification file references by path, so neither the
accessibility scan nor any other browser assertion has ever visited them. The
three older public pages are covered.

**The skip-link rule is weaker than its own description.** The engine's rule
help says the target "should exist and be focusable"; its implementation checks
only that the target exists and is visible to assistive technology. It also
carries no WCAG tag, so the page scan excludes it by filter anyway. Both gates
report green truthfully, and neither statement means what a reader of the result
would assume. The defect this once hid has been fixed; the blind spot has not.

**Contrast is only ever checked in the browser suite.** A component test can
never fail on it, so a colour regression is invisible until a page scan reaches
the screen that uses it - and the previous item lists screens no page scan
reaches.

### What to run when you change a shared pattern

The unit and browser suites both matter here, and they check different things.
Component scans catch structure - roles, names, nesting, labelling. Page scans
catch what only a real browser knows: contrast, focus order through a rendered
layout, and whether an overlay actually hid the page behind it. A change to a
shared primitive deserves both, plus the design system's own suite, which
nothing else will run for you.

## Related

- [Tokens and the scales they enforce](tokens.md) - the contrast floors,
  control-boundary rule and target sizes this page depends on.
- [Layout and component patterns](patterns.md) - the semantics the shared
  primitives emit on your behalf.
- [Loading, empty, error and unavailable](states.md) - the live-region
  behaviour of every state a screen can be in.
- [Motion, and why there is so little](motion.md) - reduced motion, and the five
  layers that have to agree about it.
