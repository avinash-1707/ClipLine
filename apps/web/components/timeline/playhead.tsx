"use client";

import { useEffect, useRef } from "react";
import { useTimelineStore } from "@/store/timeline";

/**
 * Vertical playhead line across ruler + tracks. Subscribes to the store
 * transiently and writes the transform straight to the DOM — zero React
 * re-renders during playback (60fps budget).
 */
export function Playhead() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const apply = () => {
      const { playheadFrame, pxPerFrame } = useTimelineStore.getState();
      if (ref.current) {
        ref.current.style.transform = `translateX(${playheadFrame * pxPerFrame}px)`;
      }
    };
    apply();
    return useTimelineStore.subscribe((state, prev) => {
      if (
        state.playheadFrame !== prev.playheadFrame ||
        state.pxPerFrame !== prev.pxPerFrame
      ) {
        apply();
      }
    });
  }, []);

  return (
    <div
      ref={ref}
      className="pointer-events-none absolute inset-y-0 z-10 w-px bg-destructive"
    >
      <div className="absolute -top-0 -left-[5px] size-0 border-x-[5px] border-t-[6px] border-x-transparent border-t-destructive" />
    </div>
  );
}
