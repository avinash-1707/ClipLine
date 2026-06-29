import assert from "node:assert/strict";
import type { Framing, Timeline, VideoClip } from "@clipline/timeline";
import { splitClip } from "./timeline-ops";

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

console.log(`\n${passed} timeline-ops tests passed`);
