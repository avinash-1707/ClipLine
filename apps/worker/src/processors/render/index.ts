import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderJobSchema, type RenderJob, type RenderResult } from "@clipline/jobs";
import { timelineSchema, type Timeline } from "@clipline/timeline";
import type { Job } from "bullmq";
import { uploadFile } from "../../lib/cloudinary";
import { jobLog, jobLogStore } from "../../lib/log-context";
import { logger } from "../../lib/logger";
import { renderTimeline } from "./remotion";

/**
 * Render pipeline: validate the timeline, render to local scratch with
 * Remotion, upload the MP4 to Cloudinary, return the output location over
 * BullMQ. Progress streams through job.updateProgress -> QueueEvents.
 */
export async function processRenderJob(job: Job): Promise<RenderResult> {
  // A malformed payload would otherwise throw a raw multi-line ZodError that
  // BullMQ persists as failedReason and shows verbatim in the export dialog.
  let payload: RenderJob;
  let timeline: Timeline;
  try {
    payload = renderJobSchema.parse(job.data);
    timeline = timelineSchema.parse(payload.timeline);
  } catch {
    throw new Error("render input was invalid — the saved timeline could not be read");
  }

  const log = logger.child({
    jobId: job.id,
    renderJobId: payload.renderJobId,
    projectId: payload.projectId,
    step: "render",
  });
  return jobLogStore.run(log, () =>
    runRender(
      job,
      payload.renderJobId,
      timeline,
      payload.assetUrls,
      payload.assetDims,
    ),
  );
}

async function runRender(
  job: Job,
  renderJobId: string,
  timeline: Timeline,
  assetUrls: Record<string, string>,
  assetDims: Record<string, { width: number; height: number }>,
): Promise<RenderResult> {
  const started = performance.now();
  jobLog().info({ status: "active" }, "render started");

  const scratch = await mkdtemp(
    join(tmpdir(), `clipline-render-${renderJobId}-`),
  );
  try {
    const outputPath = join(scratch, "output.mp4");
    let lastReported = -1;

    await renderTimeline({
      timeline,
      assetUrls,
      assetDims,
      outputPath,
      onProgress: (progress) => {
        // QueueEvents traffic stays light: report whole-percent steps only
        const pct = Math.floor(progress * 100);
        if (pct > lastReported) {
          lastReported = pct;
          job.updateProgress(progress).catch(() => undefined);
        }
      },
    });

    jobLog().debug({ step: "upload" }, "uploading rendered output");
    const output = await uploadFile(outputPath, {
      folder: "renders",
      resourceType: "video",
      publicIdPrefix: "render",
    });

    jobLog().info(
      { status: "completed", durationMs: Math.round(performance.now() - started) },
      "render completed",
    );
    return { outputPublicId: output.publicId, outputUrl: output.url };
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}
