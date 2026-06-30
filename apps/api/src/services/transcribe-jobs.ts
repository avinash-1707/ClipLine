import type { TranscribeWord } from "@clipline/jobs";
import { and, desc, eq, notInArray } from "drizzle-orm";
import { db } from "../db/client";
import { transcribeJobs } from "../db/schema";

/** The non-terminal phases reported while a transcribe job runs. */
export type TranscribePhase = "downloading" | "transcribing";

export async function createTranscribeJob(
  projectId: string,
  audioAssetId: string,
) {
  const [job] = await db
    .insert(transcribeJobs)
    .values({ projectId, audioAssetId })
    .returning();
  return job!;
}

export async function getTranscribeJob(id: string) {
  const [job] = await db
    .select()
    .from(transcribeJobs)
    .where(eq(transcribeJobs.id, id));
  return job ?? null;
}

export async function listTranscribeJobs(projectId: string) {
  return db
    .select()
    .from(transcribeJobs)
    .where(eq(transcribeJobs.projectId, projectId))
    .orderBy(desc(transcribeJobs.createdAt));
}

export async function markTranscribePhase(id: string, phase: TranscribePhase) {
  // Never resurrect a finished job: a late phase event must not overwrite a
  // completed/failed terminal state (handlers can land out of order).
  await db
    .update(transcribeJobs)
    .set({ status: phase })
    .where(
      and(
        eq(transcribeJobs.id, id),
        notInArray(transcribeJobs.status, ["completed", "failed"]),
      ),
    );
}

export async function markTranscribeCompleted(
  id: string,
  words: TranscribeWord[],
) {
  await db
    .update(transcribeJobs)
    .set({ status: "completed", result: { words }, error: null })
    .where(eq(transcribeJobs.id, id));
}

export async function markTranscribeFailed(id: string, error: string) {
  await db
    .update(transcribeJobs)
    .set({ status: "failed", error })
    .where(eq(transcribeJobs.id, id));
}
