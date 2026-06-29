import {
  FPS,
  MAX_FRAMING_ZOOM,
  MIN_FRAMING_ZOOM,
  OUTPUT_HEIGHT,
  OUTPUT_WIDTH,
  TIMELINE_SCHEMA_VERSION,
} from "./schema";
import type { Clip, Framing, Timeline, Track } from "./types";

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
