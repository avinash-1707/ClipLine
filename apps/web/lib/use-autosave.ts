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
  const draining = useRef(false);

  useEffect(() => {
    // Drain saves one at a time: while the timeline is dirty, PUT the latest
    // snapshot, then re-check. This guarantees a single in-flight request, so
    // out-of-order completions can never clobber a newer timeline.
    const drain = async () => {
      if (draining.current) return;
      draining.current = true;
      try {
        while (true) {
          const { projectId, timeline, saveState, setSaveState } =
            useTimelineStore.getState();
          if (!projectId || !timeline || saveState !== "dirty") break;
          setSaveState("saving");
          try {
            await api.projects.saveTimeline(projectId, timeline);
            // a later edit may have re-dirtied the timeline mid-flight
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
            break;
          }
        }
      } finally {
        draining.current = false;
      }
    };

    const unsubscribe = useTimelineStore.subscribe((state, prev) => {
      if (state.saveState !== "dirty" || state.timeline === prev.timeline) {
        return;
      }
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void drain(), DEBOUNCE_MS);
    });
    return () => {
      unsubscribe();
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);
}
