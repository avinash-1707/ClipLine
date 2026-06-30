import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  transcribeJobSchema,
  type TranscribeJob,
  type TranscribeResult,
} from "@clipline/jobs";
import type { Job } from "bullmq";
import { downloadToFile } from "../../lib/cloudinary";
import { jobLog, jobLogStore } from "../../lib/log-context";
import { logger } from "../../lib/logger";
import { getSttAdapter } from "./stt";

/**
 * Transcribe pipeline: download the voiceover audio to scratch, run it through
 * the STT adapter, return word-timed tokens (seconds) over BullMQ. The API
 * persists the result; the web client converts words to caption clips. Phases
 * are reported via job.updateProgress so the API can stream them over SSE.
 */
export async function processTranscribeJob(
  job: Job,
): Promise<TranscribeResult> {
  let payload: TranscribeJob;
  try {
    payload = transcribeJobSchema.parse(job.data);
  } catch {
    throw new Error("transcription input was invalid — the job could not be read");
  }

  const log = logger.child({
    jobId: job.id,
    transcribeJobId: payload.transcribeJobId,
    projectId: payload.projectId,
    step: "transcribe",
  });
  return jobLogStore.run(log, () => runTranscribe(job, payload));
}

async function runTranscribe(
  job: Job,
  payload: TranscribeJob,
): Promise<TranscribeResult> {
  const started = performance.now();
  const scratch = await mkdtemp(
    join(tmpdir(), `clipline-transcribe-${payload.transcribeJobId}-`),
  );
  try {
    jobLog().info({ status: "downloading" }, "downloading voiceover audio");
    const audioPath = join(scratch, "audio");
    await downloadToFile(payload.audioUrl, audioPath);

    // advance the SSE phase: download done, STT starting
    await job.updateProgress("transcribing").catch(() => undefined);
    jobLog().info({ status: "transcribing" }, "transcribing voiceover");
    const words = await getSttAdapter().transcribe(audioPath, {
      language: payload.language,
    });

    jobLog().info(
      {
        status: "completed",
        words: words.length,
        durationMs: Math.round(performance.now() - started),
      },
      "transcribe completed",
    );
    return { words };
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}
