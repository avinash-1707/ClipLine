"use client";

import { clipDurationInFrames, type Clip } from "@clipline/timeline";
import { useRef } from "react";
import { toast } from "sonner";
import { useTimelineStore } from "@/store/timeline";
import type { Asset } from "@/lib/api";

/**
 * One clip on a track. Body drag moves it; edge handles trim. Pointer moves
 * write transforms/width directly to the DOM (no React state per frame);
 * the store commit happens on pointerup.
 */
export function ClipBlock({
  clip,
  trackId,
  asset,
}: {
  clip: Clip;
  trackId: string;
  asset: Asset | undefined;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const pxPerFrame = useTimelineStore((s) => s.pxPerFrame);
  const isSelected = useTimelineStore((s) => s.selectedClipId === clip.id);
  const select = useTimelineStore((s) => s.select);
  const commitMove = useTimelineStore((s) => s.moveClip);
  const commitTrim = useTimelineStore((s) => s.trimClip);

  const duration = clipDurationInFrames(clip);
  const left = clip.startFrame * pxPerFrame;
  const width = Math.max(duration * pxPerFrame, 8);

  function dragBody(e: React.PointerEvent) {
    if (e.button !== 0) return;
    e.stopPropagation();
    select(clip.id);
    const el = ref.current!;
    const startX = e.clientX;
    let dx = 0;
    let raf = 0;
    el.setPointerCapture(e.pointerId);

    const onMove = (ev: PointerEvent) => {
      dx = ev.clientX - startX;
      if (!raf) {
        raf = requestAnimationFrame(() => {
          raf = 0;
          el.style.transform = `translateX(${dx}px)`;
        });
      }
    };
    const onUp = () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      if (raf) cancelAnimationFrame(raf);
      el.style.transform = "";
      const deltaFrames = Math.round(dx / pxPerFrame);
      if (
        deltaFrames !== 0 &&
        !commitMove(clip.id, trackId, clip.startFrame + deltaFrames)
      ) {
        toast.error("No room there", {
          description: "The clip snapped back — the target spot is occupied.",
        });
      }
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
  }

  function dragEdge(edge: "start" | "end") {
    return (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      select(clip.id);
      const el = ref.current!;
      const handle = e.currentTarget as HTMLElement;
      const startX = e.clientX;
      let dx = 0;
      let raf = 0;
      handle.setPointerCapture(e.pointerId);

      const onMove = (ev: PointerEvent) => {
        dx = ev.clientX - startX;
        if (!raf) {
          raf = requestAnimationFrame(() => {
            raf = 0;
            // live preview without store writes
            if (edge === "end") {
              el.style.width = `${Math.max(width + dx, 8)}px`;
            } else {
              el.style.transform = `translateX(${dx}px)`;
              el.style.width = `${Math.max(width - dx, 8)}px`;
            }
          });
        }
      };
      const onUp = () => {
        handle.removeEventListener("pointermove", onMove);
        handle.removeEventListener("pointerup", onUp);
        if (raf) cancelAnimationFrame(raf);
        el.style.transform = "";
        el.style.width = "";
        const deltaFrames = Math.round(dx / pxPerFrame);
        if (deltaFrames !== 0) commitTrim(clip.id, edge, deltaFrames);
      };
      handle.addEventListener("pointermove", onMove);
      handle.addEventListener("pointerup", onUp);
    };
  }

  const isAudio = clip.kind === "audio";
  const waveformUrl = isAudio && asset?.waveformUrl ? asset.waveformUrl : null;
  const thumbnailUrl =
    clip.kind === "video" && asset?.thumbnailUrl ? asset.thumbnailUrl : null;

  return (
    <div
      ref={ref}
      role="button"
      tabIndex={0}
      data-selected={isSelected || undefined}
      onPointerDown={dragBody}
      onKeyDown={(e) => {
        if (e.key === "Enter") select(clip.id);
      }}
      className="group absolute top-1 bottom-1 cursor-grab touch-none overflow-hidden rounded-md border border-border bg-card outline-none select-none active:cursor-grabbing data-selected:border-ring data-selected:ring-1 data-selected:ring-ring"
      style={{ left, width }}
    >
      {/* fill */}
      {thumbnailUrl ? (
        <div
          className="absolute inset-0 bg-repeat-x opacity-60"
          style={{
            backgroundImage: `url(${thumbnailUrl})`,
            backgroundSize: "auto 100%",
          }}
        />
      ) : waveformUrl ? (
        <div
          className="absolute inset-0 bg-center bg-no-repeat opacity-50 invert dark:invert-0"
          style={{
            backgroundImage: `url(${waveformUrl})`,
            backgroundSize: "100% 80%",
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-muted/60" />
      )}

      {/* name */}
      <span className="label-mono pointer-events-none absolute top-1 left-2 max-w-[calc(100%-1rem)] truncate text-foreground/80">
        {clip.kind === "text"
          ? clip.text
          : clip.kind === "graphic"
            ? clip.graphic.preset
            : (asset?.originalFilename ?? clip.kind)}
      </span>

      {/* trim handles */}
      <div
        onPointerDown={dragEdge("start")}
        className="absolute inset-y-0 left-0 w-2 cursor-ew-resize touch-none opacity-0 transition-opacity duration-100 group-hover:opacity-100"
      >
        <div className="absolute inset-y-1.5 left-0.5 w-1 rounded-full bg-foreground/60" />
      </div>
      <div
        onPointerDown={dragEdge("end")}
        className="absolute inset-y-0 right-0 w-2 cursor-ew-resize touch-none opacity-0 transition-opacity duration-100 group-hover:opacity-100"
      >
        <div className="absolute inset-y-1.5 right-0.5 w-1 rounded-full bg-foreground/60" />
      </div>
    </div>
  );
}
