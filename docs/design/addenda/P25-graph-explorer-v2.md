# P25: Graph explorer v2 (FR-VIS-001: react-force-graph-2d)

**Job:** the connected-graph view, rebuilt on canvas force simulation:
pan/zoom, node drag, hover neighborhood highlighting, a peek panel, and PNG
export. Same data flow (`GET /graph?depth&focus`), same 1.5k element cap.

## Color system

Node colors come from the **`--ae-viz-1..8` tokens at runtime**
(`apps/web/src/lib/graph-palette.ts` reads computed styles; no hard-coded hex).
The eight hues were validated with the categorical-palette checker against the
`#100f0d` surface (OKLCH L 0.48-0.67, chroma ≥ 0.1, ≥3:1 contrast); slots are
assigned in FIXED order
(person·org·role·project·skill·event·interaction·repo)
and never repaint when filters change. Long-tail types share `--ae-muted`.
Identity is never color-alone: nodes carry direct labels and the type filters
carry color dots beside their names.

## Canvas

- Node = filled circle, radius 4.5px + degree (self 9px, accent fill,
  accent-soft ring); selected node gets a second ring.
- Labels (IBM Plex Sans, dark backing plate) appear when zoomed past 1.6×,
  on hover/selection, for self, and for hubs (degree ≥ 6).
- **Hover:** non-neighbors dim to 15% alpha; incident links turn accent and
  thicken. No particles; too flashy for the brand.
- Initial positions are seeded from an FNV hash of the node id, so reloads
  settle into a familiar shape.
- Drag to reposition; scroll/pinch to zoom; drag background to pan.

## Peek panel (click a node)

280px overlay card, top-right: title, type chip + `degree links · hop n`
(mono), a keyboard-navigable list of the node's top neighbors (click to
re-peek), and actions: **Open record** (primary) · **Expand from here**
(refetches with `focus=`, honoring depth ≤ 4). Background click or × closes.

## Toolbar

`expand more +` (depth, ≤4) · `fit` (zoomToFit 400ms) · `pause/resume physics`
· `export PNG` (composites the transparent canvas onto `--ae-bg` before
download) · `reset focus` when focused.

## Filters

Same chip row as v1 plus `repository`; active chips take their type's viz hue
as border + dot. Self and the focus node are always visible.
