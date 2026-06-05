import {
  MAX_DURATION_IN_FRAMES,
  timelineDurationInFrames,
  timelineSchema,
  type Clip,
} from "@clipline/timeline";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import { isCloudinaryConfigured } from "../lib/cloudinary";
import { enqueueRender, renderEvents } from "../lib/queues";
import { fail, ok } from "../lib/respond";
import { getAsset } from "../services/assets";
import { getProject } from "../services/projects";
import { createRenderJob, getRenderJob } from "../services/render-jobs";

const idParam = z.object({ id: z.uuid() });
const projectIdParam = z.object({ projectId: z.uuid() });

/** Mounted at /projects/:projectId/render */
export const projectRenderRoutes = new Hono().post(
  "/",
  zValidator("param", projectIdParam),
  async (c) => {
    if (!isCloudinaryConfigured()) {
      return fail(c, "media storage is not configured", 503);
    }
    const { projectId } = c.req.valid("param");
    const project = await getProject(projectId);
    if (!project) return fail(c, "project not found", 404);

    const timeline = timelineSchema.parse(project.timeline);
    const duration = timelineDurationInFrames(timeline);
    if (duration === 0) return fail(c, "timeline is empty", 422);
    if (duration > MAX_DURATION_IN_FRAMES) {
      return fail(c, "timeline exceeds the maximum duration", 422);
    }

    // every media clip must reference a ready asset with normalized media
    const assetIds = [
      ...new Set(
        timeline.tracks
          .flatMap((t) => t.clips as Clip[])
          .filter((c2) => c2.kind !== "text")
          .map((c2) => (c2 as { assetId: string }).assetId),
      ),
    ];
    const assetUrls: Record<string, string> = {};
    for (const assetId of assetIds) {
      const asset = await getAsset(assetId);
      if (!asset || asset.status !== "ready" || !asset.normalizedUrl) {
        return fail(c, `asset ${assetId} is not ready to render`, 422);
      }
      assetUrls[assetId] = asset.normalizedUrl;
    }

    const job = await createRenderJob(projectId);
    await enqueueRender({
      renderJobId: job.id,
      projectId,
      timeline,
      assetUrls,
    });
    return ok(c, job, 201);
  },
);

/** Mounted at /render-jobs */
export const renderJobRoutes = new Hono()

  .get("/:id", zValidator("param", idParam), async (c) => {
    const { id } = c.req.valid("param");
    const job = await getRenderJob(id);
    if (!job) return fail(c, "render job not found", 404);
    return ok(c, job);
  })

  .get("/:id/progress", zValidator("param", idParam), async (c) => {
    const { id } = c.req.valid("param");
    const job = await getRenderJob(id);
    if (!job) return fail(c, "render job not found", 404);

    return streamSSE(c, async (stream) => {
      // current state first so late subscribers render correctly
      await stream.writeSSE({
        event: "progress",
        data: JSON.stringify({
          status: job.status,
          progress: job.progress,
          outputUrl: job.outputUrl,
          error: job.error,
        }),
      });
      if (job.status === "completed" || job.status === "failed") return;

      await new Promise<void>((resolveStream) => {
        const onEvent = (payload: {
          status: string;
          progress?: number;
          outputUrl?: string;
          error?: string;
        }) => {
          stream
            .writeSSE({ event: "progress", data: JSON.stringify(payload) })
            .catch(() => finish());
          if (payload.status === "completed" || payload.status === "failed") {
            finish();
          }
        };
        const finish = () => {
          renderEvents.off(id, onEvent);
          clearInterval(heartbeat);
          resolveStream();
        };
        // keep proxies from closing an idle stream
        const heartbeat = setInterval(() => {
          stream.writeSSE({ event: "ping", data: "" }).catch(() => finish());
        }, 15000);
        renderEvents.on(id, onEvent);
        stream.onAbort(finish);
      });
    });
  });
