"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useTimelineStore } from "@/store/timeline";

const DEBOUNCE_MS = 800;

/**
 * Watches the store; whenever the timeline turns dirty, PUTs it after a
 * debounce. Mounted once by the editor shell.
 */
export function useAutosave() {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const unsubscribe = useTimelineStore.subscribe((state, prev) => {
      if (state.saveState !== "dirty" || state.timeline === prev.timeline) {
        return;
      }
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(async () => {
        const { projectId, timeline, setSaveState } =
          useTimelineStore.getState();
        if (!projectId || !timeline) return;
        setSaveState("saving");
        try {
          await api.projects.saveTimeline(projectId, timeline);
          // a later edit may have re-dirtied the timeline meanwhile
          if (useTimelineStore.getState().saveState === "saving") {
            setSaveState("saved");
          }
        } catch (error) {
          console.error("timeline save failed:", error);
          // toast once per failure streak, not on every retry
          if (useTimelineStore.getState().saveState !== "error") {
            toast.error("Couldn't save your timeline", {
              description:
                error instanceof Error ? error.message : "save failed",
            });
          }
          setSaveState("error");
        }
      }, DEBOUNCE_MS);
    });
    return () => {
      unsubscribe();
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);
}
