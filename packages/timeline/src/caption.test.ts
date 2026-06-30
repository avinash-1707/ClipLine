import assert from "node:assert/strict";
import { FPS } from "./schema";
import {
  CaptionLimitError,
  captionClipSchema,
  captionPopScale,
  captionTrackSchema,
  clipDurationInFrames,
  clipSchema,
  editCaptionWords,
  groupWordsIntoCaptions,
  resolveCaptionFrame,
  resolveCaptionLineLayout,
  strokeRingOffsets,
  type CaptionClip,
  type CaptionWord,
  type SttWord,
} from "./index";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ok - ${name}`);
}

let uuidSeq = 0;
function uid(): string {
  const n = (uuidSeq++).toString(16).padStart(12, "0");
  return `00000000-0000-4000-8000-${n}`;
}

function words(...specs: [string, number, number][]): SttWord[] {
  return specs.map(([text, startSec, endSec]) => ({ text, startSec, endSec }));
}

function group(ws: SttWord[], over: Partial<Parameters<typeof groupWordsIntoCaptions>[0]> = {}) {
  return groupWordsIntoCaptions({ words: ws, fps: FPS, idFor: uid, ...over });
}

// --- groupWordsIntoCaptions -------------------------------------------------

test("empty words -> no clips", () => {
  assert.deepEqual(group([]), []);
});

test("breaks a line at maxWordsPerLine (default 2)", () => {
  const clips = group(
    words(["a", 0, 0.4], ["b", 0.4, 0.8], ["c", 0.8, 1.2], ["d", 1.2, 1.6]),
  );
  assert.equal(clips.length, 2);
  assert.equal(clips[0]!.words.length, 2);
  assert.equal(clips[1]!.words.length, 2);
});

test("breaks a line on a pause gap > pauseGapSec", () => {
  // gap between b(ends 0.5) and c(starts 1.2) is 0.7 > 0.4 default
  const clips = group(words(["a", 0, 0.25], ["b", 0.25, 0.5], ["c", 1.2, 1.5]), {
    maxWordsPerLine: 5,
  });
  assert.equal(clips.length, 2, "pause split the second line off");
  assert.equal(clips[0]!.words.length, 2);
  assert.equal(clips[1]!.words.length, 1);
});

test("word frames are clip-relative, gapless, integer", () => {
  const clips = group(words(["one", 1.0, 1.5], ["two", 1.5, 2.0]));
  const c = clips[0]!;
  assert.equal(c.startFrame, Math.round(1.0 * FPS));
  assert.equal(c.words[0]!.startFrame, 0, "first word starts at clip-local 0");
  // gapless within the line: endFrame[i] === startFrame[i+1]
  assert.equal(c.words[0]!.endFrame, c.words[1]!.startFrame);
  for (const w of c.words) {
    assert.ok(Number.isInteger(w.startFrame) && Number.isInteger(w.endFrame));
    assert.ok(w.endFrame > w.startFrame, "endFrame > startFrame");
  }
});

test("clip lingers a tail pad past the last word, clamped off the next line", () => {
  const clips = group(words(["a", 0, 0.3], ["b", 5.0, 5.3]), {
    maxWordsPerLine: 1,
    tailPadFrames: 6,
  });
  const a = clips[0]!;
  const lastEnd = a.words[a.words.length - 1]!.endFrame;
  // next line starts far away, so the full tail pad applies
  assert.equal(a.durationInFrames, lastEnd + 6);
});

test("tail pad never makes a clip overlap the next line", () => {
  // two adjacent lines 1 frame apart; pad must clamp so they don't overlap
  const clips = group(words(["a", 0, 0.02], ["b", 0.04, 0.1]), {
    maxWordsPerLine: 1,
    tailPadFrames: 30,
  });
  assert.equal(clips.length, 2);
  const end0 = clips[0]!.startFrame + clips[0]!.durationInFrames;
  assert.ok(end0 <= clips[1]!.startFrame, "clip 0 does not overlap clip 1");
});

test("throws CaptionLimitError past the per-track cap", () => {
  const many: SttWord[] = [];
  for (let i = 0; i < 1001; i++) many.push({ text: "w", startSec: i, endSec: i + 0.5 });
  assert.throws(() => group(many, { maxWordsPerLine: 1 }), CaptionLimitError);
});

test("grouped clips validate against captionTrackSchema (no overlap, defaults)", () => {
  const clips = group(
    words(["go", 0, 0.4], ["viral", 0.4, 0.9], ["now", 1.5, 2.0]),
  );
  const track = captionTrackSchema.parse({
    id: uid(),
    name: "CAP",
    kind: "caption",
    clips,
  });
  assert.equal(track.clips.length, clips.length);
});

// --- resolveCaptionFrame: the single-active gapless partition (PARITY CORE) --

function clipFrom(ws: SttWord[]): CaptionClip {
  return group(ws, { maxWordsPerLine: 10 })[0]!;
}

test("at most one word active on every frame across the whole clip", () => {
  const clip = clipFrom(words(["a", 0, 0.3], ["b", 0.3, 0.7], ["c", 0.7, 1.1]));
  const dur = clipDurationInFrames(clip);
  for (let f = 0; f < dur; f++) {
    const s = resolveCaptionFrame(clip, f);
    const activeCount = s.active.filter(Boolean).length;
    assert.ok(activeCount <= 1, `frame ${f}: ${activeCount} active words`);
    assert.equal(s.activeIndex, s.active.indexOf(true));
  }
});

test("exactly one word active across the spoken span; gapless handoff", () => {
  const clip = clipFrom(words(["a", 0, 0.3], ["b", 0.3, 0.7], ["c", 0.7, 1.1]));
  const lastEnd = clip.words[clip.words.length - 1]!.endFrame;
  for (let f = 0; f < lastEnd; f++) {
    const s = resolveCaptionFrame(clip, f);
    assert.equal(
      s.active.filter(Boolean).length,
      1,
      `frame ${f} inside spoken span must have exactly one active word`,
    );
  }
  // active index advances monotonically by exactly 1 at each boundary
  let prev = -1;
  for (let f = 0; f < lastEnd; f++) {
    const idx = resolveCaptionFrame(clip, f).activeIndex;
    assert.ok(idx >= prev, "active index never goes backwards");
    prev = idx;
  }
});

test("activeIndex is -1 after the last word ends", () => {
  const clip = clipFrom(words(["a", 0, 0.3], ["b", 0.3, 0.7]));
  const lastEnd = clip.words[clip.words.length - 1]!.endFrame;
  assert.equal(resolveCaptionFrame(clip, lastEnd).activeIndex, -1);
});

// --- captionPopScale --------------------------------------------------------

test("pop scale: 1 at start, peaks above activeScale, settles to activeScale", () => {
  assert.equal(captionPopScale(0, 1.14), 1);
  const peak = captionPopScale(3, 1.14); // end of onset
  assert.ok(peak > 1.14, "peaks above activeScale");
  assert.ok(Math.abs(captionPopScale(5, 1.14) - 1.14) < 1e-9, "settles to activeScale");
  assert.equal(captionPopScale(20, 1.14), 1.14, "holds at activeScale");
});

// --- resolveCaptionLineLayout (per-word x; reuses measured-advance contract) -

test("per-word centers are deterministic and ordered from measured widths", () => {
  const { totalWidth, words: ws } = resolveCaptionLineLayout({
    wordWidths: [100, 200, 50],
    spaceWidth: 20,
  });
  // centers: 50 ; 100+20+100=220 ; 100+20+200+20+25=365
  assert.equal(ws[0]!.centerX, 50);
  assert.equal(ws[1]!.centerX, 220);
  assert.equal(ws[2]!.centerX, 365);
  // total = 100+20+200+20+50 = 390
  assert.equal(totalWidth, 390);
  for (let i = 1; i < ws.length; i++) {
    assert.ok(ws[i]!.centerX > ws[i - 1]!.centerX, "centers strictly increase");
  }
});

// --- strokeRingOffsets (parity-safe layered fill, rendered non-zero) --------

test("stroke ring: empty when disabled, full symmetric ring at width 8", () => {
  assert.deepEqual(strokeRingOffsets(0), []);
  assert.deepEqual(strokeRingOffsets(-4), []);
  const ring = strokeRingOffsets(8);
  assert.equal(ring.length, 12);
  for (const { dx, dy } of ring) {
    assert.ok(Math.abs(Math.hypot(dx, dy) - 8) < 1e-9, "every offset sits on radius 8");
  }
});

// --- schema discrimination + duration --------------------------------------

test("captionClipSchema applies viral-style defaults", () => {
  const clip = captionClipSchema.parse({
    id: uid(),
    startFrame: 0,
    kind: "caption",
    words: [{ text: "hi", startFrame: 0, endFrame: 10 }],
    durationInFrames: 16,
  });
  assert.equal(clip.style.fontFamily, "Anton");
  assert.equal(clip.style.activeColor, "#F5C842");
  assert.equal(clip.style.strokeWidth, 8);
  assert.equal(clip.style.activeScale, 1.14);
  assert.equal(clip.position.y, 0.78);
});

test("clipSchema discriminates the caption kind", () => {
  const parsed = clipSchema.parse({
    id: uid(),
    startFrame: 5,
    kind: "caption",
    words: [{ text: "yo", startFrame: 0, endFrame: 8 }],
    durationInFrames: 14,
  });
  assert.equal(parsed.kind, "caption");
  assert.equal(clipDurationInFrames(parsed), 14);
});

// --- editCaptionWords -------------------------------------------------------

const sampleWords: CaptionWord[] = [
  { text: "go", startFrame: 0, endFrame: 12 },
  { text: "viral", startFrame: 12, endFrame: 27 },
];

test("editCaptionWords preserves timing when the word count is unchanged", () => {
  const edited = editCaptionWords(sampleWords, "GO VIRAL");
  assert.equal(edited.length, 2);
  assert.equal(edited[0]!.text, "GO");
  assert.equal(edited[1]!.text, "VIRAL");
  // timings untouched
  assert.deepEqual(
    edited.map((w) => [w.startFrame, w.endFrame]),
    [[0, 12], [12, 27]],
  );
});

test("editCaptionWords redistributes gaplessly when the count changes", () => {
  const edited = editCaptionWords(sampleWords, "go super viral now");
  assert.equal(edited.length, 4);
  for (let i = 1; i < edited.length; i++) {
    assert.equal(edited[i]!.startFrame, edited[i - 1]!.endFrame, "gapless");
  }
  for (const w of edited) assert.ok(w.endFrame > w.startFrame);
});

test("editCaptionWords keeps existing words on empty input", () => {
  assert.equal(editCaptionWords(sampleWords, "   "), sampleWords);
});

console.log(`\n${passed} caption tests passed`);
