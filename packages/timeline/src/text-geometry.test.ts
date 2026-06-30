import assert from "node:assert/strict";
import { OUTPUT_HEIGHT, OUTPUT_WIDTH } from "./schema";
import {
  easeOutBack,
  resolveTextAnimation,
  resolveTextLayout,
  shapeGraphicSchema,
  snapToCenterlines,
  TEXT_LINE_HEIGHT,
  textClipSchema,
  wordRevealAlpha,
  type TextAnimation,
  type TextBox,
} from "./index";

const FW = OUTPUT_WIDTH; // 1080
const FH = OUTPUT_HEIGHT; // 1920
const EPS = 1e-9;

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ok - ${name}`);
}

function box(overrides: Partial<TextBox> = {}): TextBox {
  return {
    bg: { enabled: false, color: "#000000", opacity: 1 },
    border: { enabled: false, color: "#FFFFFF", width: 4 },
    padding: 24,
    cornerRadius: 0,
    ...overrides,
  };
}

// --- resolveTextLayout ------------------------------------------------------

test("single line, no box: box equals content, center is exact", () => {
  const l = resolveTextLayout({
    lineWidths: [300],
    fontSize: 64,
    lineHeightRatio: TEXT_LINE_HEIGHT,
    align: "center",
    box: box(),
    position: { x: 0.5, y: 0.5 },
    frameW: FW,
    frameH: FH,
  });
  assert.deepEqual(l.center, { x: 540, y: 960 });
  assert.equal(l.padding, 0, "no padding when no fill/border");
  assert.equal(l.content.w, 300);
  assert.equal(l.content.h, 64 * TEXT_LINE_HEIGHT);
  assert.deepEqual(l.box, { x: 540 - 150, y: 960 - 38.4, w: 300, h: 76.8 });
  // single center-aligned line sits at the box center
  assert.equal(l.lines.length, 1);
  assert.ok(Math.abs(l.lines[0]!.x - 540) < EPS);
  assert.ok(Math.abs(l.lines[0]!.y - 960) < EPS);
});

test("multi-line: height scales with line count, width is the widest line", () => {
  const l = resolveTextLayout({
    lineWidths: [200, 420, 100],
    fontSize: 50,
    lineHeightRatio: TEXT_LINE_HEIGHT,
    align: "center",
    box: box(),
    position: { x: 0.5, y: 0.5 },
    frameW: FW,
    frameH: FH,
  });
  assert.equal(l.content.w, 420, "widest line wins");
  assert.equal(l.content.h, 3 * 50 * TEXT_LINE_HEIGHT);
  assert.equal(l.lines.length, 3);
  // lines are evenly spaced by one line-step
  const step = 50 * TEXT_LINE_HEIGHT;
  assert.ok(Math.abs(l.lines[1]!.y - l.lines[0]!.y - step) < EPS);
  assert.ok(Math.abs(l.lines[2]!.y - l.lines[1]!.y - step) < EPS);
});

test("box enabled grows the rect by 2*padding, center unchanged", () => {
  const l = resolveTextLayout({
    lineWidths: [300],
    fontSize: 64,
    lineHeightRatio: TEXT_LINE_HEIGHT,
    align: "center",
    box: box({ bg: { enabled: true, color: "#000000", opacity: 1 } }),
    position: { x: 0.5, y: 0.5 },
    frameW: FW,
    frameH: FH,
  });
  assert.equal(l.padding, 24);
  assert.equal(l.box.w, 300 + 48, "width grows by 2*padding");
  assert.equal(l.box.h, 64 * TEXT_LINE_HEIGHT + 48);
  assert.deepEqual(l.center, { x: 540, y: 960 }, "center is padding-invariant");
});

test("left and right align mirror each line around the box center", () => {
  const common = {
    lineWidths: [400],
    fontSize: 64,
    lineHeightRatio: TEXT_LINE_HEIGHT,
    box: box(),
    position: { x: 0.5, y: 0.5 },
    frameW: FW,
    frameH: FH,
  };
  const left = resolveTextLayout({ ...common, align: "left" });
  const right = resolveTextLayout({ ...common, align: "right" });
  // left anchor at content-left, right anchor at content-right
  assert.ok(Math.abs(left.lines[0]!.x - (540 - 200)) < EPS);
  assert.ok(Math.abs(right.lines[0]!.x - (540 + 200)) < EPS);
  // symmetric about the center
  assert.ok(
    Math.abs(540 - left.lines[0]!.x - (right.lines[0]!.x - 540)) < EPS,
  );
});

test("border width never changes the box rect (border is drawn outside)", () => {
  const common = {
    lineWidths: [300],
    fontSize: 64,
    lineHeightRatio: TEXT_LINE_HEIGHT,
    align: "center" as const,
    position: { x: 0.5, y: 0.5 },
    frameW: FW,
    frameH: FH,
  };
  const thin = resolveTextLayout({
    ...common,
    box: box({ border: { enabled: true, color: "#FFFFFF", width: 2 } }),
  });
  const thick = resolveTextLayout({
    ...common,
    box: box({ border: { enabled: true, color: "#FFFFFF", width: 48 } }),
  });
  assert.deepEqual(thin.box, thick.box, "rect is border-width-independent");
});

test("border-only (no fill) still applies padding", () => {
  const l = resolveTextLayout({
    lineWidths: [300],
    fontSize: 64,
    lineHeightRatio: TEXT_LINE_HEIGHT,
    align: "center",
    box: box({ border: { enabled: true, color: "#FFFFFF", width: 4 } }),
    position: { x: 0.5, y: 0.5 },
    frameW: FW,
    frameH: FH,
  });
  assert.equal(l.padding, 24, "border alone enables the padded box");
  assert.equal(l.box.w, 300 + 48);
});

test("empty / zero-width line is finite (no NaN rect)", () => {
  const l = resolveTextLayout({
    lineWidths: [0],
    fontSize: 64,
    lineHeightRatio: TEXT_LINE_HEIGHT,
    align: "center",
    box: box(),
    position: { x: 0.5, y: 0.5 },
    frameW: FW,
    frameH: FH,
  });
  assert.ok(Number.isFinite(l.box.x) && Number.isFinite(l.box.w));
  assert.equal(l.content.w, 0);
});

// --- snapToCenterlines ------------------------------------------------------

test("exact center snaps both axes and activates both guides", () => {
  const r = snapToCenterlines({
    position: { x: 0.5, y: 0.5 },
    thresholdPx: 8,
    frameW: FW,
    frameH: FH,
  });
  assert.deepEqual(r.position, { x: 0.5, y: 0.5 });
  assert.deepEqual(r.guides, { horizontal: true, vertical: true });
});

test("within threshold on one axis snaps that axis only", () => {
  // x is 5px off center (< 8), y is far off
  const r = snapToCenterlines({
    position: { x: 0.5 + 5 / FW, y: 0.2 },
    thresholdPx: 8,
    frameW: FW,
    frameH: FH,
  });
  assert.equal(r.position.x, 0.5, "x snapped");
  assert.equal(r.position.y, 0.2, "y untouched");
  assert.deepEqual(r.guides, { horizontal: false, vertical: true });
});

test("outside threshold passes through with no guides", () => {
  const r = snapToCenterlines({
    position: { x: 0.5 + 40 / FW, y: 0.5 + 40 / FH },
    thresholdPx: 8,
    frameW: FW,
    frameH: FH,
  });
  assert.ok(Math.abs(r.position.x - (0.5 + 40 / FW)) < EPS);
  assert.deepEqual(r.guides, { horizontal: false, vertical: false });
});

test("threshold 0 only snaps an exactly-centered axis", () => {
  const off = snapToCenterlines({
    position: { x: 0.5 + 1 / FW, y: 0.5 },
    thresholdPx: 0,
    frameW: FW,
    frameH: FH,
  });
  assert.equal(off.guides.vertical, false, "1px off does not snap at threshold 0");
  assert.equal(off.guides.horizontal, true, "exact center still snaps");
});

// --- easeOutBack ------------------------------------------------------------

test("easeOutBack pins endpoints and overshoots in between", () => {
  assert.ok(Math.abs(easeOutBack(0)) < 1e-12, "f(0) = 0");
  assert.ok(Math.abs(easeOutBack(1) - 1) < 1e-12, "f(1) = 1");
  // overshoots past 1 somewhere in the back half
  assert.ok(easeOutBack(0.8) > 1, "overshoots past 1");
});

// --- back-compat: legacy text clips upgrade transparently -------------------

test("legacy text clip (no box/fontStyle/align/exit) parses to defaults", () => {
  const legacy = {
    id: crypto.randomUUID(),
    kind: "text",
    startFrame: 0,
    text: "Hello",
    durationInFrames: 90,
    position: { x: 0.5, y: 0.5 },
    fontSize: 64,
    fontFamily: "Geist Sans",
    color: "#FFFFFF",
    animation: { preset: "fade-in", durationInFrames: 15 },
  };
  const clip = textClipSchema.parse(legacy);
  assert.equal(clip.box.bg.enabled, false);
  assert.equal(clip.box.border.enabled, false);
  assert.equal(clip.box.padding, 24);
  assert.equal(clip.align, "center");
  assert.deepEqual(clip.fontStyle, {
    bold: false,
    italic: false,
    underline: false,
  });
  assert.equal(clip.animation.exit, "none");
  assert.equal(clip.animation.exitDurationInFrames, 15);
  // pre-existing animation fields are preserved
  assert.equal(clip.animation.preset, "fade-in");
});

// --- resolveTextAnimation (entrance + exit) ---------------------------------

function anim(overrides: Partial<TextAnimation> = {}): TextAnimation {
  return {
    preset: "none",
    durationInFrames: 15,
    exit: "none",
    exitDurationInFrames: 15,
    ...overrides,
  };
}

test("none preset is fully visible from frame 0", () => {
  const s = resolveTextAnimation(anim(), 0, 90);
  assert.equal(s.alpha, 1);
  assert.equal(s.scale, 1);
  assert.equal(s.blur, 0);
});

test("fade-in ramps alpha 0 -> 1 across its duration", () => {
  const start = resolveTextAnimation(anim({ preset: "fade-in" }), 0, 90);
  const end = resolveTextAnimation(anim({ preset: "fade-in" }), 15, 90);
  assert.ok(start.alpha < 0.001, "alpha ~0 at frame 0");
  assert.ok(Math.abs(end.alpha - 1) < 1e-9, "alpha 1 once duration elapsed");
});

test("scale-pop overshoots scale past 1 mid-entrance, settles to 1", () => {
  const mid = resolveTextAnimation(anim({ preset: "scale-pop" }), 12, 90);
  const done = resolveTextAnimation(anim({ preset: "scale-pop" }), 15, 90);
  assert.ok(mid.scale > 1, "overshoots");
  assert.ok(Math.abs(done.scale - 1) < 1e-9, "settles to exactly 1");
});

test("blur-in blur decreases to 0 by the end of entrance", () => {
  const start = resolveTextAnimation(anim({ preset: "blur-in" }), 0, 90);
  const end = resolveTextAnimation(anim({ preset: "blur-in" }), 15, 90);
  assert.ok(start.blur > 0, "blurred at start");
  assert.ok(Math.abs(end.blur) < 1e-9, "sharp at end");
});

test("slide-in-right starts offset and lands at 0", () => {
  const start = resolveTextAnimation(anim({ preset: "slide-in-right" }), 0, 90);
  const end = resolveTextAnimation(anim({ preset: "slide-in-right" }), 15, 90);
  assert.ok(start.offsetX > 0, "starts to the right");
  assert.ok(Math.abs(end.offsetX) < 1e-9, "lands at center");
});

test("fade-out holds full alpha until the exit window, then ramps to ~0", () => {
  const clipDur = 90;
  const a = anim({ exit: "fade-out", exitDurationInFrames: 15 });
  const before = resolveTextAnimation(a, 60, clipDur); // 30 left, outside window
  const nearEnd = resolveTextAnimation(a, 89, clipDur); // 1 left, deep in window
  assert.ok(Math.abs(before.alpha - 1) < 1e-9, "full alpha before exit window");
  assert.ok(nearEnd.alpha < 0.05, "nearly gone at the end");
});

test("entrance and exit compose (alpha pinched at both ends)", () => {
  const clipDur = 90;
  const a = anim({
    preset: "fade-in",
    durationInFrames: 15,
    exit: "fade-out",
    exitDurationInFrames: 15,
  });
  assert.ok(resolveTextAnimation(a, 0, clipDur).alpha < 0.001, "0 at entry");
  assert.ok(resolveTextAnimation(a, 89, clipDur).alpha < 0.05, "0 at exit");
  assert.ok(
    Math.abs(resolveTextAnimation(a, 45, clipDur).alpha - 1) < 1e-9,
    "full in the middle",
  );
});

test("wordRevealAlpha staggers words left to right", () => {
  // 4 words; at progress 0.5 the first two are revealed, the rest hidden
  assert.equal(wordRevealAlpha(0.5, 0, 4), 1);
  assert.equal(wordRevealAlpha(0.5, 1, 4), 1);
  assert.equal(wordRevealAlpha(0.5, 2, 4), 0);
  assert.equal(wordRevealAlpha(1, 3, 4), 1, "all revealed at progress 1");
  assert.equal(wordRevealAlpha(0, 0, 4), 0, "nothing at progress 0");
});

// --- parity: canvas resolveTextLayout box == Remotion CSS box model ---------
// The canvas draws the box from resolveTextLayout(...).box; the Remotion layer
// lets CSS size a div centered on position with width = content + 2*padding.
// This asserts the two derivations agree (the ADR 0001 firewall, computed-rect
// form — guards resolveTextLayout against drifting from the CSS box model).

function remotionCssBox(
  lineWidths: number[],
  fontSize: number,
  b: TextBox,
  pos: { x: number; y: number },
) {
  const hasBox = b.bg.enabled || b.border.enabled;
  const pad = hasBox ? b.padding : 0;
  const contentW = lineWidths.length ? Math.max(0, ...lineWidths) : 0;
  const contentH = Math.max(lineWidths.length, 1) * fontSize * TEXT_LINE_HEIGHT;
  const w = contentW + 2 * pad;
  const h = contentH + 2 * pad;
  return { x: pos.x * FW - w / 2, y: pos.y * FH - h / 2, w, h };
}

test("parity: canvas box equals the Remotion CSS box for varied configs", () => {
  const cases: {
    lineWidths: number[];
    fontSize: number;
    box: TextBox;
    align: "left" | "center" | "right";
    pos: { x: number; y: number };
  }[] = [
    { lineWidths: [320], fontSize: 64, box: box(), align: "center", pos: { x: 0.5, y: 0.5 } },
    {
      lineWidths: [200, 460, 120],
      fontSize: 48,
      box: box({ bg: { enabled: true, color: "#000", opacity: 0.6 }, padding: 32 }),
      align: "left",
      pos: { x: 0.3, y: 0.2 },
    },
    {
      lineWidths: [410],
      fontSize: 80,
      box: box({ border: { enabled: true, color: "#fff", width: 6 }, padding: 16 }),
      align: "right",
      pos: { x: 0.7, y: 0.85 },
    },
  ];
  for (const c of cases) {
    const canvas = resolveTextLayout({
      lineWidths: c.lineWidths,
      fontSize: c.fontSize,
      lineHeightRatio: TEXT_LINE_HEIGHT,
      align: c.align,
      box: c.box,
      position: c.pos,
      frameW: FW,
      frameH: FH,
    }).box;
    const css = remotionCssBox(c.lineWidths, c.fontSize, c.box, c.pos);
    assert.ok(Math.abs(canvas.x - css.x) < 0.5, `x ${canvas.x} vs ${css.x}`);
    assert.ok(Math.abs(canvas.y - css.y) < 0.5, `y ${canvas.y} vs ${css.y}`);
    assert.ok(Math.abs(canvas.w - css.w) < 0.5, `w ${canvas.w} vs ${css.w}`);
    assert.ok(Math.abs(canvas.h - css.h) < 0.5, `h ${canvas.h} vs ${css.h}`);
  }
});

// --- exit presets: slide-out-up + scale-out ---------------------------------

test("slide-out-up exit moves text up and fades by the last frame", () => {
  const a = anim({ exit: "slide-out-up", exitDurationInFrames: 15 });
  const before = resolveTextAnimation(a, 60, 90); // outside window
  const last = resolveTextAnimation(a, 89, 90); // last frame
  assert.equal(before.offsetY, 0, "no exit offset before the window");
  assert.ok(last.offsetY < 0, "moved up at the end");
  assert.ok(last.alpha < 0.05, "nearly gone at the end");
});

test("scale-out exit shrinks and fades by the last frame", () => {
  const a = anim({ exit: "scale-out", exitDurationInFrames: 15 });
  const last = resolveTextAnimation(a, 89, 90);
  assert.ok(last.scale < 1, "shrinks at the end");
  assert.ok(last.alpha < 0.05, "nearly gone at the end");
});

test("exit window boundary: full alpha at exitStart, gone at the last frame", () => {
  const a = anim({ exit: "fade-out", exitDurationInFrames: 15 });
  // exitStart = 90 - 15 = 75
  assert.ok(Math.abs(resolveTextAnimation(a, 75, 90).alpha - 1) < 1e-9);
  assert.ok(resolveTextAnimation(a, 89, 90).alpha < 1e-9, "exit completes on last frame");
});

// --- magnitude bounds (catch runaway easing constants) ----------------------

test("scale-pop overshoot stays subtle (<1.1)", () => {
  for (let f = 0; f <= 15; f++) {
    const s = resolveTextAnimation(anim({ preset: "scale-pop" }), f, 90).scale;
    assert.ok(s < 1.1, `scale ${s} at frame ${f} exceeds subtle overshoot`);
  }
});

test("blur-in blur is capped at 12px", () => {
  for (let f = 0; f <= 15; f++) {
    const b = resolveTextAnimation(anim({ preset: "blur-in" }), f, 90).blur;
    assert.ok(b <= 12 + 1e-9, `blur ${b} exceeds 12px`);
  }
});

test("easeOutBack overshoot is bounded (<1.15)", () => {
  for (let i = 0; i <= 20; i++) {
    assert.ok(easeOutBack(i / 20) < 1.15, "overshoot runaway");
  }
});

// --- fractional word reveal -------------------------------------------------

test("wordRevealAlpha produces a fractional alpha for the revealing word", () => {
  // 0.375 * 4 - 1 = 0.5
  assert.ok(Math.abs(wordRevealAlpha(0.375, 1, 4) - 0.5) < 1e-9);
  assert.equal(wordRevealAlpha(0.375, 0, 4), 1, "earlier word fully shown");
  assert.equal(wordRevealAlpha(0.375, 2, 4), 0, "later word hidden");
  assert.equal(wordRevealAlpha(0.5, 0, 0), 1, "zero-word guard returns 1");
});

// --- degenerate layout ------------------------------------------------------

test("empty lineWidths array yields a finite single-line box", () => {
  const l = resolveTextLayout({
    lineWidths: [],
    fontSize: 64,
    lineHeightRatio: TEXT_LINE_HEIGHT,
    align: "center",
    box: box(),
    position: { x: 0.5, y: 0.5 },
    frameW: FW,
    frameH: FH,
  });
  assert.ok(Number.isFinite(l.box.w) && Number.isFinite(l.box.h));
  assert.equal(l.content.w, 0, "no -Infinity from Math.max of empty");
  assert.equal(l.lines.length, 1);
});

// --- back-compat: legacy GRAPHIC clip upgrades (shares textAnimationSchema) --

test("legacy graphic clip animation upgrades with exit defaults", () => {
  const legacyShape = {
    preset: "shape",
    shape: "rect",
    color: "#FFFFFF",
    position: { x: 0.5, y: 0.5 },
    size: { w: 0.3, h: 0.1 },
    animation: { preset: "slide-up", durationInFrames: 15 },
  };
  const parsed = shapeGraphicSchema.parse(legacyShape);
  assert.equal(parsed.animation.exit, "none");
  assert.equal(parsed.animation.exitDurationInFrames, 15);
  // and the upgraded animation produces a finite state (no undefined math)
  const s = resolveTextAnimation(parsed.animation, 10, 90);
  assert.ok(Number.isFinite(s.alpha) && Number.isFinite(s.offsetY));
});

console.log(`\n${passed} text-geometry tests passed`);
