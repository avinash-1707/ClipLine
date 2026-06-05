"use client";

import { CircleAlert, Download, Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { api } from "@/lib/api";
import { useTimelineStore } from "@/store/timeline";

interface ProgressEvent {
  status: "queued" | "rendering" | "completed" | "failed";
  progress?: number;
  outputUrl?: string | null;
  error?: string | null;
}

type Phase =
  | { step: "submitting" }
  | { step: "rendering"; progress: number }
  | { step: "done"; outputUrl: string }
  | { step: "failed"; message: string };

export function ExportDialog({
  projectId,
  open,
  onOpenChange,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [phase, setPhase] = useState<Phase>({ step: "submitting" });
  const sourceRef = useRef<EventSource | null>(null);

  const start = useCallback(async () => {
    setPhase({ step: "submitting" });
    try {
      // flush any pending edits so the render sees the latest timeline
      const { projectId: pid, timeline, setSaveState } =
        useTimelineStore.getState();
      if (pid && timeline) {
        await api.projects.saveTimeline(pid, timeline);
        setSaveState("saved");
      }

      const job = await api.render.start(projectId);
      setPhase({ step: "rendering", progress: 0 });

      const source = new EventSource(api.render.progressUrl(job.id));
      sourceRef.current = source;
      source.addEventListener("progress", (e) => {
        const data = JSON.parse((e as MessageEvent).data) as ProgressEvent;
        if (data.status === "completed" && data.outputUrl) {
          setPhase({ step: "done", outputUrl: data.outputUrl });
          source.close();
        } else if (data.status === "failed") {
          setPhase({ step: "failed", message: data.error ?? "render failed" });
          source.close();
        } else {
          setPhase({ step: "rendering", progress: data.progress ?? 0 });
        }
      });
      source.onerror = () => {
        // EventSource retries on transient errors; only fail when closed
        if (source.readyState === EventSource.CLOSED) {
          setPhase({ step: "failed", message: "progress stream lost" });
        }
      };
    } catch (error) {
      setPhase({
        step: "failed",
        message: error instanceof Error ? error.message : "export failed",
      });
    }
  }, [projectId]);

  useEffect(() => {
    if (open) void start();
    return () => {
      sourceRef.current?.close();
      sourceRef.current = null;
    };
  }, [open, start]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Export</DialogTitle>
        </DialogHeader>

        {phase.step === "submitting" && (
          <div className="flex items-center gap-3 py-2">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              Submitting render…
            </span>
          </div>
        )}

        {phase.step === "rendering" && (
          <div className="space-y-3 py-2">
            <Progress value={phase.progress * 100} />
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-muted-foreground">
                Rendering 1080 × 1920 H.264
              </span>
              <span className="label-mono tabular-nums text-foreground/70">
                {Math.round(phase.progress * 100)}%
              </span>
            </div>
          </div>
        )}

        {phase.step === "done" && (
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Render complete. Your video is ready.
            </p>
            <Button
              className="w-full"
              render={
                <a
                  href={phase.outputUrl}
                  download
                  target="_blank"
                  rel="noreferrer"
                />
              }
            >
              <Download className="size-4" />
              Download MP4
            </Button>
          </div>
        )}

        {phase.step === "failed" && (
          <div className="space-y-4 py-2">
            <div className="flex items-start gap-2.5">
              <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
              <p className="text-sm text-muted-foreground">{phase.message}</p>
            </div>
            <Button variant="outline" className="w-full" onClick={start}>
              Try again
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
