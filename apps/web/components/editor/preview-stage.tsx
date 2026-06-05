"use client";

import { Pause, Play, SkipBack } from "lucide-react";
import { useEffect, useRef } from "react";
import { Logo } from "@/components/logo";
import { Timecode } from "@/components/timeline/timecode";
import { Button } from "@/components/ui/button";
import type { Asset } from "@/lib/api";
import { PreviewEngine } from "@/lib/preview/engine";
import { selectDuration, useTimelineStore } from "@/store/timeline";

/**
 * Center 9:16 stage: a 1080x1920 canvas the PreviewEngine composites into,
 * scaled to fit. Transport: play/pause (Space), jump to start.
 */
export function PreviewStage({ assets }: { assets: Asset[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<PreviewEngine | null>(null);
  const isPlaying = useTimelineStore((s) => s.isPlaying);
  const setPlayhead = useTimelineStore((s) => s.setPlayhead);
  const isEmpty = useTimelineStore((s) => selectDuration(s) === 0);

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

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-muted/20">
      <div className="relative flex min-h-0 flex-1 items-center justify-center p-4">
        <canvas
          ref={canvasRef}
          className="max-h-full max-w-full rounded-lg border border-border shadow-[0_16px_48px_-16px_rgb(0_0_0/0.5)]"
          style={{ aspectRatio: "9 / 16" }}
        />
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
