"use client";

import { FPS } from "@clipline/timeline";
import { useEffect, useRef } from "react";
import { useTimelineStore } from "@/store/timeline";

export function formatTimecode(frame: number): string {
  const m = Math.floor(frame / FPS / 60);
  const s = Math.floor(frame / FPS) % 60;
  const f = frame % FPS;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}:${String(f).padStart(2, "0")}`;
}

/** Mono timecode display; transient store subscription, no re-renders. */
export function Timecode({ className }: { className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const apply = () => {
      if (ref.current) {
        ref.current.textContent = formatTimecode(
          useTimelineStore.getState().playheadFrame,
        );
      }
    };
    apply();
    return useTimelineStore.subscribe((state, prev) => {
      if (state.playheadFrame !== prev.playheadFrame) apply();
    });
  }, []);

  return (
    <span
      ref={ref}
      className={`label-mono tabular-nums text-muted-foreground ${className ?? ""}`}
    />
  );
}
