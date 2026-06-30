"use client";

import type { Track } from "@clipline/timeline";
import { useState } from "react";
import { toast } from "sonner";
import { useTimelineStore } from "@/store/timeline";
import type { Asset } from "@/lib/api";
import { ASSET_DRAG_TYPE } from "./drag-types";
import { ClipBlock } from "./clip-block";

export function TrackRow({
  track,
  assetsById,
}: {
  track: Track;
  assetsById: Map<string, Asset>;
}) {
  const pxPerFrame = useTimelineStore((s) => s.pxPerFrame);
  const addClip = useTimelineStore((s) => s.addClip);
  const [dropOk, setDropOk] = useState(false);

  function frameFromEvent(e: React.DragEvent) {
    const rect = e.currentTarget.getBoundingClientRect();
    return Math.max(0, Math.round((e.clientX - rect.left) / pxPerFrame));
  }

  return (
    <div
      data-drop={dropOk || undefined}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes(ASSET_DRAG_TYPE)) return;
        e.preventDefault();
        setDropOk(true);
      }}
      onDragLeave={() => setDropOk(false)}
      onDrop={(e) => {
        setDropOk(false);
        const raw = e.dataTransfer.getData(ASSET_DRAG_TYPE);
        if (!raw) return;
        e.preventDefault();
        try {
          const { assetId, kind } = JSON.parse(raw) as {
            assetId: string;
            kind: "video" | "audio";
          };
          if (kind !== track.kind) return;
          if (!addClip(track.id, assetId, frameFromEvent(e))) {
            toast.error("No room on this track", {
              description: "The clip doesn't fit within the 2-minute limit.",
            });
          }
        } catch {
          // malformed drag payload — ignore
        }
      }}
      className="relative h-12 rounded-md border border-transparent bg-muted/20 transition-colors duration-100 data-drop:border-ring data-drop:bg-muted/40"
    >
      {(track.clips as Track["clips"]).map((clip) => (
        <ClipBlock
          key={clip.id}
          clip={clip}
          trackId={track.id}
          asset={
            clip.kind === "text" || clip.kind === "graphic" || clip.kind === "caption"
              ? undefined
              : assetsById.get(clip.assetId)
          }
        />
      ))}
    </div>
  );
}
