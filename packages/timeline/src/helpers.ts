import {
  FPS,
  OUTPUT_HEIGHT,
  OUTPUT_WIDTH,
  TIMELINE_SCHEMA_VERSION,
} from "./schema";
import type { Clip, Timeline, Track } from "./types";

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
