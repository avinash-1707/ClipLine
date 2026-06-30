"use client";

import { CircleAlert, CircleCheck, Info, Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { useTimelineStore } from "@/store/timeline";
import { groupWordsIntoCaptions, FPS } from "@clipline/timeline";

// SSE progress event from the transcribe endpoint.
interface TranscribeProgressEvent {
  status: "queued" | "downloading" | "transcribing" | "completed" | "failed";
  error?: string | null;
}

// Each row in the phase list UI.
type PhaseStep =
  | "queued"
  | "downloading"
  | "transcribing"
  | "building"
  | "done";

const PHASE_LABELS: Record<PhaseStep, string> = {
  queued: "Queued",
  downloading: "Downloading audio",
  transcribing: "Transcribing",
  building: "Building captions",
  done: "Done",
};

// The ordered sequence — used for ordering + rendering.
const PHASE_ORDER: PhaseStep[] = [
  "queued",
  "downloading",
  "transcribing",
  "building",
  "done",
];

function phaseIndexOf(step: PhaseStep): number {
  return PHASE_ORDER.indexOf(step);
}

// Map SSE status to UI phase step.
function statusToPhase(
  status: TranscribeProgressEvent["status"],
): PhaseStep {
  switch (status) {
    case "queued":
      return "queued";
    case "downloading":
      return "downloading";
    case "transcribing":
      return "transcribing";
    case "completed":
      return "building";
    default:
      return "queued";
  }
}

type DialogState =
  | { kind: "running"; activePhase: PhaseStep }
  | { kind: "empty" }
  | { kind: "done"; count: number }
  | { kind: "failed"; message: string };

export function SubtitlesDialog({
  projectId,
  open,
  onOpenChange,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [state, setState] = useState<DialogState>({
    kind: "running",
    activePhase: "queued",
  });
  const sourceRef = useRef<EventSource | null>(null);

  const start = useCallback(async () => {
    try {
      // Flush any pending edits so the render sees the latest timeline.
      const { projectId: pid, timeline, setSaveState } =
        useTimelineStore.getState();
      if (pid && timeline) {
        await api.projects.saveTimeline(pid, timeline);
        setSaveState("saved");
      }

      const job = await api.transcribe.start(projectId);

      const source = new EventSource(api.transcribe.progressUrl(job.id));
      sourceRef.current = source;

      source.addEventListener("progress", (e) => {
        const data = JSON.parse(
          (e as MessageEvent).data,
        ) as TranscribeProgressEvent;

        if (data.status === "failed") {
          setState({
            kind: "failed",
            message: data.error ?? "Transcription failed",
          });
          source.close();
          return;
        }

        if (data.status === "completed") {
          // Move to "building" phase while we fetch and group captions.
          setState({ kind: "running", activePhase: "building" });
          source.close();

          void (async () => {
            try {
              const { result } = await api.transcribe.get(job.id);
              const words = result?.words ?? [];
              const clips = groupWordsIntoCaptions({ words, fps: FPS });

              if (clips.length === 0) {
                setState({ kind: "empty" });
                return;
              }

              useTimelineStore.getState().addCaptions(clips);
              setState({ kind: "done", count: clips.length });
            } catch (err) {
              setState({
                kind: "failed",
                message:
                  err instanceof Error
                    ? err.message
                    : "Failed to build captions",
              });
            }
          })();

          return;
        }

        setState({ kind: "running", activePhase: statusToPhase(data.status) });
      });

      source.onerror = () => {
        // EventSource retries on transient errors; only fail when closed.
        if (source.readyState === EventSource.CLOSED) {
          setState({
            kind: "failed",
            message: "Progress stream lost — please try again.",
          });
        }
      };
    } catch (err) {
      setState({
        kind: "failed",
        message:
          err instanceof Error ? err.message : "Failed to start transcription",
      });
    }
  }, [projectId]);

  // start() only sets state after network awaits resolve (SSE events),
  // never synchronously in the effect body — identical pattern to ExportDialog.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
          <DialogTitle>Subtitles</DialogTitle>
        </DialogHeader>

        {/* Phase list: queued / downloading / transcribing / building / done */}
        {state.kind === "running" && (
          <PhaseList activePhase={state.activePhase} />
        )}

        {/* Empty speech terminal state */}
        {state.kind === "empty" && (
          <div className="space-y-4 py-2">
            <div className="flex items-start gap-2.5">
              <Info className="mt-0.5 size-4 shrink-0 text-[var(--caption-accent)]" />
              <p className="text-sm text-muted-foreground">
                No speech detected in your voiceover.
              </p>
            </div>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => onOpenChange(false)}
            >
              Dismiss
            </Button>
          </div>
        )}

        {/* Done terminal state */}
        {state.kind === "done" && (
          <div className="space-y-4 py-2">
            <div className="flex items-start gap-2.5">
              <CircleCheck className="mt-0.5 size-4 shrink-0 text-[var(--caption-accent)]" />
              <p className="text-sm text-muted-foreground">
                Added {state.count} caption{state.count === 1 ? "" : "s"}.
              </p>
            </div>
            <Button className="w-full" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          </div>
        )}

        {/* Failed terminal state */}
        {state.kind === "failed" && (
          <div className="space-y-4 py-2">
            <div className="flex items-start gap-2.5">
              <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
              <p className="text-sm text-muted-foreground">{state.message}</p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setState({ kind: "running", activePhase: "queued" });
                  void start();
                }}
              >
                Try again
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => onOpenChange(false)}
              >
                Dismiss
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Phase list rows with done/active/pending states. */
function PhaseList({ activePhase }: { activePhase: PhaseStep }) {
  const activeIndex = phaseIndexOf(activePhase);

  return (
    <div className="space-y-2.5 py-2">
      {PHASE_ORDER.map((step, i) => {
        const isDone = i < activeIndex;
        const isActive = i === activeIndex;

        return (
          <div key={step} className="flex items-center gap-3">
            {/* Status icon */}
            <div className="flex size-4 shrink-0 items-center justify-center">
              {isDone ? (
                <CircleCheck className="size-4 text-[var(--caption-accent)]" />
              ) : isActive ? (
                <Loader2 className="size-4 animate-spin text-[var(--caption-accent)]" />
              ) : (
                <span className="size-1.5 rounded-full bg-border" />
              )}
            </div>

            {/* Label */}
            <span
              className={
                isDone
                  ? "label-mono text-muted-foreground/70"
                  : isActive
                    ? "label-mono text-foreground"
                    : "label-mono text-muted-foreground/40"
              }
            >
              {PHASE_LABELS[step]}
            </span>
          </div>
        );
      })}
    </div>
  );
}
