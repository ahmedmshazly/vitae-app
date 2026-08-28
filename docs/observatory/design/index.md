---
id: DESIGN
title: Design
summary: The Quiet Observatory as it is actually enforced: one identity, one token file, one easing curve, and a script that fails the build on the rest.
audience: [designer, developer]
domain: design
type: index
status: verified
verified_at: 2026-08-24
order: 3
---

# Design

Vitae's interface has one identity, and it is narrower than most. It is dark
only, achromatic, and flat: there is no accent hue, no gradient on chrome, no
glow, no glass, and one easing curve for every animation in the product. The
whole colour budget is spent on data and on outcomes, so nothing is left over
for decoration.

This section explains why the constraints are the shape they are, and - more
usefully - which of them a machine will actually stop you from breaking.

## The pages

| Page | The question it answers | Written for |
| --- | --- | --- |
| [The Quiet Observatory](identity.md) | Which identity is current, and what happened to the other two? | Anyone building UI |
| [Tokens and the scales they enforce](tokens.md) | Why these scales, and what does a value off them cost? | Designers, developers |
| [Layout and component patterns](patterns.md) | How is a screen composed, and what does the design system decide for you? | Designers, developers |
| [Loading, empty, error and unavailable](states.md) | What does a screen show when it has nothing true to show? | Designers, developers |
| [Motion, and why there is so little](motion.md) | When may something move, and for how long? | Designers, developers |
| [Accessibility commitments](accessibility.md) | Which promises are held by a test, and which are held by review? | Anyone shipping a change |
| [Voice and content design](voice.md) | What do the words say, and who chooses them? | Writers, designers |

Read [The Quiet Observatory](identity.md) first. Everything else assumes it.

## Rules with teeth, and rules without

A design system that is only written down decays quietly, because nothing fails
when it drifts. Vitae's does not decay uniformly: part of it is machine-checked
on every push, and the rest is a convention that survives on review attention.
The difference is worth knowing before you argue with either kind.

`scripts/check-brand-bans.mjs` is the enforced half. It reads every stylesheet
and every non-test TypeScript file under `packages/ui/src` and `apps/web/src`
and refuses gradients, blurred shadows outside the two approved tokens, a second
easing curve, a duration off the token scale, travel on hover, a raw hex outside
the definition file, and three of Tailwind's stock animations. It runs in
continuous integration, so each of those is a rule with teeth.

Everything else in this section - composition, hierarchy, when a card is
allowed, whether a state is announced - is convention. Each page says which of
the two it is describing, because a reader deciding how hard to push back
deserves to know whether the answer is "a person disagreed with you" or "the
build will not go green".

## What is written here and what is generated

These pages never list what a generator already indexes. The interface declares
182 custom properties across 22 stylesheets, and `packages/ui` exports 60
components and 4 hooks; `docs/generated/tokens.json` and
`docs/generated/components.json` hold those inventories and are rebuilt from
source, so a page that repeated them would be wrong within a month.

What is here instead is the part a generator cannot derive: how many steps a
scale has and why, which value is a floor that must not move, what was tried
before and removed, and what a rule costs when someone breaks it.

## Where this leads

[Product](../product/index.md) is what the interface is for. [About these
documents](../meta/index.md) records what the older design documents got wrong
and where each correction was made; several of those corrections are the reason
pages in this section read the way they do.
