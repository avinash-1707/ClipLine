import type { Timeline } from "@clipline/timeline";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export interface ProjectSummary {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface Project extends ProjectSummary {
  timeline: Timeline;
}

export interface Asset {
  id: string;
  projectId: string;
  kind: "video" | "audio";
  status: "processing" | "ready" | "failed";
  originalFilename: string;
  originalPublicId: string;
  originalUrl: string;
  normalizedPublicId: string | null;
  normalizedUrl: string | null;
  thumbnailPublicId: string | null;
  thumbnailUrl: string | null;
  waveformPublicId: string | null;
  waveformUrl: string | null;
  durationInFrames: number | null;
  codec: string | null;
  width: number | null;
  height: number | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, init);
  const body = (await res.json().catch(() => null)) as
    | { data?: T; error?: string }
    | null;
  if (!res.ok) {
    throw new Error(body?.error ?? `request failed (${res.status})`);
  }
  return body!.data as T;
}

export const api = {
  projects: {
    list: () => request<ProjectSummary[]>("/projects"),
    get: (id: string) => request<Project>(`/projects/${id}`),
    create: (name: string) =>
      request<Project>("/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      }),
    rename: (id: string, name: string) =>
      request<Project>(`/projects/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      }),
    saveTimeline: (id: string, timeline: Timeline) =>
      request<Project>(`/projects/${id}/timeline`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(timeline),
      }),
    delete: (id: string) =>
      request<{ id: string }>(`/projects/${id}`, { method: "DELETE" }),
  },
  assets: {
    list: (projectId: string) =>
      request<Asset[]>(`/projects/${projectId}/assets`),
    upload: (projectId: string, file: File) => {
      const form = new FormData();
      form.append("file", file);
      return request<Asset>(`/projects/${projectId}/assets`, {
        method: "POST",
        body: form,
      });
    },
    delete: (id: string) =>
      request<{ id: string }>(`/assets/${id}`, { method: "DELETE" }),
  },
};
