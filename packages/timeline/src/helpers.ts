import {
  FPS,
  MAX_CLIPS_PER_TRACK,
  MAX_FRAMING_ZOOM,
  MAX_WORDS_PER_CAPTION,
  MIN_FRAMING_ZOOM,
  OUTPUT_HEIGHT,
  OUTPUT_WIDTH,
  TIMELINE_SCHEMA_VERSION,
} from "./schema";
import type {
  CaptionClip,
  CaptionStyle,
  CaptionWord,
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

// ---------------------------------------------------------------------------
// Captions (auto karaoke subtitles) — the parity firewall for caption render.
// All caption math lives here so the canvas preview (drawCaption) and the
// Remotion export (CaptionLayer) run identical code: which word is active at a
// frame, the per-word pop scale, the per-word horizontal placement within a
// line, and the layered-fill stroke ring. Pure, no DOM. The per-word x-offsets
// reuse the same measured-advance-width contract proved parity-safe for text
// (ADR 0001): the consumer measures word + space advance widths and feeds them
// in; this resolver never measures glyphs itself.
// ---------------------------------------------------------------------------

/** Active-word index + per-word pop scale at a clip-local frame. */
export interface CaptionFrameState {
  /** Index of the currently-spoken word, or -1 before first / after last. */
  activeIndex: number;
  /** Render scale per word (pop curve for the active word, 1 otherwise). */
  scales: number[];
  /** Whether each word is the active word. */
  active: boolean[];
}

/** Frames the active-word pop onset runs before settling to activeScale. */
export const CAPTION_POP_ONSET_FRAMES = 3;
/** Frames the pop spends settling from its peak down to activeScale. */
export const CAPTION_POP_SETTLE_FRAMES = 2;
/** How far past activeScale the pop peaks before settling. */
export const CAPTION_POP_OVERSHOOT = 0.04;

/**
 * Scale of the active word `framesSinceStart` frames after it became active:
 * pops 1 -> peak over the onset, settles peak -> activeScale, then holds. Pure
 * and shared so the canvas and Remotion pops are frame-identical. Callers that
 * honor reduced-motion skip this and hold scale at 1.
 */
export function captionPopScale(
  framesSinceStart: number,
  activeScale: number,
): number {
  const peak = activeScale + CAPTION_POP_OVERSHOOT;
  if (framesSinceStart <= 0) return 1;
  if (framesSinceStart < CAPTION_POP_ONSET_FRAMES) {
    const t = framesSinceStart / CAPTION_POP_ONSET_FRAMES;
    return 1 + (peak - 1) * (1 - (1 - t) ** 3);
  }
  const settleEnd = CAPTION_POP_ONSET_FRAMES + CAPTION_POP_SETTLE_FRAMES;
  if (framesSinceStart < settleEnd) {
    const t = (framesSinceStart - CAPTION_POP_ONSET_FRAMES) /
      CAPTION_POP_SETTLE_FRAMES;
    return peak - (peak - activeScale) * t;
  }
  return activeScale;
}

/**
 * Karaoke state at a clip-local frame: which word is active and the per-word
 * pop scale. Word frames are a gapless partition (endFrame[i] === startFrame of
 * the next active span), so at most one word is active per frame and the canvas
 * preview and Remotion export select the identical word by construction.
 */
export function resolveCaptionFrame(
  clip: CaptionClip,
  localFrame: number,
): CaptionFrameState {
  const scales: number[] = [];
  const active: boolean[] = [];
  let activeIndex = -1;
  for (let i = 0; i < clip.words.length; i++) {
    const w = clip.words[i]!;
    const isActive = localFrame >= w.startFrame && localFrame < w.endFrame;
    if (isActive) activeIndex = i;
    active.push(isActive);
    scales.push(
      isActive
        ? captionPopScale(localFrame - w.startFrame, clip.style.activeScale)
        : 1,
    );
  }
  return { activeIndex, scales, active };
}

/** One word's horizontal placement within a caption line, in output px. */
export interface CaptionWordLayout {
  index: number;
  /** Word center x, relative to the line's left edge. */
  centerX: number;
  /** Measured advance width of the word. */
  width: number;
}

/**
 * Per-word horizontal placement within ONE caption line from measured advance
 * widths. The single place per-word x is computed: the canvas walks these
 * centers and the Remotion inline flow reproduces them (same measured-advance
 * contract as text). Words are separated by one `spaceWidth`. The active word's
 * pop scales about its own `centerX`, so neighbors never reflow.
 */
export function resolveCaptionLineLayout(input: {
  wordWidths: number[];
  spaceWidth: number;
}): { totalWidth: number; words: CaptionWordLayout[] } {
  const { wordWidths, spaceWidth } = input;
  const words: CaptionWordLayout[] = [];
  let cursor = 0;
  for (let i = 0; i < wordWidths.length; i++) {
    const width = Math.max(0, wordWidths[i]!);
    words.push({ index: i, centerX: cursor + width / 2, width });
    cursor += width + (i < wordWidths.length - 1 ? spaceWidth : 0);
  }
  return { totalWidth: cursor, words };
}

/**
 * Sample offsets (output px) for the layered-fill stroke ring. Both renderers
 * draw a fill copy of the text at each offset BEFORE the top fill, producing a
 * faux per-glyph stroke that is pixel-identical across canvas and Chromium CSS
 * (it is just fills — the primitive ADR 0001 already proved parity-safe). A
 * native canvas stroke or `-webkit-text-stroke` would diverge. Empty when the
 * stroke is disabled.
 */
export function strokeRingOffsets(
  strokeWidth: number,
  samples = 12,
): { dx: number; dy: number }[] {
  if (!Number.isFinite(strokeWidth) || strokeWidth <= 0) return [];
  const offsets: { dx: number; dy: number }[] = [];
  for (let k = 0; k < samples; k++) {
    const angle = (k / samples) * Math.PI * 2;
    offsets.push({
      dx: Math.cos(angle) * strokeWidth,
      dy: Math.sin(angle) * strokeWidth,
    });
  }
  return offsets;
}

/** Thrown when a transcript would produce more caption clips than the track cap. */
export class CaptionLimitError extends Error {
  constructor(public readonly count: number) {
    super(
      `transcript would produce ${count} caption clips, over the ${MAX_CLIPS_PER_TRACK} per-track limit`,
    );
    this.name = "CaptionLimitError";
  }
}

/** A raw STT word with second-based timing (the worker's output shape). */
export interface SttWord {
  text: string;
  startSec: number;
  endSec: number;
}

export interface CaptionGroupingInput {
  words: SttWord[];
  /** Project fps (FPS); used to convert seconds -> frames. */
  fps: number;
  /** Max words shown on one line before breaking. Default 2. */
  maxWordsPerLine?: number;
  /** Break a line when the silent gap before a word exceeds this. Default 0.4s. */
  pauseGapSec?: number;
  /** Frames a caption lingers after its last word ends. Default 6. */
  tailPadFrames?: number;
  style?: Partial<CaptionStyle>;
  position?: { x: number; y: number };
  align?: TextAlign;
  /** Id factory (kept injectable for deterministic tests). */
  idFor?: (lineIndex: number) => string;
}

const CAPTION_DEFAULTS = {
  maxWordsPerLine: 2,
  pauseGapSec: 0.4,
  tailPadFrames: 6,
} as const;

const CAPTION_STYLE_FALLBACK: CaptionStyle = {
  fontSize: 88,
  fontFamily: "Anton",
  color: "#FFFFFF",
  activeColor: "#F5C842",
  strokeColor: "#000000",
  strokeWidth: 8,
  activeScale: 1.14,
  uppercase: true,
};

/**
 * Group STT words (seconds) into caption clips — one clip per displayed line.
 * Breaks a line at `maxWordsPerLine` OR when the inter-word gap exceeds
 * `pauseGapSec` (a natural phrase boundary). Converts seconds to frames with
 * `Math.round` and derives each word's endFrame from the next word's start
 * (gapless, no 1-frame flicker), clamping so words never collide and clips
 * never overlap the next line. Throws CaptionLimitError past the track cap.
 */
export function groupWordsIntoCaptions(
  input: CaptionGroupingInput,
): CaptionClip[] {
  const maxWords = Math.min(
    MAX_WORDS_PER_CAPTION,
    Math.max(1, input.maxWordsPerLine ?? CAPTION_DEFAULTS.maxWordsPerLine),
  );
  const pauseGap = input.pauseGapSec ?? CAPTION_DEFAULTS.pauseGapSec;
  const tailPad = input.tailPadFrames ?? CAPTION_DEFAULTS.tailPadFrames;
  const style: CaptionStyle = { ...CAPTION_STYLE_FALLBACK, ...input.style };
  const position = input.position ?? { x: 0.5, y: 0.78 };
  const align: TextAlign = input.align ?? "center";
  const idFor = input.idFor ?? (() => crypto.randomUUID());
  const fps = input.fps;

  // Defensive sort: the gapless/no-overlap invariants assume time-ordered
  // words. Deepgram returns them sorted, but the contract doesn't require it.
  const sortedWords = [...input.words].sort((a, b) => a.startSec - b.startSec);

  // 1. Partition words into lines.
  const lines: SttWord[][] = [];
  let current: SttWord[] = [];
  for (let i = 0; i < sortedWords.length; i++) {
    const w = sortedWords[i]!;
    if (current.length > 0) {
      const prev = current[current.length - 1]!;
      const gap = w.startSec - prev.endSec;
      if (current.length >= maxWords || gap > pauseGap) {
        lines.push(current);
        current = [];
      }
    }
    current.push(w);
  }
  if (current.length > 0) lines.push(current);

  if (lines.length > MAX_CLIPS_PER_TRACK) {
    throw new CaptionLimitError(lines.length);
  }

  // 2. Build a caption clip per line, frame-quantized and gapless.
  const clips: CaptionClip[] = [];
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li]!;
    const clipStartAbs = Math.round(line[0]!.startSec * fps);
    const nextLineStartAbs =
      li + 1 < lines.length
        ? Math.round(lines[li + 1]![0]!.startSec * fps)
        : Infinity;
    // Frames this clip may occupy before the next line's clip starts. A word
    // whose spoken end runs past the next line (overlapping/long speech) must
    // be capped here, or the clip would overlap the next and the timeline
    // schema would reject the whole document. Infinity for the last line.
    const cap = nextLineStartAbs - clipStartAbs;
    const hasCap = Number.isFinite(cap) && cap >= 1;

    const words: CaptionWord[] = [];
    let prevEnd = 0;
    for (let wi = 0; wi < line.length; wi++) {
      const w = line[wi]!;
      let startFrame = Math.max(
        prevEnd,
        Math.round(w.startSec * fps) - clipStartAbs,
      );
      // keep at least one frame for this word before the next clip starts
      if (hasCap) startFrame = Math.min(startFrame, cap - 1);
      // Active until the next word starts; the last word until its own end.
      const rawEnd =
        wi + 1 < line.length
          ? Math.round(line[wi + 1]!.startSec * fps) - clipStartAbs
          : Math.round(w.endSec * fps) - clipStartAbs;
      let endFrame = Math.max(startFrame + 1, rawEnd);
      if (hasCap) endFrame = Math.min(endFrame, cap);
      words.push({ text: w.text, startFrame, endFrame });
      prevEnd = endFrame;
    }

    // Clip lasts to its last word's end + tail pad, never past the next line.
    const lastEnd = words[words.length - 1]!.endFrame;
    const padded = lastEnd + tailPad;
    const durationInFrames = hasCap
      ? Math.max(1, Math.min(padded, cap))
      : Math.max(1, padded);

    clips.push({
      id: idFor(li),
      kind: "caption",
      startFrame: clipStartAbs,
      words,
      durationInFrames,
      position,
      align,
      style,
    });
  }
  return clips;
}

/**
 * Apply edited caption text back onto the word array. Editing word text (fixing
 * a misheard word) is in v1 scope; per-word re-timing is not. So when the word
 * count is unchanged the original per-word timing is preserved exactly; when the
 * user adds/removes words the clip's span is redistributed evenly and gaplessly.
 * Empty input keeps the existing words (the schema requires at least one).
 */
export function editCaptionWords(
  words: CaptionWord[],
  text: string,
): CaptionWord[] {
  const tokens = text
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  if (tokens.length === 0 || words.length === 0) return words;
  if (tokens.length === words.length) {
    return words.map((w, i) => ({ ...w, text: tokens[i]! }));
  }
  // Count changed: redistribute the span evenly. Carry prevEnd so the partition
  // stays gapless AND every word keeps >= 1 frame even when the span is shorter
  // than the token count (where an independent floor would overlap neighbours).
  const start0 = words[0]!.startFrame;
  const span = Math.max(1, words[words.length - 1]!.endFrame - start0);
  let prevEnd = start0;
  return tokens.map((t, i) => {
    const startFrame = prevEnd;
    const target = start0 + Math.round((span * (i + 1)) / tokens.length);
    const endFrame = Math.max(startFrame + 1, target);
    prevEnd = endFrame;
    return { text: t, startFrame, endFrame };
  });
}

/** Duration of a clip in frames, regardless of clip kind. */
export function clipDurationInFrames(clip: Clip): number {
  return clip.kind === "text" ||
    clip.kind === "graphic" ||
    clip.kind === "caption"
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
