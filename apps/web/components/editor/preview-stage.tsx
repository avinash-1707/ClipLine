"use client";

import {
  clampFraming,
  clipDurationInFrames,
  FPS,
  MAX_FRAMING_ZOOM,
  MIN_FRAMING_ZOOM,
  OUTPUT_HEIGHT,
  OUTPUT_WIDTH,
  resolveVideoFraming,
  zoomFramingAround,
  type Framing,
  type VideoClip,
} from "@clipline/timeline";
import { Pause, Play, RotateCcw, SkipBack, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useRef } from "react";
import { Logo } from "@/components/logo";
import { Timecode } from "@/components/timeline/timecode";
import { Button } from "@/components/ui/button";
import type { Asset } from "@/lib/api";
import { PreviewEngine } from "@/lib/preview/engine";
import {
  selectDuration,
  selectSelectedClip,
  useTimelineStore,
} from "@/store/timeline";

const ZOOM_STEP = 0.15;
/** Pan nudge in output px (arrow keys); Shift multiplies. */
const NUDGE = 12;
const NUDGE_SHIFT = 60;
/** Debounce for committing wheel/key framing changes as one undo step. */
const COMMIT_DELAY = 200;

const framingInput = (size: { w: number; h: number }, framing: Framing) => ({
  srcW: size.w,
  srcH: size.h,
  frameW: OUTPUT_WIDTH,
  frameH: OUTPUT_HEIGHT,
  framing,
});

/**
 * Center 9:16 stage: a 1080x1920 canvas the PreviewEngine composites into,
 * scaled to fit. The selected video clip can be reframed directly on the stage
 * — drag to pan, scroll to zoom (cursor-anchored), arrow keys to nudge — with
 * the cropped overflow shown faintly outside the frame while dragging. Framing
 * is hard-clamped so the video always fully covers the frame.
 */
export function PreviewStage({ assets }: { assets: Asset[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ghostRef = useRef<HTMLVideoElement>(null);
  const engineRef = useRef<PreviewEngine | null>(null);

  const isPlaying = useTimelineStore((s) => s.isPlaying);
  const playheadFrame = useTimelineStore((s) => s.playheadFrame);
  const selectedClip = useTimelineStore(selectSelectedClip);
  const update = useTimelineStore((s) => s.updateClip);
  const setPlayhead = useTimelineStore((s) => s.setPlayhead);
  const isEmpty = useTimelineStore((s) => selectDuration(s) === 0);

  const videoClip =
    selectedClip && selectedClip.kind === "video" ? selectedClip : null;
  const inRange =
    videoClip != null &&
    playheadFrame >= videoClip.startFrame &&
    playheadFrame < videoClip.startFrame + clipDurationInFrames(videoClip);
  const framingActive = videoClip != null && !isPlaying && inRange;
  const zoom = videoClip?.framing.zoom ?? 1;
  const isFramed =
    videoClip != null &&
    (videoClip.framing.zoom !== 1 ||
      videoClip.framing.offsetX !== 0 ||
      videoClip.framing.offsetY !== 0);

  // Active drag gesture (refs so pointer moves never touch React state).
  const drag = useRef<{
    startX: number;
    startY: number;
    start: Framing;
    size: { w: number; h: number };
    clipId: string;
    last: Framing;
  } | null>(null);
  const clampTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Pending debounced store commit (wheel/keys) so a burst is one undo step.
  const commit = useRef<{
    timer: ReturnType<typeof setTimeout> | null;
    clipId: string;
    framing: Framing;
  } | null>(null);

  /**
   * The clip currently reframable — read LIVE from the store at event time so
   * a selection/playhead change can't make a handler write to the wrong clip.
   */
  const liveClip = (): VideoClip | null => {
    const s = useTimelineStore.getState();
    const clip = selectSelectedClip(s);
    if (!clip || clip.kind !== "video" || s.isPlaying) return null;
    const dur = clipDurationInFrames(clip);
    if (
      s.playheadFrame < clip.startFrame ||
      s.playheadFrame >= clip.startFrame + dur
    )
      return null;
    return clip;
  };

  useEffect(() => {
    const engine = new PreviewEngine(canvasRef.current!);
    engineRef.current = engine;
    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  // feed ready media into the element pool
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    for (const asset of assets) {
      if (asset.status === "ready" && asset.normalizedUrl) {
        engine.registerAsset(asset.id, asset.kind, asset.normalizedUrl);
      }
    }
  }, [assets]);

  // Space toggles playback — keyboard-initiated, instant, no motion
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.code !== "Space") return;
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, button, [contenteditable]")) return;
      e.preventDefault();
      engineRef.current?.toggle();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // --- framing interaction helpers -----------------------------------------

  const displayScale = () => {
    const canvas = canvasRef.current;
    if (!canvas) return 0;
    return canvas.getBoundingClientRect().width / OUTPUT_WIDTH;
  };

  const flashClamp = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.dataset.clamped = "true";
    if (clampTimer.current) clearTimeout(clampTimer.current);
    clampTimer.current = setTimeout(() => {
      if (canvasRef.current) canvasRef.current.dataset.clamped = "false";
    }, 200);
  };

  const positionGhost = (size: { w: number; h: number }, framing: Framing) => {
    const ghost = ghostRef.current;
    const s = displayScale();
    if (!ghost || s === 0) return;
    const rect = resolveVideoFraming(framingInput(size, framing));
    ghost.style.left = `${rect.x * s}px`;
    ghost.style.top = `${rect.y * s}px`;
    ghost.style.width = `${rect.w * s}px`;
    ghost.style.height = `${rect.h * s}px`;
  };

  const seekGhost = (ghost: HTMLVideoElement, time: number) => {
    const t = Number.isFinite(time) ? Math.max(0, time) : 0;
    if (ghost.readyState >= 1) {
      ghost.currentTime = t;
    } else {
      ghost.addEventListener(
        "loadedmetadata",
        () => {
          ghost.currentTime = t;
        },
        { once: true },
      );
    }
  };

  /** The framing in flight for a clip: the pending (uncommitted) value if one
   * exists for it, else the stored framing — so successive wheel/key steps
   * accumulate even though the store commit is debounced. */
  const currentFraming = (clip: VideoClip): Framing =>
    commit.current?.clipId === clip.id ? commit.current.framing : clip.framing;

  /** Apply a framing live via the engine override; returns the clamped value. */
  const previewFraming = (
    clipId: string,
    size: { w: number; h: number },
    raw: Framing,
    withGhost: boolean,
  ): Framing => {
    const c = clampFraming(framingInput(size, raw));
    if (c.offsetX !== raw.offsetX || c.offsetY !== raw.offsetY) flashClamp();
    const framing: Framing = { zoom: raw.zoom, offsetX: c.offsetX, offsetY: c.offsetY };
    engineRef.current?.setFramingOverride(clipId, framing);
    if (withGhost) positionGhost(size, framing);
    return framing;
  };

  /** Land any pending debounced commit immediately. */
  const flushCommit = () => {
    const c = commit.current;
    if (!c) return;
    if (c.timer) clearTimeout(c.timer);
    commit.current = null;
    update(c.clipId, { framing: c.framing });
    engineRef.current?.setFramingOverride(c.clipId, null);
  };

  /** Debounce a store commit so a wheel/key burst becomes one undo step. */
  const scheduleCommit = (clipId: string, framing: Framing) => {
    if (commit.current?.timer) clearTimeout(commit.current.timer);
    const timer = setTimeout(() => {
      update(clipId, { framing });
      engineRef.current?.setFramingOverride(clipId, null);
      commit.current = null;
    }, COMMIT_DELAY);
    commit.current = { timer, clipId, framing };
  };

  const setFramingNow = (clipId: string, framing: Framing) => {
    flushCommit();
    update(clipId, { framing });
    engineRef.current?.setFramingOverride(clipId, null);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const clip = liveClip();
    if (!clip || e.button !== 0) return;
    const size = engineRef.current?.getSourceSize(clip.assetId);
    if (!size) return;

    flushCommit(); // land any pending wheel/key change before a new gesture
    e.preventDefault();
    canvasRef.current?.setPointerCapture(e.pointerId);
    const start = currentFraming(clip);
    drag.current = {
      startX: e.clientX,
      startY: e.clientY,
      start,
      size,
      clipId: clip.id,
      last: start,
    };

    // show the dimmed overflow ghost, seeked to the current source frame
    const ghost = ghostRef.current;
    const url = assets.find((a) => a.id === clip.assetId)?.normalizedUrl;
    if (ghost && url) {
      if (ghost.getAttribute("src") !== url) ghost.src = url;
      const playhead = useTimelineStore.getState().playheadFrame;
      seekGhost(ghost, (clip.sourceInFrame + (playhead - clip.startFrame)) / FPS);
      ghost.style.display = "block";
      positionGhost(size, start);
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = drag.current;
    if (!d) return;
    const scale = displayScale();
    if (scale === 0) return;
    const dx = (e.clientX - d.startX) / scale;
    const dy = (e.clientY - d.startY) / scale;
    d.last = previewFraming(
      d.clipId,
      d.size,
      { zoom: d.start.zoom, offsetX: d.start.offsetX + dx, offsetY: d.start.offsetY + dy },
      true,
    );
  };

  const endDrag = () => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    update(d.clipId, { framing: d.last }); // one undo step per drag
    engineRef.current?.setFramingOverride(d.clipId, null);
    const ghost = ghostRef.current;
    if (ghost) {
      ghost.style.display = "none";
      ghost.removeAttribute("src"); // release the second decode
      ghost.load();
    }
  };

  // native non-passive wheel listener so preventDefault works (zoom, not scroll)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    function onWheel(e: WheelEvent) {
      const clip = liveClip();
      if (!clip) return;
      const size = engineRef.current?.getSourceSize(clip.assetId);
      if (!size) return;
      e.preventDefault();
      if (commit.current && commit.current.clipId !== clip.id) flushCommit();
      const base = currentFraming(clip);
      const factor = Math.exp(-e.deltaY * 0.0015);
      const rect = canvas!.getBoundingClientRect();
      const s = rect.width / OUTPUT_WIDTH;
      const fx = (e.clientX - rect.left) / s;
      const fy = (e.clientY - rect.top) / s;
      const next = zoomFramingAround(framingInput(size, base), base.zoom * factor, fx, fy);
      const applied = previewFraming(clip.id, size, next, false);
      scheduleCommit(clip.id, applied);
    }
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
    // bound once: the handler reads live store/refs, never stale render values
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onCanvasKeyDown = (e: React.KeyboardEvent<HTMLCanvasElement>) => {
    const clip = liveClip();
    if (!clip) return;
    const size = engineRef.current?.getSourceSize(clip.assetId);
    if (!size) return;
    if (commit.current && commit.current.clipId !== clip.id) flushCommit();
    const base = currentFraming(clip);
    const step = e.shiftKey ? NUDGE_SHIFT : NUDGE;
    const pan = (dx: number, dy: number) => {
      e.preventDefault();
      const applied = previewFraming(
        clip.id,
        size,
        { zoom: base.zoom, offsetX: base.offsetX + dx, offsetY: base.offsetY + dy },
        false,
      );
      scheduleCommit(clip.id, applied);
    };
    const zoomBy = (delta: number) => {
      e.preventDefault();
      const next = zoomFramingAround(
        framingInput(size, base),
        base.zoom + delta,
        OUTPUT_WIDTH / 2,
        OUTPUT_HEIGHT / 2,
      );
      scheduleCommit(clip.id, previewFraming(clip.id, size, next, false));
    };
    switch (e.key) {
      case "ArrowLeft":
        pan(step, 0);
        break;
      case "ArrowRight":
        pan(-step, 0);
        break;
      case "ArrowUp":
        pan(0, step);
        break;
      case "ArrowDown":
        pan(0, -step);
        break;
      case "+":
      case "=":
        zoomBy(ZOOM_STEP);
        break;
      case "-":
      case "_":
        zoomBy(-ZOOM_STEP);
        break;
      case "r":
      case "R":
        e.preventDefault();
        setFramingNow(clip.id, { zoom: 1, offsetX: 0, offsetY: 0 });
        break;
    }
  };

  const stepZoom = (delta: number) => {
    const clip = videoClip;
    if (!clip) return;
    const size = engineRef.current?.getSourceSize(clip.assetId);
    if (!size) return;
    const base = currentFraming(clip);
    setFramingNow(
      clip.id,
      zoomFramingAround(
        framingInput(size, base),
        base.zoom + delta,
        OUTPUT_WIDTH / 2,
        OUTPUT_HEIGHT / 2,
      ),
    );
  };

  const resetFraming = () => {
    if (videoClip) setFramingNow(videoClip.id, { zoom: 1, offsetX: 0, offsetY: 0 });
  };

  // clear pending timers on unmount
  useEffect(
    () => () => {
      if (clampTimer.current) clearTimeout(clampTimer.current);
      if (commit.current?.timer) clearTimeout(commit.current.timer);
    },
    [],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-muted/20">
      <div className="relative flex min-h-0 flex-1 items-center justify-center p-4">
        <div
          className="relative isolate max-h-full max-w-full"
          style={{ aspectRatio: "9 / 16", height: "100%" }}
        >
          {/* dimmed overflow ghost: the cropped-off video, shown only while
              dragging so the user sees what's outside the frame */}
          <video
            ref={ghostRef}
            muted
            playsInline
            crossOrigin="anonymous"
            aria-hidden
            className="pointer-events-none absolute z-0 hidden rounded-sm brightness-[0.22]"
          />
          <canvas
            ref={canvasRef}
            data-framing-canvas
            data-clamped="false"
            tabIndex={framingActive ? 0 : -1}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onKeyDown={onCanvasKeyDown}
            className={`relative z-10 block h-full w-full rounded-lg border border-border shadow-[0_16px_48px_-16px_rgb(0_0_0/0.5)] outline-none transition-colors duration-150 focus-visible:border-foreground/40 data-[clamped=true]:border-foreground/40 ${
              framingActive ? "cursor-grab active:cursor-grabbing" : ""
            }`}
            style={{ aspectRatio: "9 / 16" }}
          />
          {/* framing HUD: zoom readout + controls, only on a reframable clip */}
          {framingActive && (
            <div className="absolute bottom-2 left-2 z-20 flex items-center gap-0.5 rounded-md border border-border bg-background/70 px-1 py-0.5 backdrop-blur-md">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Zoom out"
                disabled={zoom <= MIN_FRAMING_ZOOM + 1e-3}
                onClick={() => stepZoom(-ZOOM_STEP)}
              >
                <ZoomOut className="size-3.5" />
              </Button>
              <span className="label-mono w-10 text-center tabular-nums text-foreground/70">
                {Math.round(zoom * 100)}%
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Zoom in"
                disabled={zoom >= MAX_FRAMING_ZOOM - 1e-3}
                onClick={() => stepZoom(ZOOM_STEP)}
              >
                <ZoomIn className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Reset framing"
                disabled={!isFramed}
                onClick={resetFraming}
              >
                <RotateCcw className="size-3.5" />
              </Button>
            </div>
          )}
        </div>
        {/* empty state: nothing on the timeline to composite */}
        {isEmpty && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2.5">
            <Logo className="size-5 text-white/25" />
            <p className="label-mono text-white/30">Nothing to preview yet</p>
          </div>
        )}
      </div>

      {/* transport */}
      <div className="flex h-11 shrink-0 items-center justify-center gap-2 border-t border-border">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Jump to start"
          onClick={() => {
            engineRef.current?.pause();
            setPlayhead(0);
          }}
        >
          <SkipBack className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label={isPlaying ? "Pause (Space)" : "Play (Space)"}
          onClick={() => engineRef.current?.toggle()}
        >
          {isPlaying ? (
            <Pause className="size-4" />
          ) : (
            // optical alignment: play triangle reads left-heavy, nudge right
            <Play className="size-4 translate-x-px" />
          )}
        </Button>
        <Timecode className="w-20 text-center" />
      </div>
    </div>
  );
}
