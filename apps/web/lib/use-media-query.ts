"use client";

import { useSyncExternalStore } from "react";

/**
 * SSR-safe media-query subscription. Returns false on the server and during the
 * first client render, then updates once `matchMedia` is available.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
