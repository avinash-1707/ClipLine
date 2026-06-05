"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Clapperboard } from "lucide-react";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { Inspector } from "./inspector";
import { MediaLibrary } from "./media-library";
import { PreviewStage } from "./preview-stage";
import { TimelineDock } from "./timeline-dock";

export function EditorShell({ projectId }: { projectId: string }) {
  const project = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => api.projects.get(projectId),
  });

  if (project.isError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background">
        <p className="text-sm text-muted-foreground">Project not found.</p>
        <Button variant="outline" size="sm" render={<Link href="/projects" />}>
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
            render={<Link href="/projects" />}
          >
            <ArrowLeft className="size-4" />
          </Button>
          <div className="flex items-center gap-2 pl-1">
            <Clapperboard className="size-4" strokeWidth={1.75} />
            <span className="max-w-48 truncate text-sm font-medium tracking-tight">
              {project.data?.name ?? "…"}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="label-mono hidden text-muted-foreground sm:block">
            1080 × 1920 · 30fps
          </span>
          <ThemeToggle />
          <Button size="sm" disabled title="Export arrives with the render unit">
            Export
          </Button>
        </div>
      </header>

      {/* Workspace: media | stage | inspector */}
      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-72 shrink-0 border-r border-border md:flex md:flex-col">
          <MediaLibrary projectId={projectId} />
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          <PreviewStage />
        </main>

        <aside className="hidden w-64 shrink-0 border-l border-border lg:flex lg:flex-col">
          <Inspector />
        </aside>
      </div>

      {/* Timeline dock */}
      <footer className="h-56 shrink-0 border-t border-border">
        <TimelineDock />
      </footer>
    </div>
  );
}
