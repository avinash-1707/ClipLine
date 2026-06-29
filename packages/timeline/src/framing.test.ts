import assert from "node:assert/strict";
import {
  MAX_FRAMING_ZOOM,
  MIN_FRAMING_ZOOM,
  OUTPUT_HEIGHT,
  OUTPUT_WIDTH,
} from "./schema";
import {
  clampFraming,
  clampZoom,
  resolveVideoFraming,
  zoomFramingAround,
  type Framing,
} from "./index";

const FW = OUTPUT_WIDTH; // 1080
const FH = OUTPUT_HEIGHT; // 1920
const EPS = 1e-6;

function identity(): Framing {
  return { zoom: 1, offsetX: 0, offsetY: 0 };
}

function rect(srcW: number, srcH: number, framing: Framing) {
  return resolveVideoFraming({ srcW, srcH, frameW: FW, frameH: FH, framing });
}

/** A rect covers the frame iff it starts at/under the origin on both axes and
 * extends past the far edge on both axes. */
function covers(r: { x: number; y: number; w: number; h: number }): boolean {
  return (
    r.x <= EPS &&
    r.y <= EPS &&
    r.x + r.w >= FW - EPS &&
    r.y + r.h >= FH - EPS
  );
}

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ok - ${name}`);
}

// --- identity / exact-match source -----------------------------------------

test("identity on a 1080x1920 source fills the frame exactly", () => {
  const r = rect(1080, 1920, identity());
  assert.deepEqual(r, { x: 0, y: 0, w: 1080, h: 1920 });
});

test("identity on a landscape source fills height, centers horizontally", () => {
  const r = rect(1920, 1080, identity());
  assert.equal(r.y, 0, "no vertical slack");
  assert.ok(r.w > FW, "overflows horizontally");
  assert.ok(r.x < 0, "centered => negative x");
  assert.ok(covers(r));
  // symmetric centering
  assert.ok(Math.abs(r.x - (FW - r.w) / 2) < EPS);
});

test("identity on a taller-than-frame portrait source fills width", () => {
  const r = rect(1080, 2400, identity());
  assert.equal(r.x, 0, "no horizontal slack");
  assert.ok(r.h > FH, "overflows vertically");
  assert.ok(r.y < 0);
  assert.ok(covers(r));
});

// --- clamp / snap-to-fill --------------------------------------------------

test("at zoom=1 the pinned axis snaps any offset to 0 (no black bars)", () => {
  // portrait source: width is pinned at zoom 1, so offsetX must snap to 0.
  const c = clampFraming({
    srcW: 1080,
    srcH: 2400,
    frameW: FW,
    frameH: FH,
    framing: { zoom: 1, offsetX: 500, offsetY: 50 },
  });
  assert.equal(c.offsetX, 0, "no horizontal slack at zoom 1");
  assert.ok(c.offsetY !== 0, "vertical slack exists");
  assert.ok(covers(rect(1080, 2400, { zoom: 1, offsetX: 500, offsetY: 50 })));
});

test("offset beyond slack clamps to exactly +/- slack", () => {
  const srcW = 1920;
  const srcH = 1080;
  const cover = Math.max(FW / srcW, FH / srcH);
  const scale = cover * 1; // zoom 1
  const slackX = (srcW * scale - FW) / 2;
  const hi = clampFraming({
    srcW,
    srcH,
    frameW: FW,
    frameH: FH,
    framing: { zoom: 1, offsetX: 1e9, offsetY: 0 },
  });
  const lo = clampFraming({
    srcW,
    srcH,
    frameW: FW,
    frameH: FH,
    framing: { zoom: 1, offsetX: -1e9, offsetY: 0 },
  });
  assert.ok(Math.abs(hi.offsetX - slackX) < EPS);
  assert.ok(Math.abs(lo.offsetX + slackX) < EPS);
});

test("zoom opens slack on the previously-pinned axis", () => {
  const c = clampFraming({
    srcW: 1080,
    srcH: 2400,
    frameW: FW,
    frameH: FH,
    framing: { zoom: 2, offsetX: 1e9, offsetY: 0 },
  });
  assert.ok(c.offsetX > 0, "zoom > 1 gives horizontal slack");
});

// --- invariant: framing NEVER produces black bars --------------------------

test("property: every valid framing fully covers the frame", () => {
  const dims = [
    [1080, 1920],
    [1920, 1080],
    [1080, 2400],
    [720, 1280],
    [3840, 2160],
    [1000, 1000],
    [640, 480],
  ];
  // deterministic pseudo-grid (no Math.random — unavailable + non-reproducible)
  for (const [srcW, srcH] of dims) {
    for (let zi = 0; zi <= 10; zi++) {
      const zoom =
        MIN_FRAMING_ZOOM +
        ((MAX_FRAMING_ZOOM - MIN_FRAMING_ZOOM) * zi) / 10;
      for (const ox of [-5000, -777, 0, 333, 5000]) {
        for (const oy of [-5000, -333, 0, 999, 5000]) {
          const r = rect(srcW!, srcH!, { zoom, offsetX: ox, offsetY: oy });
          assert.ok(
            covers(r),
            `black bars for ${srcW}x${srcH} zoom ${zoom} off ${ox},${oy}: ${JSON.stringify(r)}`,
          );
        }
      }
    }
  }
});

// --- golden exact rect -----------------------------------------------------

test("golden: zoomed + offset rect is exact (catches centering refactors)", () => {
  // portrait source exactly frame-sized; zoom 2 -> w=2160,h=3840;
  // slackX=540, slackY=960, so offsets 100/-200 are within range and survive.
  const r = rect(1080, 1920, { zoom: 2, offsetX: 100, offsetY: -200 });
  assert.deepEqual(r, { x: -440, y: -1160, w: 2160, h: 3840 });
});

// --- cursor-anchored zoom (zoomFramingAround) ------------------------------

test("center-anchored zoom from identity stays centered", () => {
  const next = zoomFramingAround(
    { srcW: 1080, srcH: 1920, frameW: FW, frameH: FH, framing: identity() },
    2,
    FW / 2,
    FH / 2,
  );
  assert.equal(next.zoom, 2);
  assert.ok(Math.abs(next.offsetX) < EPS && Math.abs(next.offsetY) < EPS);
});

test("zoomFramingAround keeps the source pixel under the anchor fixed", () => {
  const srcW = 1920;
  const srcH = 1080;
  const input = {
    srcW,
    srcH,
    frameW: FW,
    frameH: FH,
    framing: identity(),
  };
  const fx = 800;
  const fy = 700;
  const cover = Math.max(FW / srcW, FH / srcH);
  const before = resolveVideoFraming(input);
  const sxBefore = (fx - before.x) / (cover * input.framing.zoom);
  const syBefore = (fy - before.y) / (cover * input.framing.zoom);
  const next = zoomFramingAround(input, 2, fx, fy);
  const after = resolveVideoFraming({ ...input, framing: next });
  const sxAfter = (fx - after.x) / (cover * next.zoom);
  const syAfter = (fy - after.y) / (cover * next.zoom);
  assert.ok(Math.abs(sxBefore - sxAfter) < 1e-3, "x anchor drifted");
  assert.ok(Math.abs(syBefore - syAfter) < 1e-3, "y anchor drifted");
  assert.ok(covers(after));
});

test("clampZoom clamps range and coerces non-finite to the floor", () => {
  assert.equal(clampZoom(99), 3);
  assert.equal(clampZoom(0.1), 1);
  assert.equal(clampZoom(Number.NaN), 1);
  assert.equal(clampZoom(Number.POSITIVE_INFINITY), 1);
});

// --- non-finite hardening --------------------------------------------------

test("non-finite offsets snap to centered (no NaN rect)", () => {
  const r = rect(1080, 1920, {
    zoom: 1,
    offsetX: Number.NaN,
    offsetY: Number.POSITIVE_INFINITY,
  });
  assert.ok(Number.isFinite(r.x) && Number.isFinite(r.y));
  assert.deepEqual(r, { x: 0, y: 0, w: 1080, h: 1920 });
  const c = clampFraming({
    srcW: 1080,
    srcH: 1920,
    frameW: FW,
    frameH: FH,
    framing: { zoom: 1, offsetX: Number.NaN, offsetY: Number.POSITIVE_INFINITY },
  });
  assert.equal(c.offsetX, 0);
  assert.equal(c.offsetY, 0);
});

// --- degenerate inputs -----------------------------------------------------

test("zero/negative source dims return the identity cover rect", () => {
  assert.deepEqual(rect(0, 0, { zoom: 2, offsetX: 100, offsetY: 100 }), {
    x: 0,
    y: 0,
    w: FW,
    h: FH,
  });
  assert.deepEqual(clampFraming({
    srcW: 0,
    srcH: 0,
    frameW: FW,
    frameH: FH,
    framing: { zoom: 1, offsetX: 50, offsetY: 50 },
  }), { offsetX: 0, offsetY: 0 });
});

console.log(`\n${passed} framing tests passed`);
