import {
  FPS,
  OUTPUT_HEIGHT,
  OUTPUT_WIDTH,
  TIMELINE_SCHEMA_VERSION,
} from "./schema";
import type { Clip, Timeline } from "./types";

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
