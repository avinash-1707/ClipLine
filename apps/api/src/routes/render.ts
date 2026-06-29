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
import { AppError } from "../lib/errors";
import { enqueueRender, renderEvents } from "../lib/queues";
import { fail, ok } from "../lib/respond";
import { validationHook } from "../lib/validate";
import { getAsset } from "../services/assets";
import { getProject } from "../services/projects";
import {
  createRenderJob,
  getRenderJob,
  markRenderFailed,
} from "../services/render-jobs";

const idParam = z.object({ id: z.uuid() });
const projectIdParam = z.object({ projectId: z.uuid() });

/** Mounted at /projects/:projectId/render */
export const projectRenderRoutes = new Hono().post(
  "/",
  zValidator("param", projectIdParam, validationHook),
  async (c) => {
    if (!isCloudinaryConfigured()) {
      return fail(c, "media storage is not configured", 503);
    }
    const { projectId } = c.req.valid("param");
    const project = await getProject(projectId);
    if (!project) return fail(c, "project not found", 404);

    // The user pressed Export — a schema-path message ("tracks.0.clips…") would
    // be meaningless here. Surface the real meaning: the project is unrenderable.
    const parsedTimeline = timelineSchema.safeParse(project.timeline);
    if (!parsedTimeline.success) {
      return fail(c, "this project's timeline is invalid and cannot be rendered", 422);
    }
    const timeline = parsedTimeline.data;
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
    const assetDims: Record<string, { width: number; height: number }> = {};
    for (const assetId of assetIds) {
      const asset = await getAsset(assetId);
      if (
        !asset ||
        asset.projectId !== projectId ||
        asset.status !== "ready" ||
        !asset.normalizedUrl
      ) {
        return fail(c, `asset ${assetId} is not ready to render`, 422);
      }
      assetUrls[assetId] = asset.normalizedUrl;
      // video assets carry source dimensions; the worker needs them to apply
      // each clip's pan/zoom framing identically to the preview.
      if (asset.width && asset.height) {
        assetDims[assetId] = { width: asset.width, height: asset.height };
      }
    }

    // A clip the user reframed must have source dimensions, or the export would
    // silently fall back to cover-fit and diverge from the preview. Fail loud.
    for (const track of timeline.tracks) {
      for (const clip of track.clips as Clip[]) {
        if (clip.kind !== "video") continue;
        const f = clip.framing;
        const reframed = f.zoom !== 1 || f.offsetX !== 0 || f.offsetY !== 0;
        if (reframed && !assetDims[clip.assetId]) {
          return fail(
            c,
            "a reframed clip's source is missing dimensions — re-import it to export with framing",
            422,
          );
        }
      }
    }

    const job = await createRenderJob(projectId);
    // A failed enqueue would otherwise strand the job in "queued" forever;
    // mark it failed so its status reflects reality.
    try {
      await enqueueRender({
        renderJobId: job.id,
        projectId,
        timeline,
        assetUrls,
        assetDims,
      });
    } catch (error) {
      await markRenderFailed(
        job.id,
        error instanceof Error ? error.message : "could not queue render",
      );
      // the render row exists; only queueing failed — say so rather than a bare
      // "queue unavailable" that reads like nothing happened.
      throw new AppError(503, "couldn't start the render — is redis running?");
    }
    return ok(c, job, 201);
  },
);

/** Mounted at /render-jobs */
export const renderJobRoutes = new Hono()

  .get("/:id", zValidator("param", idParam, validationHook), async (c) => {
    const { id } = c.req.valid("param");
    const job = await getRenderJob(id);
    if (!job) return fail(c, "render job not found", 404);
    return ok(c, job);
  })

  .get("/:id/progress", zValidator("param", idParam, validationHook), async (c) => {
    const { id } = c.req.valid("param");
    if (!(await getRenderJob(id))) {
      return fail(c, "render job not found", 404);
    }

    return streamSSE(c, async (stream) => {
      await new Promise<void>((resolveStream) => {
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          renderEvents.off(id, onEvent);
          clearInterval(heartbeat);
          resolveStream();
        };
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
        // keep proxies from closing an idle stream
        const heartbeat = setInterval(() => {
          stream.writeSSE({ event: "ping", data: "" }).catch(() => finish());
        }, 15000);

        // Subscribe BEFORE reading current state: a terminal event fired in the
        // gap would otherwise be lost, leaving the client hung on the last
        // percentage. Reading after subscribing closes that race.
        renderEvents.on(id, onEvent);
        stream.onAbort(finish);

        void getRenderJob(id).then((current) => {
          if (settled || !current) return;
          stream
            .writeSSE({
              event: "progress",
              data: JSON.stringify({
                status: current.status,
                progress: current.progress,
                outputUrl: current.outputUrl,
                error: current.error,
              }),
            })
            .catch(() => finish());
          if (current.status === "completed" || current.status === "failed") {
            finish();
          }
        });
      });
    });
  });
