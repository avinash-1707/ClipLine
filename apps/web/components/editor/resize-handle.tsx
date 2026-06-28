"use client";

import { Separator } from "react-resizable-panels";
import { cn } from "@/lib/utils";

/**
 * Hairline divider that doubles as a drag target between resizable panels.
 * Renders a 6px grab area around a 1px line; the line brightens on hover/drag.
 *
 * `orientation` is the parent group's orientation: a horizontal group lays
 * panels side by side, so its separators are vertical bars (and vice versa).
 */
export function ResizeHandle({
  orientation,
}: {
  orientation: "horizontal" | "vertical";
}) {
  const isVerticalBar = orientation === "horizontal";
  return (
    <Separator
      className={cn(
        "group/sep relative flex shrink-0 items-center justify-center bg-transparent outline-none",
        isVerticalBar ? "w-1.5 cursor-col-resize" : "h-1.5 cursor-row-resize",
      )}
    >
      <span
        className={cn(
          "bg-border transition-colors duration-150",
          "group-hover/sep:bg-foreground/30 group-data-[separator=active]/sep:bg-foreground/40",
          isVerticalBar ? "h-full w-px" : "h-px w-full",
        )}
      />
    </Separator>
  );
}
