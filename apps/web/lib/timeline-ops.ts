import {
  clipDurationInFrames,
  clipEndFrame,
  graphicParamsSchema,
  MAX_DURATION_IN_FRAMES,
  type AudioClip,
  type Clip,
  type Timeline,
  type Track,
  type VideoClip,
} from "@clipline/timeline";

/**
 * Pure timeline transformations. Every function takes a timeline and returns
 * a new timeline; nothing here touches React, the store, or the network.
 * All operations preserve the schema invariants: clips on a track are sorted
 * by startFrame and never overlap, and nothing extends past the duration cap.
 */

export interface AssetMeta {
  id: string;
  kind: "video" | "audio";
  durationInFrames: number;
}

function sortClips<T extends Clip>(clips: T[]): T[] {
  return [...clips].sort((a, b) => a.startFrame - b.startFrame);
}

/** First gap on the track, at or after `wantedStart`, that fits `duration`. */
export function findFreeStart(
  track: Track,
  wantedStart: number,
  duration: number,
): number | null {
  const clips = sortClips(track.clips as Clip[]);
  let candidate = Math.max(0, wantedStart);

  for (const clip of clips) {
    const start = clip.startFrame;
    const end = clipEndFrame(clip);
    if (candidate + duration <= start) break; // fits before this clip
    if (candidate < end) candidate = end; // overlapped — slide right
  }
  if (candidate + duration > MAX_DURATION_IN_FRAMES) return null;
  return candidate;
}

function mapTrack(
  timeline: Timeline,
  trackId: string,
  fn: (track: Track) => Track,
): Timeline {
  return {
    ...timeline,
    tracks: timeline.tracks.map((t) => (t.id === trackId ? fn(t) : t)),
  };
}

function findClip(
  timeline: Timeline,
  clipId: string,
): { track: Track; clip: Clip } | null {
  for (const track of timeline.tracks) {
    const clip = (track.clips as Clip[]).find((c) => c.id === clipId);
    if (clip) return { track, clip };
  }
  return null;
}

/** Place a media asset on a track. Returns null if there is no room. */
export function addClipFromAsset(
  timeline: Timeline,
  trackId: string,
  asset: AssetMeta,
  wantedStart: number,
): Timeline | null {
  const track = timeline.tracks.find((t) => t.id === trackId);
  if (!track || track.kind !== asset.kind) return null;

  const duration = asset.durationInFrames;
  const start = findFreeStart(track, wantedStart, duration);
  if (start == null) return null;

  const base = {
    id: crypto.randomUUID(),
    startFrame: start,
    assetId: asset.id,
    sourceInFrame: 0,
    sourceOutFrame: duration,
    gain: 1,
  };
  const clip: Clip =
    track.kind === "video"
      ? {
          ...base,
          kind: "video",
          colorGrade: {
            brightness: 0,
            contrast: 0,
            saturation: 0,
            lutAssetId: null,
          },
          transitionToNext: null,
        }
      : { ...base, kind: "audio" };

  return mapTrack(timeline, trackId, (t) => ({
    ...t,
    clips: sortClips([...(t.clips as Clip[]), clip]) as never,
  }));
}

/** Move a clip along its track (and optionally to another same-kind track). */
export function moveClip(
  timeline: Timeline,
  clipId: string,
  targetTrackId: string,
  wantedStart: number,
): Timeline | null {
  const found = findClip(timeline, clipId);
  if (!found) return null;
  const target = timeline.tracks.find((t) => t.id === targetTrackId);
  if (!target || target.kind !== found.track.kind) return null;

  const duration = clipDurationInFrames(found.clip);
  // exclude the moving clip from collision when staying on the same track
  const collisionTrack: Track =
    target.id === found.track.id
      ? ({
          ...target,
          clips: (target.clips as Clip[]).filter((c) => c.id !== clipId),
        } as Track)
      : target;
  const start = findFreeStart(collisionTrack, wantedStart, duration);
  if (start == null) return null;

  const moved = { ...found.clip, startFrame: start };
  let next = mapTrack(timeline, found.track.id, (t) => ({
    ...t,
    clips: (t.clips as Clip[]).filter((c) => c.id !== clipId) as never,
  }));
  next = mapTrack(next, targetTrackId, (t) => ({
    ...t,
    clips: sortClips([...(t.clips as Clip[]), moved as never]) as never,
  }));
  return next;
}

/**
 * Trim a clip edge. For media clips this adjusts the source window; for text
 * clips the duration. Clamped so the clip keeps >= 1 frame, stays inside the
 * asset, and never collides with neighbours.
 */
export function trimClip(
  timeline: Timeline,
  clipId: string,
  edge: "start" | "end",
  deltaFrames: number,
  assetDuration?: number,
): Timeline {
  const found = findClip(timeline, clipId);
  if (!found || deltaFrames === 0) return timeline;
  const { track, clip } = found;

  const clips = sortClips(track.clips as Clip[]);
  const index = clips.findIndex((c) => c.id === clipId);
  const prev = index > 0 ? clips[index - 1] : null;
  const next = index < clips.length - 1 ? clips[index + 1] : null;

  let updated: Clip;
  if (clip.kind === "text" || clip.kind === "graphic") {
    if (edge === "start") {
      const minStart = prev ? clipEndFrame(prev) : 0;
      const maxStart = clip.startFrame + clip.durationInFrames - 1;
      const start = Math.min(
        Math.max(clip.startFrame + deltaFrames, minStart),
        maxStart,
      );
      updated = {
        ...clip,
        startFrame: start,
        durationInFrames: clip.durationInFrames - (start - clip.startFrame),
      };
    } else {
      const maxEnd = next ? next.startFrame : MAX_DURATION_IN_FRAMES;
      const end = Math.min(
        Math.max(clipEndFrame(clip) + deltaFrames, clip.startFrame + 1),
        maxEnd,
      );
      updated = { ...clip, durationInFrames: end - clip.startFrame };
    }
  } else {
    const media = clip as VideoClip | AudioClip;
    if (edge === "start") {
      const minStart = prev ? clipEndFrame(prev) : 0;
      const lowestIn = -media.sourceInFrame; // can't reveal before source 0
      const highestIn = clipDurationInFrames(media) - 1;
      const delta = Math.min(
        Math.max(deltaFrames, lowestIn, minStart - media.startFrame),
        highestIn,
      );
      updated = {
        ...media,
        startFrame: media.startFrame + delta,
        sourceInFrame: media.sourceInFrame + delta,
      };
    } else {
      const maxEnd = next ? next.startFrame : MAX_DURATION_IN_FRAMES;
      const sourceMax = assetDuration ?? media.sourceOutFrame;
      const end = Math.min(
        Math.max(clipEndFrame(media) + deltaFrames, media.startFrame + 1),
        maxEnd,
        media.startFrame + (sourceMax - media.sourceInFrame),
      );
      updated = {
        ...media,
        sourceOutFrame: media.sourceInFrame + (end - media.startFrame),
      };
    }
  }

  return mapTrack(timeline, track.id, (t) => ({
    ...t,
    clips: sortClips(
      (t.clips as Clip[]).map((c) => (c.id === clipId ? updated : c)),
    ) as never,
  }));
}

/** Split a clip at a timeline frame. No-op if the frame is not inside it. */
export function splitClip(
  timeline: Timeline,
  clipId: string,
  atFrame: number,
): Timeline {
  const found = findClip(timeline, clipId);
  if (!found) return timeline;
  const { track, clip } = found;
  const start = clip.startFrame;
  const end = clipEndFrame(clip);
  if (atFrame <= start || atFrame >= end) return timeline;

  const offset = atFrame - start;
  let left: Clip;
  let right: Clip;
  if (clip.kind === "text") {
    left = { ...clip, durationInFrames: offset };
    right = {
      ...clip,
      id: crypto.randomUUID(),
      startFrame: atFrame,
      durationInFrames: clip.durationInFrames - offset,
      // the continuation must not replay the entrance animation
      animation: { ...clip.animation, preset: "none" },
    };
  } else if (clip.kind === "graphic") {
    left = { ...clip, durationInFrames: offset };
    const graphic =
      "animation" in clip.graphic
        ? { ...clip.graphic, animation: { ...clip.graphic.animation, preset: "none" as const } }
        : clip.graphic;
    right = {
      ...clip,
      id: crypto.randomUUID(),
      startFrame: atFrame,
      durationInFrames: clip.durationInFrames - offset,
      graphic,
    };
  } else {
    const media = clip as VideoClip | AudioClip;
    left = {
      ...media,
      sourceOutFrame: media.sourceInFrame + offset,
      ...(media.kind === "video" ? { transitionToNext: null } : {}),
    };
    right = {
      ...media,
      id: crypto.randomUUID(),
      startFrame: atFrame,
      sourceInFrame: media.sourceInFrame + offset,
    };
  }

  return mapTrack(timeline, track.id, (t) => ({
    ...t,
    clips: sortClips([
      ...(t.clips as Clip[]).filter((c) => c.id !== clipId),
      left,
      right,
    ]) as never,
  }));
}

/**
 * Patch properties of a clip in place (gain, color grade, text styling,
 * transitions…). Does not move or resize — use moveClip/trimClip for that.
 */
export function updateClip(
  timeline: Timeline,
  clipId: string,
  patch: Partial<Clip>,
): Timeline {
  const found = findClip(timeline, clipId);
  if (!found) return timeline;
  return mapTrack(timeline, found.track.id, (t) => ({
    ...t,
    clips: (t.clips as Clip[]).map((c) =>
      c.id === clipId ? ({ ...c, ...patch, id: c.id, kind: c.kind } as Clip) : c,
    ) as never,
  }));
}

/** Default duration for a new text clip: 3 seconds. */
export const DEFAULT_TEXT_DURATION = 90;

/** Add a text clip on the (first) text track at the wanted frame. */
export function addTextClip(
  timeline: Timeline,
  wantedStart: number,
  text = "Your text",
): Timeline | null {
  const track = timeline.tracks.find((t) => t.kind === "text");
  if (!track) return null;
  const start = findFreeStart(track, wantedStart, DEFAULT_TEXT_DURATION);
  if (start == null) return null;

  const clip: Clip = {
    id: crypto.randomUUID(),
    kind: "text",
    startFrame: start,
    durationInFrames: DEFAULT_TEXT_DURATION,
    text,
    position: { x: 0.5, y: 0.5 },
    fontSize: 64,
    fontFamily: "Geist Sans",
    color: "#FFFFFF",
    animation: { preset: "none", durationInFrames: 15 },
  };
  return mapTrack(timeline, track.id, (t) => ({
    ...t,
    clips: sortClips([...(t.clips as Clip[]), clip]) as never,
  }));
}

/** Guarantee a text track exists (older projects predate it). */
export function ensureTextTrack(timeline: Timeline): Timeline {
  if (timeline.tracks.some((t) => t.kind === "text")) return timeline;
  return {
    ...timeline,
    tracks: [
      { id: crypto.randomUUID(), kind: "text", name: "T1", clips: [] },
      ...timeline.tracks,
    ],
  };
}

/** Default duration for a new graphic clip: 4 seconds. */
export const DEFAULT_GRAPHIC_DURATION = 120;

export type GraphicPreset = Clip extends infer C
  ? C extends { kind: "graphic"; graphic: { preset: infer P } }
    ? P
    : never
  : never;

/** Add a graphic clip (preset defaults from the schema) on the graphic track. */
export function addGraphicClip(
  timeline: Timeline,
  wantedStart: number,
  preset: GraphicPreset,
): Timeline | null {
  const track = timeline.tracks.find((t) => t.kind === "graphic");
  if (!track) return null;
  const start = findFreeStart(track, wantedStart, DEFAULT_GRAPHIC_DURATION);
  if (start == null) return null;

  // schema defaults fill in the per-preset params
  const graphic = graphicParamsSchema.parse({ preset });
  const clip: Clip = {
    id: crypto.randomUUID(),
    kind: "graphic",
    startFrame: start,
    durationInFrames: DEFAULT_GRAPHIC_DURATION,
    opacity: preset === "overlay" ? 0.35 : 1,
    graphic,
  };
  return mapTrack(timeline, track.id, (t) => ({
    ...t,
    clips: sortClips([...(t.clips as Clip[]), clip]) as never,
  }));
}

/** Guarantee a graphic track exists (older projects predate it). */
export function ensureGraphicTrack(timeline: Timeline): Timeline {
  if (timeline.tracks.some((t) => t.kind === "graphic")) return timeline;
  const textIndex = timeline.tracks.findIndex((t) => t.kind === "text");
  const tracks = [...timeline.tracks];
  // graphics sit under text, above video
  tracks.splice(textIndex + 1, 0, {
    id: crypto.randomUUID(),
    kind: "graphic",
    name: "G1",
    clips: [],
  });
  return { ...timeline, tracks };
}

/**
 * The clip immediately after this one on the same track with no gap —
 * the only legal target for a transition.
 */
export function adjacentNextClip(
  timeline: Timeline,
  clipId: string,
): Clip | null {
  const found = findClip(timeline, clipId);
  if (!found) return null;
  const clips = sortClips(found.track.clips as Clip[]);
  const index = clips.findIndex((c) => c.id === clipId);
  const next = clips[index + 1];
  if (!next) return null;
  return next.startFrame === clipEndFrame(clips[index]!) ? next : null;
}

export function removeClip(timeline: Timeline, clipId: string): Timeline {
  return {
    ...timeline,
    tracks: timeline.tracks.map((t) => ({
      ...t,
      clips: (t.clips as Clip[]).filter((c) => c.id !== clipId) as never,
    })),
  };
}

/** Default track set: text, graphics, two video tracks, audio. */
export function withDefaultTracks(timeline: Timeline): Timeline {
  if (timeline.tracks.length > 0) {
    return ensureGraphicTrack(ensureTextTrack(timeline));
  }
  return {
    ...timeline,
    tracks: [
      { id: crypto.randomUUID(), kind: "text", name: "T1", clips: [] },
      { id: crypto.randomUUID(), kind: "graphic", name: "G1", clips: [] },
      { id: crypto.randomUUID(), kind: "video", name: "V2", clips: [] },
      { id: crypto.randomUUID(), kind: "video", name: "V1", clips: [] },
      { id: crypto.randomUUID(), kind: "audio", name: "A1", clips: [] },
    ],
  };
}
