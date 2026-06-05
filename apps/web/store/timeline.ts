import {
  MAX_DURATION_IN_FRAMES,
  timelineDurationInFrames,
  type Clip,
  type Timeline,
} from "@clipline/timeline";
import { create } from "zustand";
import {
  addClipFromAsset,
  addTextClip,
  moveClip,
  removeClip,
  splitClip,
  trimClip,
  updateClip,
  withDefaultTracks,
  type AssetMeta,
} from "@/lib/timeline-ops";

export type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

interface TimelineStore {
  projectId: string | null;
  timeline: Timeline | null;
  /** Asset metadata needed by timeline ops and clip rendering. */
  assetsById: Record<string, AssetMeta>;
  playheadFrame: number;
  selectedClipId: string | null;
  /** Horizontal zoom in pixels per frame. */
  pxPerFrame: number;
  saveState: SaveState;
  isPlaying: boolean;

  load: (projectId: string, timeline: Timeline) => void;
  registerAssets: (assets: AssetMeta[]) => void;
  setPlayhead: (frame: number) => void;
  select: (clipId: string | null) => void;
  setZoom: (pxPerFrame: number) => void;
  setSaveState: (s: SaveState) => void;
  setPlaying: (playing: boolean) => void;

  addClip: (trackId: string, assetId: string, startFrame: number) => void;
  moveClip: (clipId: string, trackId: string, startFrame: number) => void;
  trimClip: (clipId: string, edge: "start" | "end", delta: number) => void;
  splitSelectedAtPlayhead: () => void;
  removeSelected: () => void;
  updateClip: (clipId: string, patch: Partial<Clip>) => void;
  addTextAtPlayhead: () => void;
}

function mutate(
  state: TimelineStore,
  next: Timeline | null,
): Partial<TimelineStore> {
  if (!next || next === state.timeline) return {};
  return { timeline: next, saveState: "dirty" };
}

export const useTimelineStore = create<TimelineStore>((set, get) => ({
  projectId: null,
  timeline: null,
  assetsById: {},
  playheadFrame: 0,
  selectedClipId: null,
  pxPerFrame: 2,
  saveState: "idle",
  isPlaying: false,

  load: (projectId, timeline) => {
    const withTracks = withDefaultTracks(timeline);
    set({
      projectId,
      timeline: withTracks,
      playheadFrame: 0,
      selectedClipId: null,
      // a fresh project gets default tracks persisted on first edit
      saveState: withTracks === timeline ? "idle" : "dirty",
    });
  },

  registerAssets: (assets) =>
    set((s) => ({
      assetsById: {
        ...s.assetsById,
        ...Object.fromEntries(assets.map((a) => [a.id, a])),
      },
    })),

  setPlayhead: (frame) =>
    set({
      playheadFrame: Math.max(0, Math.min(frame, MAX_DURATION_IN_FRAMES)),
    }),

  select: (clipId) => set({ selectedClipId: clipId }),

  setZoom: (pxPerFrame) =>
    set({ pxPerFrame: Math.max(0.5, Math.min(8, pxPerFrame)) }),

  setSaveState: (saveState) => set({ saveState }),

  setPlaying: (isPlaying) => set({ isPlaying }),

  addClip: (trackId, assetId, startFrame) =>
    set((s) => {
      const asset = s.assetsById[assetId];
      if (!s.timeline || !asset) return {};
      return mutate(s, addClipFromAsset(s.timeline, trackId, asset, startFrame));
    }),

  moveClip: (clipId, trackId, startFrame) =>
    set((s) =>
      s.timeline
        ? mutate(s, moveClip(s.timeline, clipId, trackId, startFrame))
        : {},
    ),

  trimClip: (clipId, edge, delta) =>
    set((s) => {
      if (!s.timeline) return {};
      const clip = s.timeline.tracks
        .flatMap((t) => t.clips as Clip[])
        .find((c) => c.id === clipId);
      const assetDuration =
        clip && clip.kind !== "text"
          ? s.assetsById[clip.assetId]?.durationInFrames
          : undefined;
      return mutate(s, trimClip(s.timeline, clipId, edge, delta, assetDuration));
    }),

  splitSelectedAtPlayhead: () =>
    set((s) => {
      if (!s.timeline || !s.selectedClipId) return {};
      return mutate(s, splitClip(s.timeline, s.selectedClipId, s.playheadFrame));
    }),

  removeSelected: () =>
    set((s) => {
      if (!s.timeline || !s.selectedClipId) return {};
      return {
        ...mutate(s, removeClip(s.timeline, s.selectedClipId)),
        selectedClipId: null,
      };
    }),

  updateClip: (clipId, patch) =>
    set((s) =>
      s.timeline ? mutate(s, updateClip(s.timeline, clipId, patch)) : {},
    ),

  addTextAtPlayhead: () =>
    set((s) => {
      if (!s.timeline) return {};
      const next = addTextClip(s.timeline, s.playheadFrame);
      if (!next) return {};
      // select the clip just added so the inspector opens on it
      const track = next.tracks.find((t) => t.kind === "text")!;
      const added = (track.clips as Clip[]).find(
        (c) => !(s.timeline!.tracks.find((t) => t.kind === "text")
          ?.clips as Clip[] | undefined)?.some((p) => p.id === c.id),
      );
      return { ...mutate(s, next), selectedClipId: added?.id ?? null };
    }),
}));

/** The currently selected clip, or null. */
export function selectSelectedClip(s: {
  timeline: Timeline | null;
  selectedClipId: string | null;
}): Clip | null {
  if (!s.timeline || !s.selectedClipId) return null;
  return (
    s.timeline.tracks
      .flatMap((t) => t.clips as Clip[])
      .find((c) => c.id === s.selectedClipId) ?? null
  );
}

/** Total duration of the current timeline, for ruler width and time display. */
export function selectDuration(s: { timeline: Timeline | null }): number {
  return s.timeline ? timelineDurationInFrames(s.timeline) : 0;
}
