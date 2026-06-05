"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clapperboard, Film, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function ProjectsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");

  const projects = useQuery({
    queryKey: ["projects"],
    queryFn: api.projects.list,
  });

  const create = useMutation({
    mutationFn: api.projects.create,
    onSuccess: (project) => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      router.push(`/editor/${project.id}`);
    },
    onError: (error) =>
      toast.error("Couldn't create project", { description: error.message }),
  });

  const remove = useMutation({
    mutationFn: api.projects.delete,
    onSuccess: () => {
      toast.success("Project deleted");
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
    onError: (error) =>
      toast.error("Couldn't delete project", { description: error.message }),
  });

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="mx-auto flex w-full max-w-4xl items-center justify-between px-6 py-5">
        <Link href="/" className="flex items-center gap-2.5">
          <Clapperboard className="size-4.5" strokeWidth={1.75} />
          <span className="text-[15px] font-medium tracking-tight">
            Clipline
          </span>
        </Link>
        <ThemeToggle />
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-6 pb-24">
        <div className="flex items-end justify-between border-b border-border pb-5 pt-10">
          <div>
            <p className="label-mono text-muted-foreground">Projects</p>
            <h1 className="font-display mt-2 text-3xl">Your edits</h1>
          </div>

          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger
              render={
                <Button>
                  <Plus className="size-4" />
                  New project
                </Button>
              }
            />
            <DialogContent className="sm:max-w-sm">
              <DialogHeader>
                <DialogTitle>New project</DialogTitle>
              </DialogHeader>
              <form
                className="flex flex-col gap-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  const trimmed = name.trim();
                  if (trimmed) create.mutate(trimmed);
                }}
              >
                <Input
                  autoFocus
                  placeholder="e.g. Monday reel"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                <Button type="submit" disabled={!name.trim() || create.isPending}>
                  {create.isPending ? "Creating…" : "Create and open"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {projects.isLoading ? (
          <div className="space-y-px pt-px">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-md bg-muted/40" />
            ))}
          </div>
        ) : projects.isError ? (
          <div className="py-16 text-center">
            <p className="text-sm text-muted-foreground">
              Could not reach the API — is it running on port 4000?
            </p>
          </div>
        ) : projects.data!.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-24 text-center">
            <Film className="size-6 text-muted-foreground" strokeWidth={1.5} />
            <p className="text-sm text-muted-foreground">
              No projects yet. Create one to start cutting.
            </p>
          </div>
        ) : (
          <ul>
            {projects.data!.map((p) => (
              <li
                key={p.id}
                className="group flex items-center justify-between border-b border-border"
              >
                <Link
                  href={`/editor/${p.id}`}
                  className="flex flex-1 items-baseline justify-between py-5 pr-4 transition-colors hover:text-foreground"
                >
                  <span className="text-[15px] font-medium tracking-tight">
                    {p.name}
                  </span>
                  <span className="label-mono text-muted-foreground">
                    {formatDate(p.updatedAt)}
                  </span>
                </Link>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete ${p.name}`}
                  className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                  onClick={() => {
                    if (confirm(`Delete "${p.name}"? This cannot be undone.`)) {
                      remove.mutate(p.id);
                    }
                  }}
                >
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
