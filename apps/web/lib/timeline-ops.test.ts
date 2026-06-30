import assert from "node:assert/strict";
import {
  FPS,
  groupWordsIntoCaptions,
  textClipSchema,
  timelineSchema,
  type Framing,
  type TextClip,
  type Timeline,
  type VideoClip,
} from "@clipline/timeline";
import {
  addCaptionClips,
  ensureCaptionTrack,
  splitClip,
  updateClip,
} from "./timeline-ops";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ok - ${name}`);
}

const FRAMING: Framing = { zoom: 1.8, offsetX: -120, offsetY: 64 };

function timelineWithVideoClip(): { timeline: Timeline; clipId: string } {
  const clipId = crypto.randomUUID();
  const clip: VideoClip = {
    id: clipId,
    kind: "video",
    startFrame: 0,
    assetId: crypto.randomUUID(),
    sourceInFrame: 0,
    sourceOutFrame: 60,
    gain: 1,
    colorGrade: { brightness: 0, contrast: 0, saturation: 0, lutAssetId: null },
    framing: FRAMING,
    transitionToNext: { preset: "fade", durationInFrames: 5, direction: "left" },
  };
  const timeline: Timeline = {
    schemaVersion: 1,
    fps: 30,
    width: 1080,
    height: 1920,
    tracks: [{ id: crypto.randomUUID(), kind: "video", name: "V1", clips: [clip] }],
  };
  return { timeline, clipId };
}

test("splitClip carries framing to BOTH halves", () => {
  const { timeline, clipId } = timelineWithVideoClip();
  const next = splitClip(timeline, clipId, 30);
  const clips = next.tracks[0]!.clips as VideoClip[];
  assert.equal(clips.length, 2, "split into two clips");
  for (const c of clips) {
    assert.deepEqual(c.framing, FRAMING, "framing preserved on each half");
  }
  // and they are distinct objects/ids
  assert.notEqual(clips[0]!.id, clips[1]!.id);
  // the left half must drop the transition (its neighbour is now the right
  // half at sourceOut, so the old transitionToNext is no longer valid)
  assert.equal(clips[0]!.transitionToNext, null, "left half drops transition");
  // source window is continuous across the split
  assert.equal(clips[0]!.sourceOutFrame, clips[1]!.sourceInFrame);
});

function timelineWithTextClip(): { timeline: Timeline; clipId: string } {
  const clipId = crypto.randomUUID();
  const clip: TextClip = {
    id: clipId,
    kind: "text",
    startFrame: 0,
    durationInFrames: 90,
    text: "Hello",
    position: { x: 0.5, y: 0.5 },
    fontSize: 64,
    fontFamily: "Geist Sans",
    color: "#FFFFFF",
    fontStyle: { bold: false, italic: false, underline: false },
    align: "center",
    box: {
      bg: { enabled: false, color: "#000000", opacity: 1 },
      border: { enabled: false, color: "#FFFFFF", width: 4 },
      padding: 24,
      cornerRadius: 0,
    },
    animation: {
      preset: "none",
      durationInFrames: 15,
      exit: "none",
      exitDurationInFrames: 15,
    },
  };
  const timeline: Timeline = {
    schemaVersion: 1,
    fps: 30,
    width: 1080,
    height: 1920,
    tracks: [{ id: crypto.randomUUID(), kind: "text", name: "T1", clips: [clip] }],
  };
  return { timeline, clipId };
}

test("updateClip patches position immutably and re-parses", () => {
  const { timeline, clipId } = timelineWithTextClip();
  const next = updateClip(timeline, clipId, { position: { x: 0.25, y: 0.8 } });
  const before = (timeline.tracks[0]!.clips[0] as TextClip).position;
  const after = (next.tracks[0]!.clips[0] as TextClip).position;
  assert.deepEqual(before, { x: 0.5, y: 0.5 }, "original timeline untouched");
  assert.deepEqual(after, { x: 0.25, y: 0.8 }, "patched copy carries new position");
  assert.notEqual(next, timeline, "returns a new timeline");
  // the patched clip is still a valid text clip
  textClipSchema.parse(next.tracks[0]!.clips[0]);
});

test("updateClip patches the background box (independent toggles)", () => {
  const { timeline, clipId } = timelineWithTextClip();
  const orig = timeline.tracks[0]!.clips[0] as TextClip;
  const next = updateClip(timeline, clipId, {
    box: { ...orig.box, bg: { ...orig.box.bg, enabled: true, color: "#112233" } },
  });
  const patched = next.tracks[0]!.clips[0] as TextClip;
  assert.equal(patched.box.bg.enabled, true);
  assert.equal(patched.box.bg.color, "#112233");
  assert.equal(patched.box.border.enabled, false, "border untouched");
  assert.equal(
    (timeline.tracks[0]!.clips[0] as TextClip).box.bg.enabled,
    false,
    "original box untouched",
  );
});

// --- caption ops ------------------------------------------------------------

function emptyTimelineWithVideo(): Timeline {
  return {
    schemaVersion: 1,
    fps: 30,
    width: 1080,
    height: 1920,
    tracks: [{ id: crypto.randomUUID(), kind: "video", name: "V1", clips: [] }],
  };
}

function sampleCaptions() {
  let seq = 0;
  return groupWordsIntoCaptions({
    words: [
      { text: "go", startSec: 0, endSec: 0.4 },
      { text: "viral", startSec: 0.4, endSec: 0.9 },
      { text: "now", startSec: 1.5, endSec: 2.0 },
    ],
    fps: FPS,
    idFor: () => `00000000-0000-4000-8000-${(seq++).toString().padStart(12, "0")}`,
  });
}

test("addCaptionClips creates a caption track and stays schema-valid", () => {
  const timeline = emptyTimelineWithVideo();
  const clips = sampleCaptions();
  const next = addCaptionClips(timeline, clips);
  const track = next.tracks.find((t) => t.kind === "caption");
  assert.ok(track, "a caption track was created");
  assert.equal(track!.clips.length, clips.length);
  // the result must round-trip the canonical schema (no overlaps, valid words)
  timelineSchema.parse(next);
  assert.notEqual(next, timeline, "returns a new timeline");
});

test("addCaptionClips replaces existing captions instead of stacking", () => {
  const timeline = emptyTimelineWithVideo();
  const first = addCaptionClips(timeline, sampleCaptions());
  const replacement = sampleCaptions();
  const second = addCaptionClips(first, replacement);
  const track = second.tracks.find((t) => t.kind === "caption")!;
  assert.equal(track.clips.length, replacement.length, "old captions cleared");
  assert.equal(
    second.tracks.filter((t) => t.kind === "caption").length,
    1,
    "exactly one caption track",
  );
});

test("addCaptionClips with no clips is a no-op (no speech detected)", () => {
  const timeline = emptyTimelineWithVideo();
  const next = addCaptionClips(timeline, []);
  assert.equal(next, timeline, "timeline unchanged");
  assert.equal(next.tracks.some((t) => t.kind === "caption"), false);
});

test("ensureCaptionTrack is idempotent", () => {
  const once = ensureCaptionTrack(emptyTimelineWithVideo());
  const twice = ensureCaptionTrack(once);
  assert.equal(twice, once, "second call is a no-op");
  assert.equal(once.tracks.filter((t) => t.kind === "caption").length, 1);
});

console.log(`\n${passed} timeline-ops tests passed`);
