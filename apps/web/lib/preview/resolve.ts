import {
  clipEndFrame,
  FPS,
  type AudioClip,
  type Timeline,
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
