"use client";

import { useTimelineStore } from "@/store/timeline";

/**
 * Vertical playhead line across ruler + tracks. Subscribes narrowly so a
 * playhead tick re-renders only this element (perf budget).
 */
export function Playhead() {
  const frame = useTimelineStore((s) => s.playheadFrame);
  const pxPerFrame = useTimelineStore((s) => s.pxPerFrame);

  return (
    <div
      className="pointer-events-none absolute inset-y-0 z-10 w-px bg-destructive"
      style={{ transform: `translateX(${frame * pxPerFrame}px)` }}
    >
      <div className="absolute -top-0 -left-[5px] size-0 border-x-[5px] border-t-[6px] border-x-transparent border-t-destructive" />
    </div>
  );
}
