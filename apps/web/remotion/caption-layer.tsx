import {
  OUTPUT_HEIGHT,
  OUTPUT_WIDTH,
  resolveCaptionFrame,
  resolveCaptionLineLayout,
  strokeRingOffsets,
  type CaptionClip,
} from "@clipline/timeline";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { loadFont } from "@remotion/google-fonts/Anton";

/**
 * Load Anton into Remotion's headless Chromium at module evaluation time.
 * `loadFont()` returns a promise; Remotion's `delayRender` / `continueRender`
 * mechanism ensures the composition doesn't render until all registered font
 * promises resolve, so this single call is sufficient.
 */
const { fontFamily: ANTON_FAMILY } = loadFont();

/**
 * Caption clip renderer for the Remotion export. Mirrors `drawCaption` in
 * engine.ts EXACTLY — same helper calls, same geometry, same stroke approach —
 * so preview and export are pixel-identical (ADR 0001).
 *
 * Parity contract:
 * - Per-word active/scale state: `resolveCaptionFrame` (shared pure math).
 * - Per-word x-centers: `resolveCaptionLineLayout` fed measured advance widths.
 * - Advance widths: measured via a hidden offscreen element sized at OUTPUT_WIDTH
 *   using the same Anton font string as the canvas, matching the measured-advance
 *   contract proved parity-safe in ADR 0001.
 * - Stroke ring: the same `strokeRingOffsets` offsets, painted as offset `<span>`
 *   copies (fill primitive, NOT text-stroke/text-shadow) — identical to the
 *   canvas fill copies.
 * - Scale: per-word `transform: scale(s)` with `transform-origin: center` so the
 *   scaled word grows/shrinks about its own center without reflowing neighbors,
 *   matching the canvas translate→scale→translate-back.
 * - No CSS transition on scale: driven JS-side per frame from `useCurrentFrame()`.
 * - Export always renders full motion (reduced-motion is preview-only).
 */
export function CaptionLayer({ clip }: { clip: CaptionClip }) {
  const localFrame = useCurrentFrame();
  const { style } = clip;

  const captionState = resolveCaptionFrame(clip, localFrame);

  // Build display words (uppercase if requested).
  const displayWords = clip.words.map((w) =>
    style.uppercase ? w.text.toUpperCase() : w.text,
  );

  // Measure advance widths using Remotion's canvas measurement helper.
  // We use a hidden <canvas> here so we can call ctx.measureText with the
  // exact same font string the export Chromium will use.
  const wordWidths = measureWordWidths(displayWords, style.fontSize, ANTON_FAMILY);
  const spaceWidth = measureWordWidths([" "], style.fontSize, ANTON_FAMILY)[0] ?? 0;

  // Per-word x-centers: identical to the canvas resolver.
  const lineLayout = resolveCaptionLineLayout({ wordWidths, spaceWidth });

  // Stroke ring offsets (shared with engine.ts).
  const ringOffsets = strokeRingOffsets(style.strokeWidth);

  // Line center in normalized % space (position is normalized 0..1).
  // We position the container at clip.position, then shift left by half
  // totalWidth so the line is centered — same math as the canvas lineLeft.
  const lineWidthPx = lineLayout.totalWidth;

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {/*
       * Row container: centered on clip.position. absolute positioning in
       * OUTPUT_WIDTH x OUTPUT_HEIGHT space maps normalized coords directly
       * to px because the composition size IS 1080x1920.
       */}
      <div
        style={{
          position: "absolute",
          left: clip.position.x * OUTPUT_WIDTH - lineWidthPx / 2,
          top: clip.position.y * OUTPUT_HEIGHT,
          transform: "translateY(-50%)",
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          // pre prevents word-wrapping inside the flex row
          whiteSpace: "pre",
        }}
      >
        {lineLayout.words.map((wordLayout) => {
          const wordIndex = wordLayout.index;
          const isActive = captionState.active[wordIndex] ?? false;
          const scale = captionState.scales[wordIndex] ?? 1;
          const displayText = displayWords[wordIndex] ?? "";
          if (!displayText) return null;

          const fillColor = isActive ? style.activeColor : style.color;

          return (
            <WordSpan
              key={wordIndex}
              text={displayText}
              scale={scale}
              fillColor={fillColor}
              strokeColor={style.strokeColor}
              fontSize={style.fontSize}
              fontFamily={ANTON_FAMILY}
              ringOffsets={ringOffsets}
              // Space after each word except the last
              trailingSpace={wordIndex < clip.words.length - 1 ? spaceWidth : 0}
            />
          );
        })}
      </div>
    </AbsoluteFill>
  );
}

interface WordSpanProps {
  text: string;
  scale: number;
  fillColor: string;
  strokeColor: string;
  fontSize: number;
  fontFamily: string;
  ringOffsets: { dx: number; dy: number }[];
  trailingSpace: number;
}

/**
 * Single word with layered-fill stroke ring. The scale is applied via CSS
 * transform with `transform-origin: center` so the word grows/shrinks about
 * its own center without shifting neighbors in the flex row — matching the
 * canvas translate→scale→translate-back pattern. The stroke ring is painted
 * as absolutely-positioned offset copies of the same text span in strokeColor,
 * stacked below the top fill copy. No CSS text-stroke or text-shadow (they
 * diverge across canvas vs Chromium).
 */
function WordSpan({
  text,
  scale,
  fillColor,
  strokeColor,
  fontSize,
  fontFamily,
  ringOffsets,
  trailingSpace,
}: WordSpanProps) {
  const sharedTextStyle: React.CSSProperties = {
    fontFamily,
    fontSize,
    fontWeight: 400,
    lineHeight: 1,
    whiteSpace: "pre",
    display: "inline-block",
  };

  return (
    // Outer wrapper holds the word's advance width slot; trailing space is a
    // separate inline-block so the flex gap matches the canvas spaceWidth exactly.
    <>
      <span
        style={{
          display: "inline-block",
          position: "relative",
          // transform-origin:center matches the canvas translate→scale→translate-back
          transform: `scale(${scale})`,
          transformOrigin: "center",
          // No CSS transition — scale is driven per-frame by JS (no CSS easing)
          transition: "none",
        }}
      >
        {/* Stroke ring: one absolutely-positioned copy per ring offset in strokeColor */}
        {ringOffsets.map(({ dx, dy }, ki) => (
          <span
            key={ki}
            aria-hidden
            style={{
              ...sharedTextStyle,
              position: "absolute",
              top: dy,
              left: dx,
              color: strokeColor,
              userSelect: "none",
            }}
          >
            {text}
          </span>
        ))}
        {/* Top fill copy */}
        <span
          style={{
            ...sharedTextStyle,
            position: "relative",
            color: fillColor,
          }}
        >
          {text}
        </span>
      </span>
      {trailingSpace > 0 && (
        <span
          aria-hidden
          style={{ display: "inline-block", width: trailingSpace }}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Advance-width measurement (canvas-based, matches engine.ts measureText)
// ---------------------------------------------------------------------------

/**
 * Measure advance widths for a list of strings using a hidden OffscreenCanvas
 * (or a regular canvas in environments that lack OffscreenCanvas). This is the
 * same measurement primitive the preview engine uses (`ctx.measureText`), so
 * the widths fed into `resolveCaptionLineLayout` are numerically identical
 * between the canvas renderer and the Remotion export — the parity firewall.
 *
 * Called once per component render (cheap: Remotion renders are frame-isolated).
 */
const _measureCtx: CanvasRenderingContext2D | null = (() => {
  if (typeof document === "undefined") return null;
  try {
    const c = document.createElement("canvas");
    c.width = OUTPUT_WIDTH;
    c.height = 1;
    return c.getContext("2d");
  } catch {
    return null;
  }
})();

function measureWordWidths(
  words: string[],
  fontSize: number,
  fontFamily: string,
): number[] {
  if (!_measureCtx) return words.map(() => 0);
  _measureCtx.font = `400 ${fontSize}px ${fontFamily}`;
  return words.map((w) => _measureCtx!.measureText(w).width);
}
