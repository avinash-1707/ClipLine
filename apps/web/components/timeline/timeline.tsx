"use client";

import { FPS, MAX_DURATION_IN_FRAMES } from "@clipline/timeline";
import { Minus, Plus, Scissors, Shapes, Trash2, Type } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { GraphicPreset } from "@/lib/timeline-ops";

const GRAPHIC_PRESETS: Array<{ preset: GraphicPreset; label: string }> = [
  { preset: "lower-third", label: "Lower third" },
  { preset: "badge", label: "Day badge" },
  { preset: "progress-bar", label: "Progress bar" },
  { preset: "overlay", label: "Color overlay" },
  { preset: "shape", label: "Shape" },
];
import { useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import type { Asset } from "@/lib/api";
import { selectDuration, useTimelineStore } from "@/store/timeline";
import { Playhead } from "./playhead";
import { Ruler } from "./ruler";
import { Timecode } from "./timecode";
import { TrackRow } from "./track-row";

export function Timeline({ assets }: { assets: Asset[] }) {
  const timeline = useTimelineStore((s) => s.timeline);
  const pxPerFrame = useTimelineStore((s) => s.pxPerFrame);
  const setZoom = useTimelineStore((s) => s.setZoom);
  const hasSelection = useTimelineStore((s) => s.selectedClipId !== null);
  const split = useTimelineStore((s) => s.splitSelectedAtPlayhead);
  const removeSelected = useTimelineStore((s) => s.removeSelected);
  const select = useTimelineStore((s) => s.select);
  const setPlayhead = useTimelineStore((s) => s.setPlayhead);
  const addText = useTimelineStore((s) => s.addTextAtPlayhead);
  const addGraphic = useTimelineStore((s) => s.addGraphicAtPlayhead);
  const duration = useTimelineStore(selectDuration);

  const assetsById = useMemo(
    () => new Map(assets.map((a) => [a.id, a])),
    [assets],
  );

  // Keyboard: S split, Delete remove, arrows nudge playhead. Instant, no motion.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, [contenteditable]")) return;
      const state = useTimelineStore.getState();
      switch (e.key) {
        case "s":
        case "S":
          split();
          break;
        case "Delete":
        case "Backspace":
          removeSelected();
          break;
        case "ArrowLeft":
          e.preventDefault();
          setPlayhead(state.playheadFrame - (e.shiftKey ? 10 : 1));
          break;
        case "ArrowRight":
          e.preventDefault();
          setPlayhead(state.playheadFrame + (e.shiftKey ? 10 : 1));
          break;
        case "Escape":
          select(null);
          break;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [split, removeSelected, setPlayhead, select]);

  if (!timeline) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="label-mono text-muted-foreground/60">
          Loading timeline…
        </span>
      </div>
    );
  }

  // canvas width: content + 10 s of headroom, capped at the duration limit
  const contentFrames = Math.min(
    Math.max(duration + 10 * FPS, 60 * FPS),
    MAX_DURATION_IN_FRAMES,
  );
  const widthPx = contentFrames * pxPerFrame;

  return (
    <div className="flex h-full flex-col">
      {/* toolbar */}
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-border px-3">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Split clip at playhead (S)"
            title="Split at playhead (S)"
            disabled={!hasSelection}
            onClick={split}
          >
            <Scissors className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Delete selected clip (Del)"
            title="Delete selected (Del)"
            disabled={!hasSelection}
            onClick={removeSelected}
          >
            <Trash2 className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Add text at playhead"
            title="Add text at playhead"
            onClick={() => {
              if (!addText()) {
                toast.error("No room for text here", {
                  description:
                    "The text track is occupied at the playhead position.",
                });
              }
            }}
          >
            <Type className="size-3.5" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Add graphic at playhead"
                  title="Add graphic at playhead"
                >
                  <Shapes className="size-3.5" />
                </Button>
              }
            />
            <DropdownMenuContent align="start">
              {GRAPHIC_PRESETS.map(({ preset, label }) => (
                <DropdownMenuItem
                  key={preset}
                  onClick={() => {
                    if (!addGraphic(preset)) {
                      toast.error("No room for a graphic here", {
                        description:
                          "The graphics track is occupied at the playhead position.",
                      });
                    }
                  }}
                >
                  {label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <Timecode />
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Zoom out"
            onClick={() => setZoom(pxPerFrame / 1.4)}
          >
            <Minus className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Zoom in"
            onClick={() => setZoom(pxPerFrame * 1.4)}
          >
            <Plus className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* gutter + scrollable canvas */}
      <div className="flex min-h-0 flex-1">
        <div className="flex w-10 shrink-0 flex-col border-r border-border pt-7">
          {timeline.tracks.map((t) => (
            <div
              key={t.id}
              className="label-mono flex h-12 items-center justify-center text-muted-foreground"
              style={{ marginBottom: 8 }}
            >
              {t.name}
            </div>
          ))}
        </div>

        <div
          className="relative min-w-0 flex-1 overflow-x-auto overflow-y-hidden"
          onPointerDown={(e) => {
            // click on empty canvas clears selection
            if (e.target === e.currentTarget) select(null);
          }}
        >
          <div className="relative" style={{ width: widthPx }}>
            <Ruler widthPx={widthPx} />
            <div className="space-y-2 py-2">
              {timeline.tracks.map((track) => (
                <TrackRow
                  key={track.id}
                  track={track}
                  assetsById={assetsById}
                />
              ))}
            </div>
            <Playhead />
          </div>
          {/* empty state: no clips anywhere yet */}
          {duration === 0 && (
            <div className="pointer-events-none absolute inset-0 top-7 flex items-center justify-center">
              <p className="label-mono text-muted-foreground/70">
                Drag media from the library onto a track to start cutting
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
