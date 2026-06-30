import {
  FPS,
  MAX_FRAMING_ZOOM,
  MIN_FRAMING_ZOOM,
  OUTPUT_HEIGHT,
  OUTPUT_WIDTH,
  TIMELINE_SCHEMA_VERSION,
} from "./schema";
import type {
  Clip,
  Framing,
  TextAlign,
  TextAnimation,
  TextBox,
  Timeline,
  Track,
} from "./types";

// ---------------------------------------------------------------------------
// Video framing (pan + zoom) — the single source of truth for how a video clip
// is positioned within the 1080x1920 frame. BOTH the canvas preview and the
// Remotion export call these so the framing is pixel-identical (invariant 2).
// Never duplicate this cover/scale/clamp math anywhere else.
// ---------------------------------------------------------------------------

export interface VideoFramingInput {
  /** Source media intrinsic width (px). */
  srcW: number;
  /** Source media intrinsic height (px). */
  srcH: number;
  /** Output frame width (px) — always OUTPUT_WIDTH. */
  frameW: number;
  /** Output frame height (px) — always OUTPUT_HEIGHT. */
  frameH: number;
  framing: Framing;
}

/** Draw rect for a video, in output-frame (1080x1920) pixel space. */
export interface VideoFramingRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function clampNumber(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}

/**
 * Clamp a framing's offsets so the scaled video always fully covers the frame
 * (no empty/black bars). The per-side slack is `(scaledDim - frameDim) / 2`; at
 * `zoom === 1` the cover scale pins one axis so its slack is 0, which makes any
 * offset on that axis snap to 0 — the "snap to fill" guarantee, for free.
 */
export function clampFraming(input: VideoFramingInput): {
  offsetX: number;
  offsetY: number;
} {
  const { srcW, srcH, frameW, frameH, framing } = input;
  if (srcW <= 0 || srcH <= 0) return { offsetX: 0, offsetY: 0 };
  const cover = Math.max(frameW / srcW, frameH / srcH);
  const scale = cover * clampZoom(framing.zoom);
  const slackX = Math.max(0, (srcW * scale - frameW) / 2);
  const slackY = Math.max(0, (srcH * scale - frameH) / 2);
  // non-finite offsets snap to centered (0) rather than poisoning the rect
  const rawX = Number.isFinite(framing.offsetX) ? framing.offsetX : 0;
  const rawY = Number.isFinite(framing.offsetY) ? framing.offsetY : 0;
  return {
    offsetX: clampNumber(rawX, -slackX, slackX),
    offsetY: clampNumber(rawY, -slackY, slackY),
  };
}

/**
 * Resolve a clip's framing to a draw rect in 1080x1920 space. Offsets are
 * clamped internally so a stale/over-range stored offset can never produce
 * black bars — callers draw the returned rect verbatim. Returns the identity
 * cover rect when source dimensions are unavailable.
 */
export function resolveVideoFraming(
  input: VideoFramingInput,
): VideoFramingRect {
  const { srcW, srcH, frameW, frameH, framing } = input;
  if (srcW <= 0 || srcH <= 0) return { x: 0, y: 0, w: frameW, h: frameH };
  const cover = Math.max(frameW / srcW, frameH / srcH);
  const scale = cover * clampZoom(framing.zoom);
  const w = srcW * scale;
  const h = srcH * scale;
  const { offsetX, offsetY } = clampFraming(input);
  return {
    x: (frameW - w) / 2 + offsetX,
    y: (frameH - h) / 2 + offsetY,
    w,
    h,
  };
}

/** Clamp a zoom into the allowed framing range; non-finite -> floor. */
export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return MIN_FRAMING_ZOOM;
  return clampNumber(zoom, MIN_FRAMING_ZOOM, MAX_FRAMING_ZOOM);
}

/**
 * Re-zoom a clip's framing around a fixed anchor point (in output-frame
 * coords), keeping the source pixel currently under the anchor stationary —
 * the cursor-anchored zoom feel. Returns a fully clamped framing (zoom in
 * range, offsets within slack so the frame stays covered). Anchor at the frame
 * center gives a plain centered zoom (used by the +/- controls).
 */
export function zoomFramingAround(
  input: VideoFramingInput,
  newZoomRaw: number,
  anchorX: number,
  anchorY: number,
): Framing {
  const { srcW, srcH, frameW, frameH, framing } = input;
  const newZoom = clampZoom(newZoomRaw);
  if (srcW <= 0 || srcH <= 0) return { zoom: newZoom, offsetX: 0, offsetY: 0 };
  const cover = Math.max(frameW / srcW, frameH / srcH);
  const oldScale = cover * framing.zoom;
  const newScale = cover * newZoom;
  const old = resolveVideoFraming(input);
  // source pixel under the anchor, kept fixed across the zoom
  const sx = (anchorX - old.x) / oldScale;
  const sy = (anchorY - old.y) / oldScale;
  const newRectX = anchorX - sx * newScale;
  const newRectY = anchorY - sy * newScale;
  const offsetX = newRectX - (frameW - srcW * newScale) / 2;
  const offsetY = newRectY - (frameH - srcH * newScale) / 2;
  const c = clampFraming({
    srcW,
    srcH,
    frameW,
    frameH,
    framing: { zoom: newZoom, offsetX, offsetY },
  });
  return { zoom: newZoom, offsetX: c.offsetX, offsetY: c.offsetY };
}

// ---------------------------------------------------------------------------
// Text layout (box geometry + center) — the parity firewall for text overlays.
// BOTH the canvas preview (drawText) and the Remotion export (TextLayer) feed
// measured per-line widths into this single resolver so the background/border
// box and the snap center are computed once and cannot diverge (ADR 0001).
// Pure math, no DOM. Never duplicate this geometry anywhere else.
// ---------------------------------------------------------------------------

/** Line-height multiple applied to fontSize for multi-line text. */
export const TEXT_LINE_HEIGHT = 1.2;

export interface TextLayoutInput {
  /** Per-line advance width in output px, measured by the consumer. */
  lineWidths: number[];
  /** Font size in output px. */
  fontSize: number;
  /** Line-height multiple (use TEXT_LINE_HEIGHT). */
  lineHeightRatio: number;
  align: TextAlign;
  box: TextBox;
  /** Normalized center anchor (clip.position). */
  position: { x: number; y: number };
  /** Output frame width (OUTPUT_WIDTH). */
  frameW: number;
  /** Output frame height (OUTPUT_HEIGHT). */
  frameH: number;
}

/** One line's draw anchor in output px (paired with its horizontal align). */
export interface TextLine {
  x: number;
  y: number;
  align: TextAlign;
}

/** Text box + per-line geometry in output-frame (1080x1920) px. */
export interface TextLayout {
  /** Padded box rect (the bg fill rect). Border is stroked OUTSIDE this rect. */
  box: { x: number; y: number; w: number; h: number };
  /** Geometric center of the box — the value the snap detector targets. */
  center: { x: number; y: number };
  /** Content (text bbox) size before padding. */
  content: { w: number; h: number };
  /** Per-line baseline-middle anchor + horizontal align. */
  lines: TextLine[];
  /** Resolved padding (0 when neither fill nor border is enabled). */
  padding: number;
}

/**
 * Compute the text box rect, geometric center, and per-line placement from
 * measured line widths. The ONLY place text box/center geometry is computed.
 * Consumed by the canvas engine (box fill + line placement), the Remotion
 * layer (box div + center), the drag hit-test, and the snap/guide renderer.
 */
export function resolveTextLayout(input: TextLayoutInput): TextLayout {
  const { lineWidths, fontSize, lineHeightRatio, align, box, position } = input;
  const lineCount = Math.max(lineWidths.length, 1);
  const contentW = lineWidths.length ? Math.max(0, ...lineWidths) : 0;
  const lineStep = fontSize * lineHeightRatio;
  const contentH = lineCount * lineStep;
  const hasBox = box.bg.enabled || box.border.enabled;
  const pad = hasBox ? box.padding : 0;
  const boxW = contentW + 2 * pad;
  const boxH = contentH + 2 * pad;
  const cx = position.x * input.frameW;
  const cy = position.y * input.frameH;
  const boxX = cx - boxW / 2;
  const boxY = cy - boxH / 2;
  const contentLeft = cx - contentW / 2;
  const lines: TextLine[] = [];
  for (let i = 0; i < lineCount; i++) {
    const y = boxY + pad + (i + 0.5) * lineStep;
    const x =
      align === "left"
        ? contentLeft
        : align === "right"
          ? contentLeft + contentW
          : cx;
    lines.push({ x, y, align });
  }
  return {
    box: { x: boxX, y: boxY, w: boxW, h: boxH },
    center: { x: cx, y: cy },
    content: { w: contentW, h: contentH },
    lines,
    padding: pad,
  };
}

export interface SnapInput {
  /** Proposed normalized center (the in-flight drag position). */
  position: { x: number; y: number };
  /** Snap threshold in OUTPUT px (caller converts from screen px). */
  thresholdPx: number;
  frameW: number;
  frameH: number;
}

export interface SnapResult {
  /** Position after snapping; axes outside the threshold pass through. */
  position: { x: number; y: number };
  /** Active centerline guides: `vertical` marks the x-center, `horizontal`
   * marks the y-center. */
  guides: { horizontal: boolean; vertical: boolean };
}

/**
 * Snap a text center to the frame's horizontal/vertical centerline when within
 * `thresholdPx`. v1: frame centerlines only (x=0.5, y=0.5). Pure; consumed by
 * the drag handler (to quantize position) and the guide renderer (to know which
 * centerline to flash). Snaps the center, so it must consume the same center
 * definition as resolveTextLayout.
 */
export function snapToCenterlines(input: SnapInput): SnapResult {
  const { position, thresholdPx, frameW, frameH } = input;
  let { x, y } = position;
  let vertical = false;
  let horizontal = false;
  if (Math.abs(position.x * frameW - frameW / 2) <= thresholdPx) {
    x = 0.5;
    vertical = true;
  }
  if (Math.abs(position.y * frameH - frameH / 2) <= thresholdPx) {
    y = 0.5;
    horizontal = true;
  }
  return { position: { x, y }, guides: { horizontal, vertical } };
}

/**
 * Overshooting ease-out: rises past 1 near the end then settles back to exactly
 * 1 at p=1. Used by the scale-pop entrance for a subtle bounce. Shared so the
 * canvas preview and Remotion export use identical curve math.
 */
export function easeOutBack(p: number, overshoot = 1.70158): number {
  const c1 = overshoot;
  const c3 = c1 + 1;
  const x = p - 1;
  return 1 + c3 * x ** 3 + c1 * x ** 2;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

// ---------------------------------------------------------------------------
// Text animation (entrance + exit). Lives here, not in apps/web, because BOTH
// the canvas preview and the Remotion export must run identical math and the
// timeline package is the one module both are guaranteed to import (same reason
// resolveVideoFraming lives here). Graphics keep their own entranceState.
// ---------------------------------------------------------------------------

export interface TextAnimationState {
  alpha: number;
  /** Horizontal entrance/exit offset in output px. */
  offsetX: number;
  /** Vertical entrance/exit offset in output px. */
  offsetY: number;
  scale: number;
  /** Gaussian blur radius in output px. */
  blur: number;
  /** Raw entrance progress 0..1 (drives typewriter + word-reveal). */
  progress: number;
}

/**
 * Composite text animation state at a local frame: the entrance preset blended
 * with an optional exit over the clip's tail. Pure and shared so preview and
 * export never drift. `clipDurationInFrames` is the text clip's own duration.
 */
export function resolveTextAnimation(
  anim: TextAnimation,
  localFrame: number,
  clipDurationInFrames: number,
): TextAnimationState {
  const p =
    anim.preset === "none"
      ? 1
      : clamp01(localFrame / anim.durationInFrames);
  const easeOut = 1 - (1 - p) ** 3;

  const s: TextAnimationState = {
    alpha: 1,
    offsetX: 0,
    offsetY: 0,
    scale: 1,
    blur: 0,
    progress: p,
  };

  switch (anim.preset) {
    case "fade-in":
      s.alpha = easeOut;
      break;
    case "slide-up":
      s.alpha = easeOut;
      s.offsetY = (1 - easeOut) * 60;
      break;
    case "pop":
      s.alpha = Math.min(p * 2, 1);
      s.scale = 0.8 + 0.2 * easeOut;
      break;
    case "blur-in":
      s.alpha = easeOut;
      s.blur = (1 - easeOut) * 12;
      break;
    case "slide-in-right":
      s.alpha = easeOut;
      s.offsetX = (1 - easeOut) * 120;
      break;
    case "scale-pop":
      s.alpha = Math.min(p * 2, 1);
      // subtle overshoot, peaks ~1.04 then settles to exactly 1
      s.scale = 0.6 + 0.4 * easeOutBack(p);
      break;
    // "typewriter" and "word-reveal" reveal via `progress` in the renderer;
    // "none" stays at the static defaults above.
  }

  // Exit blends over the clip's final `exitDurationInFrames`, completing on the
  // clip's last rendered frame (localFrame === clipDurationInFrames - 1).
  if (anim.exit !== "none") {
    const exitStart = clipDurationInFrames - anim.exitDurationInFrames;
    const denom = Math.max(anim.exitDurationInFrames - 1, 1);
    const ep = clamp01((localFrame - exitStart) / denom);
    const easeIn = ep ** 3;
    switch (anim.exit) {
      case "fade-out":
        s.alpha *= 1 - easeIn;
        break;
      case "slide-out-up":
        s.alpha *= 1 - ep;
        s.offsetY -= easeIn * 60;
        break;
      case "scale-out":
        s.alpha *= 1 - easeIn;
        s.scale *= 1 - 0.2 * easeIn;
        break;
    }
  }

  return s;
}

/**
 * Per-word reveal alpha for the "word-reveal" entrance: words light up left to
 * right as entrance `progress` advances. Shared by both renderers so the
 * staggering is identical.
 */
export function wordRevealAlpha(
  progress: number,
  wordIndex: number,
  wordCount: number,
): number {
  if (wordCount <= 0) return 1;
  return clamp01(progress * wordCount - wordIndex);
}

/** Duration of a clip in frames, regardless of clip kind. */
export function clipDurationInFrames(clip: Clip): number {
  return clip.kind === "text" || clip.kind === "graphic"
    ? clip.durationInFrames
    : clip.sourceOutFrame - clip.sourceInFrame;
}

/** Timeline frame at which a clip ends (exclusive). */
export function clipEndFrame(clip: Clip): number {
  return clip.startFrame + clipDurationInFrames(clip);
}

/** Total timeline duration: the end of the last clip across all tracks. */
export function timelineDurationInFrames(timeline: Timeline): number {
  let end = 0;
  for (const track of timeline.tracks) {
    for (const clip of track.clips) {
      end = Math.max(end, clipEndFrame(clip));
    }
  }
  return end;
}

/**
 * Remove every reference to `assetId` from a timeline: drops media clips whose
 * source is the asset, and clears any color-grade LUT that points at it.
 * Returns the original timeline unchanged when nothing referenced the asset.
 */
export function stripAssetFromTimeline(
  timeline: Timeline,
  assetId: string,
): Timeline {
  let changed = false;
  const tracks = timeline.tracks.map((track) => {
    let trackChanged = false;
    const clips = (track.clips as Clip[]).flatMap((clip) => {
      if (
        (clip.kind === "video" || clip.kind === "audio") &&
        clip.assetId === assetId
      ) {
        trackChanged = true;
        return [];
      }
      if (clip.kind === "video" && clip.colorGrade.lutAssetId === assetId) {
        trackChanged = true;
        return [
          { ...clip, colorGrade: { ...clip.colorGrade, lutAssetId: null } },
        ];
      }
      return [clip];
    });
    if (!trackChanged) return track;
    changed = true;
    return { ...track, clips } as Track;
  });
  return changed ? { ...timeline, tracks } : timeline;
}

/** A valid empty timeline for a freshly created project. */
export function createEmptyTimeline(): Timeline {
  return {
    schemaVersion: TIMELINE_SCHEMA_VERSION,
    fps: FPS,
    width: OUTPUT_WIDTH,
    height: OUTPUT_HEIGHT,
    tracks: [],
  };
}
