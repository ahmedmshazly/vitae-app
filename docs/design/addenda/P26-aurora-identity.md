# SUPERSEDED - P26: "Aurora Signal" product identity (2026-07 rebrand)

> **Superseded by the 2026-08 "Quiet" identity. Do not implement anything on
> this page.** Quiet is specified in [`../brand-book.html`](../brand-book.html),
> extracted in [`../IDENTITY.md`](../IDENTITY.md), and defined in
> `packages/ui/src/styles/tokens.css`. Aurora's central prescriptions are now
> refused by `scripts/check-brand-bans.mjs`, which fails the build on gradients,
> on blurred glow shadows outside the two approved tokens, on a second easing
> curve, on durations off the token scale, and on raw hex outside the token
> file, so the gradients, glows, ambient washes, spring easing, 120/180/320ms
> durations and cyan palette below cannot ship. This page is kept as the record
> of an identity that was tried and removed on purpose; the rest of it is
> unedited.

**Story:** *your life as a living, bioluminescent network; the graph is the hero.*
Vitae's identity moved from "warm-onyx paper & ink personal instrument" to a
product register: deep space-blue ink lit by an electric-cyan signature with a
violet gradient partner. Dark-only. Frontend-only (no API changes).

Retained DNA: mono-for-data, provenance chips, explainable scores,
keyboard-first, density. Everything hangs off the `--ae-*` tokens
(`packages/ui/src/styles/tokens.css`), so the system recolors atomically.

## Token map (old → new)

| Role | Warm onyx (old) | Aurora Signal (new) |
|------|-----------------|---------------------|
| bg | `#100F0D` | `#0A0D14` |
| surface / raised / overlay | `#1A1815` / `#211E19` / `#232019` | `#10141D` / `#161B26` / `#1A2030` |
| nav rail | = surface | `--ae-rail: #07090F` (a step below canvas) |
| fg / muted / faint | `#EAE7E1` / `#8C877D` / `#625D53` | `#E4E8F1` / `#8590A6` / `#5A6377` |
| accent | `#5385D4` muted blue | `#35C8F0` electric cyan (`--ae-accent-ink #041019` for text on fills) |
| accent-2 (new) | - | `#8B7CF6` violet; gradient partner only |
| gradient (new) | - | `--ae-grad-brand`: cyan→violet 135° |
| ember (new) | - | `#F5A524`; **gamification only** (streaks, celebration bursts) |
| success / warning / danger | `#6FA982` / `#CBA25C` / `#CC7A6E` | `#4CC38A` / `#F5A524` / `#F2695C` |
| radii sm/base/lg | 6 / 8 / 10 | 8 / 10 / 14 |
| viz 1-8 | blue-led warm set | `#1B9CC9 #8B7CF6 #2FA875 #C98500 #D55181 #5385D4 #D95926 #199E70`; validated vs `#0A0D14` (OKLCH L .48-.67, chroma ≥ .1, ≥3:1, worst adjacent CVD ΔE 24.9) |

## Rules of the light

1. **Aurora gradients only on hero moments**: logo wordmark (stacked lockup),
   primary CTA (`.vt-btn--primary`), momentum ring, avatar halo. Never on body
   surfaces or secondary controls.
2. **Ember is earned**: warm amber appears only when the user did something:
   streak flames (≥3 days), celebration bursts. It is not a second accent.
3. **Light over tone**: cards carry `--ae-edge-light` (1px top-edge inner
   light); hovers add `--ae-glow-soft`; focus is a cyan glow ring
   (`--ae-focus-ring`). Elevation = tone + light, still no heavy drop shadows.
4. **Ambient aurora**: `.shell__main` and `.signin` carry fixed radial
   cyan/violet washes at ≤7% alpha; the room's light, never a background image.

## Typography

- `--ae-font-display: 'Space Grotesk'` (500/600/700, self-hosted fontsource):
  page titles (24px), hero greeting, stat/pipeline numbers, modal titles,
  wordmark, avatars.
- Body stays IBM Plex Sans; data stays IBM Plex Mono (identity invariant).

## Motion vocabulary

Tokens: `--ae-dur-fast 120ms · --ae-dur 180ms · --ae-dur-slow 320ms`,
`--ae-ease-out` (decel), `--ae-ease-spring` (soft overshoot for modals, toasts).
All zeroed under `prefers-reduced-motion`. Signature moves: button press
scale(.97), modal spring-in over blurred scrim, toast rise, nav "signal bar"
(glowing 2px cyan filament beside the active item), status pulse ping,
staggered row entrances (existing), route fade-up (existing).

## Gamification inventory (frontend-only: derived from fetched data)

| Element | Where | Mechanics |
|---|---|---|
| **Momentum ring** | Today hero | 0-100: habits done today ×40 · reconnect health ×30 · reminder pressure ×20 · capture recency ×10; aurora arc, animated draw, count-up; one-line hint names the next action |
| **Streak flame** | Habit rows | streak ≥3 → ember pill `🔥 n-day streak` with flicker + glow; below 3, quiet text (ember is earned) |
| **Celebration burst** | habit check · favor settle · reminder done | `.vt-burst` radial spark ring via `lib/burst.ts`; ember tone for habits |
| **Greeting** | Today hero | time-of-day greeting ("Up late" past midnight) |
| **Live pulse** | rail footer | system-status dot pings every 2.4s |

## Fixes shipped with the rebrand

- `.navlink` and `.row` now set `background` explicitly; `<button>`s using
  them no longer show the UA button face (Sign out, dev sign-in, Map cities).
- `Rating` follows radio semantics: clicking the selected dot keeps it selected
  (it used to clear the value, silently wiping closeness + cadence).
- QuickAdd cheat-sheet gained the `g` (goal) / `h` (habit) keys.

## Screenshots

`../screenshots/p26-signin.png · p26-today.png · p26-people.png ·
p26-person.png · p26-graph.png`, plus refreshed `p23-*`/`p24-*`/`p25-*` under
the new identity.
