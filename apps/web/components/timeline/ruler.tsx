"use client";

import { FPS } from "@clipline/timeline";
import { useTimelineStore } from "@/store/timeline";

/** Time ruler. Click or drag to scrub the playhead. */
export function Ruler({ widthPx }: { widthPx: number }) {
  const pxPerFrame = useTimelineStore((s) => s.pxPerFrame);
  const setPlayhead = useTimelineStore((s) => s.setPlayhead);

  const pxPerSecond = pxPerFrame * FPS;
  const seconds = Math.ceil(widthPx / pxPerSecond);
  // label every 5s normally; spread out when zoomed far out
  const labelEvery = pxPerSecond >= 30 ? 5 : 15;

  function scrub(e: React.PointerEvent) {
    if (e.button !== 0) return;
    const el = e.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    const toFrame = (clientX: number) =>
      Math.round((clientX - rect.left) / pxPerFrame);
    setPlayhead(toFrame(e.clientX));
    el.setPointerCapture(e.pointerId);

    const onMove = (ev: PointerEvent) => setPlayhead(toFrame(ev.clientX));
    const onUp = () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
  }

  return (
    <div
      onPointerDown={scrub}
      className="relative h-7 shrink-0 cursor-ew-resize touch-none border-b border-border"
      style={{ width: widthPx }}
    >
      {Array.from({ length: seconds + 1 }, (_, s) => (
        <div
          key={s}
          className="absolute bottom-0"
          style={{ left: s * pxPerSecond }}
        >
          <div
            className={
              s % labelEvery === 0
                ? "h-2.5 w-px bg-muted-foreground/60"
                : "h-1.5 w-px bg-muted-foreground/30"
            }
          />
          {s % labelEvery === 0 && (
            <span className="label-mono absolute bottom-3 left-0 -translate-x-1/2 text-muted-foreground select-none first:translate-x-0">
              {Math.floor(s / 60)}:{String(s % 60).padStart(2, "0")}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
