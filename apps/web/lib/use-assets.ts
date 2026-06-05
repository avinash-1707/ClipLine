"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

/** Project assets, polling every 2 s while any ingest is still running. */
export function useAssets(projectId: string) {
  return useQuery({
    queryKey: ["assets", projectId],
    queryFn: () => api.assets.list(projectId),
    refetchInterval: (query) =>
      query.state.data?.some((a) => a.status === "processing") ? 2000 : false,
  });
}
