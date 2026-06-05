"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ASSET_DRAG_TYPE } from "@/components/timeline/drag-types";
import { useAssets } from "@/lib/use-assets";
import {
  AlertCircle,
  AudioLines,
  Loader2,
  Trash2,
  Upload,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { api, type Asset } from "@/lib/api";

function formatFrames(frames: number | null) {
  if (frames == null) return "";
  const totalSeconds = frames / 30;
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function MediaLibrary({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const assets = useAssets(projectId);

  const upload = useMutation({
    mutationFn: (file: File) => api.assets.upload(projectId, file),
    onSuccess: () => {
      setUploadError(null);
      queryClient.invalidateQueries({ queryKey: ["assets", projectId] });
    },
    onError: (error) => setUploadError(error.message),
  });

  const remove = useMutation({
    mutationFn: api.assets.delete,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["assets", projectId] }),
  });

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files) return;
      for (const file of files) {
        if (file.type.startsWith("video/") || file.type.startsWith("audio/")) {
          upload.mutate(file);
        }
      }
    },
    [upload],
  );

  return (
    <div
      className="flex flex-1 flex-col"
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        handleFiles(e.dataTransfer.files);
      }}
    >
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-border px-4">
        <span className="label-mono text-muted-foreground">Media</span>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Upload media"
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="size-4" />
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="video/*,audio/*"
          multiple
          hidden
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {/* drop target highlight — border only, no motion needed */}
      <div
        data-drag={dragOver || undefined}
        className="m-2 flex flex-1 flex-col overflow-hidden rounded-md border border-transparent transition-colors duration-150 data-drag:border-ring data-drag:bg-muted/30"
      >
        {assets.isLoading ? (
          <div className="space-y-2 p-2">
            {Array.from({ length: 3 }, (_, i) => (
              <div
                key={i}
                className="h-14 animate-pulse rounded-md bg-muted/40"
              />
            ))}
          </div>
        ) : !assets.data || assets.data.length === 0 ? (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex flex-1 cursor-pointer flex-col items-center justify-center gap-2.5 p-6 text-center"
          >
            <Upload
              className="size-5 text-muted-foreground/60"
              strokeWidth={1.5}
            />
            <p className="text-xs leading-relaxed text-muted-foreground">
              Drop video or audio here,
              <br />
              or click to browse.
            </p>
          </button>
        ) : (
          <ScrollArea className="flex-1">
            <ul className="space-y-1.5 p-2">
              <AnimatePresence initial={false}>
                {(upload.isPending ? 1 : 0) > 0 && (
                  <motion.li
                    key="uploading"
                    initial={{ opacity: 0, y: 6, filter: "blur(3px)" }}
                    animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.18, ease: [0.21, 0.47, 0.32, 0.98] }}
                    className="flex h-14 items-center gap-3 rounded-md border border-dashed border-border px-3"
                  >
                    <Loader2 className="size-4 animate-spin text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">
                      Uploading…
                    </span>
                  </motion.li>
                )}
                {assets.data.map((asset) => (
                  <AssetCard
                    key={asset.id}
                    asset={asset}
                    onDelete={() => remove.mutate(asset.id)}
                  />
                ))}
              </AnimatePresence>
            </ul>
          </ScrollArea>
        )}

        {uploadError && (
          <p className="border-t border-border px-3 py-2 text-xs text-destructive">
            {uploadError}
          </p>
        )}
      </div>
    </div>
  );
}

function AssetCard({
  asset,
  onDelete,
}: {
  asset: Asset;
  onDelete: () => void;
}) {
  const isReady = asset.status === "ready";
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 6, filter: "blur(3px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      exit={{ opacity: 0, transition: { duration: 0.12 } }}
      transition={{ duration: 0.18, ease: [0.21, 0.47, 0.32, 0.98] }}
      draggable={isReady}
      onDragStart={(e) => {
        const dt = (e as unknown as React.DragEvent).dataTransfer;
        dt.setData(
          ASSET_DRAG_TYPE,
          JSON.stringify({ assetId: asset.id, kind: asset.kind }),
        );
        dt.effectAllowed = "copy";
      }}
      className="group flex h-14 items-center gap-3 overflow-hidden rounded-md border border-border bg-card px-2.5 transition-colors hover:bg-muted/40 data-ready:cursor-grab"
      data-ready={isReady || undefined}
    >
      {/* thumb */}
      <div className="flex h-10 w-[26px] shrink-0 items-center justify-center overflow-hidden rounded-sm bg-muted">
        {asset.status === "processing" ? (
          <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
        ) : asset.status === "failed" ? (
          <AlertCircle className="size-3.5 text-destructive" />
        ) : asset.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={asset.thumbnailUrl}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <AudioLines className="size-3.5 text-muted-foreground" />
        )}
      </div>

      {/* meta */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium">{asset.originalFilename}</p>
        <p className="label-mono mt-0.5 text-muted-foreground">
          {asset.status === "processing"
            ? "Processing…"
            : asset.status === "failed"
              ? "Failed"
              : `${asset.kind} · ${formatFrames(asset.durationInFrames)}`}
        </p>
      </div>

      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Delete ${asset.originalFilename}`}
        className="opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-visible:opacity-100"
        onClick={onDelete}
      >
        <Trash2 className="size-3.5" />
      </Button>
    </motion.li>
  );
}
