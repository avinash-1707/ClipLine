# ADR 0002: Caption per-glyph stroke via a layered-fill ring

- Status: Accepted
- Date: 2026-07-01
- Deciders: Avinash

## Context

The auto-subtitle feature adds animated "viral" karaoke captions: bold,
all-caps, large text with a heavy per-glyph outline, where the currently-spoken
word pops and switches to an accent color. Architecture invariant 2 requires the
Canvas preview and the Remotion export to render identically, and ADR 0001
established that fill-text geometry is parity-safe to sub-pixel precision in the
Chromium render engine because both renderers feed `measureText`-derived widths
through one shared helper.

The heavy outline is the new hazard. The two obvious ways to stroke glyph
outlines diverge between the two engines:

- Canvas `ctx.strokeText` strokes the glyph path with miter/round joins and a
  `lineWidth` that straddles the outline. Its exact coverage depends on the
  canvas rasterizer's join handling.
- CSS `-webkit-text-stroke` paints a stroke centered on the glyph outline with
  different clipping, and `text-shadow` fakes a stroke yet another way.

At the ~8 px stroke a viral caption uses, these produce visibly different
outlines. A caption that looks right in the preview would export with a
heavier/lighter or differently-joined outline — exactly the silent
preview≠export divergence the product forbids.

## Decision

Paint the stroke as a **layered-fill ring** in BOTH renderers, never a native
stroke:

1. A shared pure helper `strokeRingOffsets(strokeWidth)` in
   `packages/timeline/src/helpers.ts` returns a fixed ring of offset vectors
   (12 samples on a circle of radius `strokeWidth`), or an empty array when the
   stroke is disabled.
2. Each renderer draws a **fill** copy of the word in the stroke color at every
   ring offset, then the top fill (active or base color) once on top. The canvas
   uses `fillText` at `(x+dx, y+dy)`; Remotion stacks offset spans (or an
   equivalent fill at the same offsets).

Both engines therefore run only the fill primitive that ADR 0001 already proved
parity-safe. Per-word horizontal placement (`resolveCaptionLineLayout`) and the
active-word selection + pop scale (`resolveCaptionFrame`) are likewise single
shared pure helpers, so nothing about caption rendering is computed twice.

## Consequences

- Stroke parity holds by construction: the outline is fills at deterministic
  offsets, not an engine-specific stroke, so it cannot diverge between preview
  and export.
- The caption font (Anton) is bundled and loaded in both the browser preview and
  Remotion's headless Chromium. Unlike ADR 0001, captions cannot defer the font
  picker — the viral look requires the heavy display face, and parity requires
  the same loaded face on both sides. A system font (e.g. "Impact") is rejected
  because it is not installed in the export renderer's Chromium.
- The ring is heavier than a native stroke (≈12 extra fills per word per frame).
  For short-form captions (a few words on screen) this is well within the
  preview rAF budget and the export render budget. If a future profile shows it
  too costly at extreme caption counts, the documented escape hatch is a
  `text-shadow` ring using the *same* `strokeRingOffsets`, kept identical across
  both engines.
- The active word's pop scales about its own center (canvas translate→scale→
  untranslate; Remotion `inline-block` + `transform: scale()` with
  `transform-origin: center`), which does not reflow neighbors in either engine,
  so the per-word x centers stay equal to `resolveCaptionLineLayout`.
