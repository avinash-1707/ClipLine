import { z } from "zod";

// ---------------------------------------------------------------------------
// Fixed output parameters (architecture invariant: 1080x1920 vertical, H.264)
// ---------------------------------------------------------------------------

export const FPS = 30;
export const OUTPUT_WIDTH = 1080;
export const OUTPUT_HEIGHT = 1920;
/** Export limit: 120 seconds at 30 fps. */
export const MAX_DURATION_IN_FRAMES = 120 * FPS;

export const TIMELINE_SCHEMA_VERSION = 1;

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/** Non-negative integer frame index at the fixed project fps. */
const frame = z.int().nonnegative();

/** Positive integer frame count. */
const frameCount = z.int().positive();

/** Linear gain multiplier; 1 = unity, 0 = silent. */
const gain = z.number().min(0).max(2);

/** Normalized coordinate relative to the 1080x1920 stage (0..1 on each axis). */
const normalizedPosition = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
});

// ---------------------------------------------------------------------------
// Color grading (per video clip)
// ---------------------------------------------------------------------------

export const colorGradeSchema = z.object({
  /** -1..1, 0 = neutral. */
  brightness: z.number().min(-1).max(1).default(0),
  /** -1..1, 0 = neutral. */
  contrast: z.number().min(-1).max(1).default(0),
  /** -1..1, 0 = neutral, -1 = grayscale. */
  saturation: z.number().min(-1).max(1).default(0),
  /** Asset id of an ingested LUT, or null for no LUT. */
  lutAssetId: z.uuid().nullable().default(null),
});

// ---------------------------------------------------------------------------
// Transitions (between adjacent clips on the same video track)
// ---------------------------------------------------------------------------

export const transitionPresetSchema = z.enum(["fade", "wipe", "slide"]);

export const transitionDirectionSchema = z.enum([
  "left",
  "right",
  "up",
  "down",
]);

export const transitionSchema = z.object({
  preset: transitionPresetSchema,
  durationInFrames: frameCount,
  /** Used by wipe and slide; ignored by fade. */
  direction: transitionDirectionSchema.default("left"),
});

// ---------------------------------------------------------------------------
// Text animation presets
// ---------------------------------------------------------------------------

export const textAnimationPresetSchema = z.enum([
  "none",
  "fade-in",
  "slide-up",
  "pop",
  "typewriter",
]);

export const textAnimationSchema = z.object({
  preset: textAnimationPresetSchema.default("none"),
  /** Frames the entrance animation runs for (within the clip's duration). */
  durationInFrames: frameCount.default(15),
});

// ---------------------------------------------------------------------------
// Clips (discriminated union on `kind`)
// ---------------------------------------------------------------------------

const clipBase = z.object({
  id: z.uuid(),
  /** Timeline position of the clip's first frame. */
  startFrame: frame,
});

export const videoClipSchema = clipBase.extend({
  kind: z.literal("video"),
  assetId: z.uuid(),
  /** Trim in-point in the source media, in frames. */
  sourceInFrame: frame,
  /** Trim out-point (exclusive) in the source media, in frames. */
  sourceOutFrame: frameCount,
  /** Gain applied to the clip's own audio. */
  gain: gain.default(1),
  colorGrade: colorGradeSchema.default({
    brightness: 0,
    contrast: 0,
    saturation: 0,
    lutAssetId: null,
  }),
  /** Transition into the next adjacent clip on the same track, if any. */
  transitionToNext: transitionSchema.nullable().default(null),
});

export const audioClipSchema = clipBase.extend({
  kind: z.literal("audio"),
  assetId: z.uuid(),
  sourceInFrame: frame,
  sourceOutFrame: frameCount,
  gain: gain.default(1),
});

export const textClipSchema = clipBase.extend({
  kind: z.literal("text"),
  text: z.string().min(1),
  durationInFrames: frameCount,
  position: normalizedPosition.default({ x: 0.5, y: 0.5 }),
  /** Pixel size relative to the 1080x1920 stage. */
  fontSize: z.int().min(8).max(400).default(64),
  /** CSS font family; defaults to the UI sans stack. */
  fontFamily: z.string().min(1).default("Geist Sans"),
  /** CSS color value rendered on the stage (content, not UI chrome). */
  color: z.string().min(1).default("#FFFFFF"),
  animation: textAnimationSchema.default({
    preset: "none",
    durationInFrames: 15,
  }),
});

export const clipSchema = z.discriminatedUnion("kind", [
  videoClipSchema,
  audioClipSchema,
  textClipSchema,
]);

// ---------------------------------------------------------------------------
// Tracks (discriminated union on `kind`; a track only holds clips of its kind)
// ---------------------------------------------------------------------------

/**
 * Track-level validation: clips sorted by startFrame and non-overlapping.
 * Source-trimmed clips (video/audio) derive duration from the trim window;
 * text clips carry an explicit duration.
 */
function clipDuration(clip: z.infer<typeof clipSchema>): number {
  return clip.kind === "text"
    ? clip.durationInFrames
    : clip.sourceOutFrame - clip.sourceInFrame;
}

function refineTrackClips(
  clips: readonly z.infer<typeof clipSchema>[],
  ctx: z.core.$RefinementCtx,
): void {
  for (let i = 0; i < clips.length; i++) {
    const clip = clips[i]!;
    if (clip.kind !== "text" && clip.sourceOutFrame <= clip.sourceInFrame) {
      ctx.addIssue({
        code: "custom",
        message: `clip ${clip.id}: sourceOutFrame must be greater than sourceInFrame`,
        path: [i, "sourceOutFrame"],
      });
    }
    if (i === 0) continue;
    const prev = clips[i - 1]!;
    const prevEnd = prev.startFrame + clipDuration(prev);
    if (clip.startFrame < prevEnd) {
      ctx.addIssue({
        code: "custom",
        message: `clip ${clip.id} overlaps previous clip ${prev.id} (starts at ${clip.startFrame}, previous ends at ${prevEnd})`,
        path: [i, "startFrame"],
      });
    }
  }
}

const trackBase = z.object({
  id: z.uuid(),
  name: z.string().min(1),
});

export const videoTrackSchema = trackBase.extend({
  kind: z.literal("video"),
  clips: z.array(videoClipSchema).superRefine(refineTrackClips),
});

export const audioTrackSchema = trackBase.extend({
  kind: z.literal("audio"),
  clips: z.array(audioClipSchema).superRefine(refineTrackClips),
});

export const textTrackSchema = trackBase.extend({
  kind: z.literal("text"),
  clips: z.array(textClipSchema).superRefine(refineTrackClips),
});

export const trackSchema = z.discriminatedUnion("kind", [
  videoTrackSchema,
  audioTrackSchema,
  textTrackSchema,
]);

// ---------------------------------------------------------------------------
// Timeline specification (the persisted JSONB document)
// ---------------------------------------------------------------------------

export const timelineSchema = z.object({
  schemaVersion: z.literal(TIMELINE_SCHEMA_VERSION),
  fps: z.literal(FPS),
  width: z.literal(OUTPUT_WIDTH),
  height: z.literal(OUTPUT_HEIGHT),
  tracks: z.array(trackSchema),
});
