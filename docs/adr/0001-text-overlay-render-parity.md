# ADR 0001: Text overlay render parity via measured line widths

- Status: Accepted
- Date: 2026-06-30
- Deciders: Avinash

## Context

The text-overlay editing upgrade adds background/border boxes, drag-on-stage
positioning, and center-alignment snap guides to text clips. Architecture
invariant 2 requires the live Canvas preview and the Remotion export to be
visually identical, because both consume the same timeline specification.

The two renderers measure text differently. The canvas preview engine
(`apps/web/lib/preview/engine.ts`) sizes text with `ctx.measureText`. The
Remotion layer (`apps/web/remotion/text-layer.tsx`) is a React component whose
box would naturally auto-size through the CSS box model. A background rectangle
or border drawn around the text depends on the measured box geometry, so any
disagreement between `measureText` width and CSS layout width would shift the
box a few pixels between preview and export. That divergence is invisible until
a user exports and notices the caption box moved, and it erodes the product's
core promise that preview equals export.

## Decision

1. Add one shared pure helper, `resolveTextLayout`, in
   `packages/timeline/src/helpers.ts`, mirroring the `resolveVideoFraming`
   precedent. It takes measured per-line widths plus the style fields and
   returns the box rect, the geometric center, the content size, and per-line
   placement, all in 1080x1920 output-pixel space.
2. Both renderers feed `measureText`-derived line widths into that helper. The
   Remotion layer sizes its box in explicit pixels from the returned rect rather
   than relying on CSS auto-sizing.
3. The snap detector and the guide renderer consume the same computed center
   from `resolveTextLayout`, so the snap target is identical to what both
   renderers draw.

## Evidence

A spike compared `ctx.measureText(line).width` against the CSS rendered content
width of a span with the same font string, run in headless Chrome 149 (the same
engine family Remotion renders with). Seven cases spanning regular, bold,
italic, large display sizes, a long sentence, the generic `sans-serif` stack,
and mixed punctuation:

| Case | canvas px | css px | delta |
|------|-----------|--------|-------|
| short regular 64 | 156.469 | 156.469 | 0.000 |
| bold 64 | 156.469 | 156.469 | 0.000 |
| italic 64 | 344.906 | 344.906 | 0.000 |
| long sentence 48 | 621.375 | 621.375 | 0.000 |
| wide caps 96 | 826.688 | 826.688 | 0.000 |
| sans-serif 64 | 522.750 | 522.750 | 0.000 |
| mixed punct 56 | 567.164 | 567.172 | -0.008 |

Maximum absolute delta 0.008 px, maximum relative delta 0.0014 percent. The two
measurement paths agree to sub-pixel precision in the render engine.

## Consequences

- Box geometry parity holds by construction: both renderers draw from the same
  measured widths through the same helper, so they cannot diverge regardless of
  how CSS would otherwise lay out the box.
- This rides the existing assumption that the preview runs in a Chromium-family
  browser, the same assumption already accepted for CSS-filter color grading and
  for pan/zoom framing parity (decided 2026-06-06). A non-Chromium preview
  browser could measure glyphs slightly differently, which is an accepted
  limitation for the local single-user desktop target.
- The border is drawn fully outside the padded box rect so the rect math stays
  border-independent. Canvas strokes outward from the box edge; Remotion uses
  `box-sizing: content-box`.
- A font-family picker stays deferred. The `fontFamily` field remains in the
  schema at its default, because custom fonts must load identically in the
  browser and in headless Chromium before they can preserve this parity.
