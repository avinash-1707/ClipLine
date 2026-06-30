import {
  clipDurationInFrames,
  MAX_DURATION_IN_FRAMES,
  timelineSchema,
  type Clip,
} from "@clipline/timeline";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import { isCloudinaryConfigured } from "../lib/cloudinary";
import { AppError } from "../lib/errors";
import { enqueueTranscribe, transcribeEvents } from "../lib/queues";
import { fail, ok } from "../lib/respond";
import { validationHook } from "../lib/validate";
import { getAsset } from "../services/assets";
import { getProject } from "../services/projects";
import {
  createTranscribeJob,
  getTranscribeJob,
  markTranscribeFailed,
} from "../services/transcribe-jobs";

const idParam = z.object({ id: z.uuid() });
const projectIdParam = z.object({ projectId: z.uuid() });

/**
 * Pick the voiceover to transcribe with a heuristic, not a UI chooser: the
 * single longest audio clip on the timeline. Short-form voiceovers are one
 * dominant track; a chooser would tax the 95% case for the rare multi-VO setup.
 */
function pickVoiceoverAssetId(timeline: {
  tracks: { clips: Clip[] }[];
}): string | null {
  let bestAssetId: string | null = null;
  let bestDuration = -1;
  for (const track of timeline.tracks) {
    for (const clip of track.clips) {
      if (clip.kind !== "audio") continue;
      const duration = clipDurationInFrames(clip);
      if (duration > bestDuration) {
        bestDuration = duration;
        bestAssetId = clip.assetId;
      }
    }
  }
  return bestAssetId;
}

/** Mounted at /projects/:projectId/transcribe */
export const projectTranscribeRoutes = new Hono().post(
  "/",
  zValidator("param", projectIdParam, validationHook),
  async (c) => {
    if (!isCloudinaryConfigured()) {
      return fail(c, "media storage is not configured", 503);
    }
    const { projectId } = c.req.valid("param");
    const project = await getProject(projectId);
    if (!project) return fail(c, "project not found", 404);

    const parsedTimeline = timelineSchema.safeParse(project.timeline);
    if (!parsedTimeline.success) {
      return fail(c, "this project's timeline is invalid", 422);
    }
    const timeline = parsedTimeline.data;

    const audioAssetId = pickVoiceoverAssetId(timeline);
    if (!audioAssetId) {
      return fail(
        c,
        "add a voiceover audio clip before generating subtitles",
        422,
      );
    }

    const asset = await getAsset(audioAssetId);
    if (
      !asset ||
      asset.projectId !== projectId ||
      asset.status !== "ready" ||
      !asset.normalizedUrl
    ) {
      return fail(c, "the voiceover is still processing", 422);
    }
    // A ready asset should always carry a duration; reject when it's missing
    // (an un-probed asset would otherwise bypass the cap and hand the worker an
    // unbounded file to read into memory) or over the limit.
    if (!asset.durationInFrames || asset.durationInFrames > MAX_DURATION_IN_FRAMES) {
      return fail(c, "the voiceover is too long or still processing", 422);
    }

    const job = await createTranscribeJob(projectId, audioAssetId);
    try {
      await enqueueTranscribe({
        transcribeJobId: job.id,
        projectId,
        audioAssetId,
        audioUrl: asset.normalizedUrl,
        language: "en",
      });
    } catch (error) {
      // don't strand the row in "queued" forever when only the enqueue failed
      await markTranscribeFailed(
        job.id,
        error instanceof Error ? error.message : "could not queue transcription",
      );
      throw new AppError(503, "couldn't start transcription — is redis running?");
    }
    return ok(c, job, 201);
  },
);

/** Mounted at /transcribe-jobs */
export const transcribeJobRoutes = new Hono()

  .get("/:id", zValidator("param", idParam, validationHook), async (c) => {
    const { id } = c.req.valid("param");
    const job = await getTranscribeJob(id);
    if (!job) return fail(c, "transcribe job not found", 404);
    return ok(c, job);
  })

  .get("/:id/progress", zValidator("param", idParam, validationHook), async (c) => {
    const { id } = c.req.valid("param");
    if (!(await getTranscribeJob(id))) {
      return fail(c, "transcribe job not found", 404);
    }

    return streamSSE(c, async (stream) => {
      await new Promise<void>((resolveStream) => {
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          transcribeEvents.off(id, onEvent);
          clearInterval(heartbeat);
          resolveStream();
        };
        const onEvent = (payload: { status: string; error?: string }) => {
          stream
            .writeSSE({ event: "progress", data: JSON.stringify(payload) })
            .catch(() => finish());
          if (payload.status === "completed" || payload.status === "failed") {
            finish();
          }
        };
        const heartbeat = setInterval(() => {
          stream.writeSSE({ event: "ping", data: "" }).catch(() => finish());
        }, 15000);

        // Subscribe BEFORE reading current state so a terminal event fired in
        // the gap isn't lost (mirrors the render progress race fix).
        transcribeEvents.on(id, onEvent);
        stream.onAbort(finish);

        void getTranscribeJob(id).then((current) => {
          if (settled || !current) return;
          stream
            .writeSSE({
              event: "progress",
              data: JSON.stringify({
                status: current.status,
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
