import { createEmptyTimeline, type Timeline } from "@clipline/timeline";
import { desc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { projects } from "../db/schema";

export async function listProjects() {
  return db
    .select({
      id: projects.id,
      name: projects.name,
      createdAt: projects.createdAt,
      updatedAt: projects.updatedAt,
    })
    .from(projects)
    .orderBy(desc(projects.updatedAt));
}

export async function getProject(id: string) {
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, id));
  return project ?? null;
}

export async function createProject(name: string) {
  const [project] = await db
    .insert(projects)
    .values({ name, timeline: createEmptyTimeline() })
    .returning();
  return project!;
}

export async function renameProject(id: string, name: string) {
  const [project] = await db
    .update(projects)
    .set({ name })
    .where(eq(projects.id, id))
    .returning();
  return project ?? null;
}

export async function saveTimeline(id: string, timeline: Timeline) {
  const [project] = await db
    .update(projects)
    .set({ timeline })
    .where(eq(projects.id, id))
    .returning();
  return project ?? null;
}

export async function deleteProject(id: string) {
  const deleted = await db
    .delete(projects)
    .where(eq(projects.id, id))
    .returning({ id: projects.id });
  return deleted.length > 0;
}
