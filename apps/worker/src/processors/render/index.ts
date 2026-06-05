import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderJobSchema, type RenderResult } from "@clipline/jobs";
import { timelineSchema } from "@clipline/timeline";
import type { Job } from "bullmq";
import { uploadFile } from "../../lib/cloudinary";
import { renderTimeline } from "./remotion";

/**
 * Render pipeline: validate the timeline, render to local scratch with
 * Remotion, upload the MP4 to Cloudinary, return the output location over
 * BullMQ. Progress streams through job.updateProgress -> QueueEvents.
 */
export async function processRenderJob(job: Job): Promise<RenderResult> {
  const payload = renderJobSchema.parse(job.data);
  const timeline = timelineSchema.parse(payload.timeline);

  const scratch = await mkdtemp(
    join(tmpdir(), `clipline-render-${payload.renderJobId}-`),
  );
  try {
    const outputPath = join(scratch, "output.mp4");
    let lastReported = -1;

    await renderTimeline({
      timeline,
      assetUrls: payload.assetUrls,
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

    const output = await uploadFile(outputPath, {
      folder: "renders",
      resourceType: "video",
      publicIdPrefix: "render",
    });

    return { outputPublicId: output.publicId, outputUrl: output.url };
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}
