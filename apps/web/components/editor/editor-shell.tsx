"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Group, Panel, useDefaultLayout } from "react-resizable-panels";
import { Logo } from "@/components/logo";
import { useEffect, useState } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Timeline } from "@/components/timeline/timeline";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { panelStorage } from "@/lib/panel-storage";
import { useAssets } from "@/lib/use-assets";
import { useAutosave } from "@/lib/use-autosave";
import { useMediaQuery } from "@/lib/use-media-query";
import { useTimelineStore, type SaveState } from "@/store/timeline";
import { ExportDialog } from "./export-dialog";
import { Inspector } from "./inspector";
import { MediaLibrary } from "./media-library";
import { PreviewStage } from "./preview-stage";
import { ResizeHandle } from "./resize-handle";

const SAVE_LABEL: Record<SaveState, string> = {
  idle: "",
  dirty: "Unsaved",
  saving: "Saving…",
  saved: "Saved",
  error: "Save failed",
};

function SaveBadge() {
  const saveState = useTimelineStore((s) => s.saveState);
  if (!SAVE_LABEL[saveState]) return null;
  return (
    <span
      data-error={saveState === "error" || undefined}
      className="label-mono text-muted-foreground data-error:text-destructive"
    >
      {SAVE_LABEL[saveState]}
    </span>
  );
}

function ExportButton({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const hasContent = useTimelineStore(
    (s) => (s.timeline?.tracks.some((t) => t.clips.length > 0) ?? false),
  );
  return (
    <>
      <Button
        size="sm"
        disabled={!hasContent}
        title={hasContent ? "Render and download" : "Timeline is empty"}
        onClick={() => setOpen(true)}
      >
        Export
      </Button>
      {open && (
        <ExportDialog
          projectId={projectId}
          open={open}
          onOpenChange={setOpen}
        />
      )}
    </>
  );
}

export function EditorShell({ projectId }: { projectId: string }) {
  const project = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => api.projects.get(projectId),
  });
  const assets = useAssets(projectId);
  const load = useTimelineStore((s) => s.load);
  const registerAssets = useTimelineStore((s) => s.registerAssets);

  // Side panels collapse on narrow viewports (media < md, inspector < lg).
  const showMedia = useMediaQuery("(min-width: 768px)");
  const showInspector = useMediaQuery("(min-width: 1024px)");

  // Persist panel sizes per layout. The horizontal layout is keyed on which
  // side panels are visible, so each viewport breakpoint remembers its own sizes.
  const verticalLayout = useDefaultLayout({
    id: "clipline-editor-vertical-v2",
    panelIds: ["workspace", "timeline"],
    storage: panelStorage,
  });
  const horizontalLayout = useDefaultLayout({
    id: "clipline-editor-horizontal-v2",
    panelIds: [
      ...(showMedia ? ["media"] : []),
      "stage",
      ...(showInspector ? ["inspector"] : []),
    ],
    storage: panelStorage,
  });

  useAutosave();

  // hydrate the store once per project load
  useEffect(() => {
    if (project.data) load(project.data.id, project.data.timeline);
  }, [project.data, load]);

  // timeline ops need asset durations
  useEffect(() => {
    if (!assets.data) return;
    registerAssets(
      assets.data
        .filter((a) => a.status === "ready" && a.durationInFrames != null)
        .map((a) => ({
          id: a.id,
          kind: a.kind,
          durationInFrames: a.durationInFrames!,
          width: a.width ?? undefined,
          height: a.height ?? undefined,
        })),
    );
  }, [assets.data, registerAssets]);

  if (project.isError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background">
        <p className="text-sm text-muted-foreground">Project not found.</p>
        <Button
          variant="outline"
          size="sm"
          nativeButton={false}
          render={<Link href="/projects" />}
        >
          <ArrowLeft className="size-4" />
          Back to projects
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      {/* Top bar */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-border px-3">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Back to projects"
            nativeButton={false}
            render={<Link href="/projects" />}
          >
            <ArrowLeft className="size-4" />
          </Button>
          <div className="flex items-center gap-2 pl-1">
            <Logo className="size-4" />
            <span className="max-w-48 truncate text-sm font-medium tracking-tight">
              {project.data?.name ?? "…"}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <SaveBadge />
          <span className="label-mono hidden text-muted-foreground sm:block">
            1080 × 1920 · 30fps
          </span>
          <ThemeToggle />
          <ExportButton projectId={projectId} />
        </div>
      </header>

      {/* Resizable workspace: (media | stage | inspector) over timeline.
          Group hard-sets inline height:100%, so it must live inside a
          flex-1/min-h-0 box or it would take the full viewport (ignoring the
          header) and overflow. */}
      <div className="min-h-0 flex-1">
        <Group
          orientation="vertical"
          defaultLayout={verticalLayout.defaultLayout}
          onLayoutChanged={verticalLayout.onLayoutChanged}
        >
          <Panel id="workspace" defaultSize="68%" minSize="40%">
            <Group
              orientation="horizontal"
              defaultLayout={horizontalLayout.defaultLayout}
              onLayoutChanged={horizontalLayout.onLayoutChanged}
            >
            {showMedia && (
              <>
                <Panel
                  id="media"
                  defaultSize="288px"
                  minSize="240px"
                  maxSize="480px"
                  groupResizeBehavior="preserve-pixel-size"
                >
                  <MediaLibrary projectId={projectId} />
                </Panel>
                <ResizeHandle orientation="horizontal" />
              </>
            )}

            {/* Stage is the flexible filler: no defaultSize → flexGrow:1.
                The lib panel is display:flex/row (inline, unoverridable), so an
                explicit h-full column box gives the preview a definite height —
                without it the 9:16 canvas's max-h-full has nothing to resolve
                against and overflows vertically. */}
            <Panel id="stage" minSize="320px">
              <div className="flex h-full min-h-0 w-full min-w-0 flex-col">
                <PreviewStage assets={assets.data ?? []} />
              </div>
            </Panel>

            {showInspector && (
              <>
                <ResizeHandle orientation="horizontal" />
                <Panel
                  id="inspector"
                  defaultSize="280px"
                  minSize="240px"
                  maxSize="420px"
                  groupResizeBehavior="preserve-pixel-size"
                >
                  <Inspector />
                </Panel>
              </>
            )}
            </Group>
          </Panel>

          <ResizeHandle orientation="vertical" />

          <Panel id="timeline" defaultSize="32%" minSize="15%" maxSize="60%">
            <Timeline assets={assets.data ?? []} />
          </Panel>
        </Group>
      </div>
    </div>
  );
}
