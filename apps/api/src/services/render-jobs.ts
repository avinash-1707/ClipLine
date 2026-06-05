import type { RenderResult } from "@clipline/jobs";
import { desc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { renderJobs } from "../db/schema";

export async function createRenderJob(projectId: string) {
  const [job] = await db.insert(renderJobs).values({ projectId }).returning();
  return job!;
}

export async function getRenderJob(id: string) {
  const [job] = await db.select().from(renderJobs).where(eq(renderJobs.id, id));
  return job ?? null;
}

export async function listRenderJobs(projectId: string) {
  return db
    .select()
    .from(renderJobs)
    .where(eq(renderJobs.projectId, projectId))
    .orderBy(desc(renderJobs.createdAt));
}

export async function markRenderStarted(id: string) {
  await db
    .update(renderJobs)
    .set({ status: "rendering" })
    .where(eq(renderJobs.id, id));
}

export async function updateRenderProgress(id: string, progress: number) {
  await db
    .update(renderJobs)
    .set({ status: "rendering", progress })
    .where(eq(renderJobs.id, id));
}

export async function markRenderCompleted(id: string, result: RenderResult) {
  await db
    .update(renderJobs)
    .set({
      status: "completed",
      progress: 1,
      outputPublicId: result.outputPublicId,
      outputUrl: result.outputUrl,
      error: null,
    })
    .where(eq(renderJobs.id, id));
}

export async function markRenderFailed(id: string, error: string) {
  await db
    .update(renderJobs)
    .set({ status: "failed", error })
    .where(eq(renderJobs.id, id));
}
