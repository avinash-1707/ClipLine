"use client";

import { SlidersHorizontal } from "lucide-react";

/**
 * Right panel. Selection-driven controls (trim, gain, color, text) arrive
 * with the effects unit; until then this states its purpose quietly.
 */
export function Inspector() {
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex h-10 shrink-0 items-center border-b border-border px-4">
        <span className="label-mono text-muted-foreground">Inspector</span>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-2.5 p-6 text-center">
        <SlidersHorizontal
          className="size-5 text-muted-foreground/60"
          strokeWidth={1.5}
        />
        <p className="text-xs leading-relaxed text-muted-foreground">
          Select a clip on the timeline to edit trim, gain and color.
        </p>
      </div>
    </div>
  );
}
