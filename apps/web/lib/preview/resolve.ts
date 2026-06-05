import {
  clipEndFrame,
  FPS,
  type AudioClip,
  type TextClip,
  type Timeline,
  type Transition,
  type VideoClip,
} from "@clipline/timeline";

/**
 * Pure frame-resolution helpers for the preview engine: which clip is
 * visible and which clips are audible at a given timeline frame.
 */

export interface ActiveVideo {
  clip: VideoClip;
  /** Position inside the source media, in seconds. */
  sourceTimeSec: number;
}

export interface ActiveAudio {
  clip: VideoClip | AudioClip;
  sourceTimeSec: number;
}

function sourceTimeSec(
  clip: VideoClip | AudioClip,
  frame: number,
): number {
  return (clip.sourceInFrame + (frame - clip.startFrame)) / FPS;
}

/**
 * Topmost video clip covering the frame. Track order in the timeline is
 * top-down, so the first video track with a covering clip wins.
 */
export function resolveVideo(
  timeline: Timeline,
  frame: number,
): ActiveVideo | null {
  for (const track of timeline.tracks) {
    if (track.kind !== "video") continue;
    const clip = track.clips.find(
      (c) => frame >= c.startFrame && frame < clipEndFrame(c),
    );
    if (clip) return { clip, sourceTimeSec: sourceTimeSec(clip, frame) };
  }
  return null;
}

export interface VideoLayers {
  /** The clip that owns the frame. */
  current: ActiveVideo;
  /**
   * Set during a transition window: the previous clip is still on screen,
   * blending out. `progress` runs 0→1 across the window.
   */
  outgoing: ActiveVideo | null;
  transition: Transition | null;
  progress: number;
}

/**
 * Like resolveVideo, but transition-aware. A transition stored on clip A
 * (`transitionToNext`) plays over the FIRST `durationInFrames` frames of the
 * adjacent clip B; during that window A's tail keeps advancing past its
 * sourceOut (clamped by the engine to the asset's length).
 */
export function resolveVideoLayers(
  timeline: Timeline,
  frame: number,
): VideoLayers | null {
  for (const track of timeline.tracks) {
    if (track.kind !== "video") continue;
    const clips = track.clips;
    const index = clips.findIndex(
      (c) => frame >= c.startFrame && frame < clipEndFrame(c),
    );
    if (index === -1) continue;
    const clip = clips[index]!;
    const current: ActiveVideo = {
      clip,
      sourceTimeSec: sourceTimeSec(clip, frame),
    };

    const prev = index > 0 ? clips[index - 1] : null;
    const transition = prev?.transitionToNext ?? null;
    if (
      prev &&
      transition &&
      prev.startFrame + (prev.sourceOutFrame - prev.sourceInFrame) ===
        clip.startFrame &&
      frame < clip.startFrame + transition.durationInFrames
    ) {
      const intoWindow = frame - clip.startFrame;
      return {
        current,
        outgoing: {
          clip: prev,
          // tail continues past sourceOut; engine clamps to asset length
          sourceTimeSec: (prev.sourceOutFrame + intoWindow) / FPS,
        },
        transition,
        progress: (intoWindow + 1) / transition.durationInFrames,
      };
    }
    return { current, outgoing: null, transition: null, progress: 1 };
  }
  return null;
}

export interface ActiveText {
  clip: TextClip;
  /** Frames since the clip began (drives entrance animations). */
  localFrame: number;
}

/** All text clips covering the frame, top track first. */
export function resolveTexts(timeline: Timeline, frame: number): ActiveText[] {
  const active: ActiveText[] = [];
  for (const track of timeline.tracks) {
    if (track.kind !== "text") continue;
    for (const clip of track.clips) {
      if (frame >= clip.startFrame && frame < clipEndFrame(clip)) {
        active.push({ clip, localFrame: frame - clip.startFrame });
      }
    }
  }
  return active;
}

/** Every clip with audio covering the frame: video clips plus audio clips. */
export function resolveAudio(
  timeline: Timeline,
  frame: number,
): ActiveAudio[] {
  const active: ActiveAudio[] = [];
  for (const track of timeline.tracks) {
    if (track.kind === "text") continue;
    for (const clip of track.clips) {
      if (frame >= clip.startFrame && frame < clipEndFrame(clip)) {
        active.push({ clip, sourceTimeSec: sourceTimeSec(clip, frame) });
      }
    }
  }
  return active;
}

/** CSS filter string for a video clip's color grade — identical math will be
 * passed to Remotion at export (preview/export parity decision). */
export function gradeToFilter(clip: VideoClip): string {
  const { brightness, contrast, saturation } = clip.colorGrade;
  if (brightness === 0 && contrast === 0 && saturation === 0) return "none";
  return [
    `brightness(${1 + brightness})`,
    `contrast(${1 + contrast})`,
    `saturate(${1 + saturation})`,
  ].join(" ");
}
