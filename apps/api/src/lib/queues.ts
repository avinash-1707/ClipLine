import { EventEmitter } from "node:events";
import {
  INGEST_QUEUE,
  ingestResultSchema,
  RENDER_QUEUE,
  renderResultSchema,
  type IngestJob,
  type RenderJob,
} from "@clipline/jobs";
import { Queue, QueueEvents } from "bullmq";
import IORedis from "ioredis";
import { AppError } from "./errors";
import { logger } from "./logger";
import { markAssetFailed, markAssetReady } from "../services/assets";
import {
  markRenderCompleted,
  markRenderFailed,
  markRenderStarted,
  updateRenderProgress,
} from "../services/render-jobs";
import { env } from "./env";

const connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });

export const ingestQueue = new Queue<IngestJob>(INGEST_QUEUE, { connection });
export const renderQueue = new Queue<RenderJob>(RENDER_QUEUE, { connection });

/**
 * Render progress fan-out for SSE handlers. Events are keyed by render job
 * id; payloads are { progress } or { status, ... } terminal events.
 */
export const renderEvents = new EventEmitter();
renderEvents.setMaxListeners(100);

export async function enqueueRender(job: RenderJob) {
  try {
    await renderQueue.add("render", job, {
      jobId: job.renderJobId,
      // renders are expensive — no automatic retry, the user retries
      removeOnComplete: 100,
      removeOnFail: 100,
    });
    logger.info(
      { jobId: job.renderJobId, renderJobId: job.renderJobId, projectId: job.projectId },
      "render job enqueued",
    );
  } catch (error) {
    logger.error({ err: error, renderJobId: job.renderJobId }, "render enqueue failed");
    throw new AppError(503, "job queue is unavailable — is redis running?");
  }
}

export async function enqueueIngest(job: IngestJob) {
  try {
    await ingestQueue.add("ingest", job, {
      // jobId = assetId so queue events map back to the asset row
      jobId: job.assetId,
      // transient ffmpeg/network hiccups get one retry with backoff
      attempts: 2,
      backoff: { type: "exponential", delay: 3000 },
      removeOnComplete: 100,
      removeOnFail: 100,
    });
    logger.info({ jobId: job.assetId, assetId: job.assetId }, "ingest job enqueued");
  } catch (error) {
    logger.error({ err: error, assetId: job.assetId }, "ingest enqueue failed");
    throw new AppError(503, "job queue is unavailable — is redis running?");
  }
}

/**
 * The worker returns ingest results over BullMQ (it never talks to
 * PostgreSQL); this listener persists them. Started once at boot.
 */
export function startQueueEventListeners() {
  const ingestEvents = new QueueEvents(INGEST_QUEUE, {
    connection: connection.duplicate(),
  });

  ingestEvents.on("completed", async ({ jobId, returnvalue }) => {
    const log = logger.child({ jobId, assetId: jobId });
    try {
      const result = ingestResultSchema.parse(returnvalue);
      await markAssetReady(jobId, result);
      log.info({ status: "ready" }, "asset ingest completed");
    } catch (error) {
      log.error({ err: error }, "ingest result rejected");
      await markAssetFailed(jobId, "worker returned an invalid ingest result");
    }
  });

  ingestEvents.on("failed", async ({ jobId, failedReason }) => {
    // a killed job (OOM, SIGKILL, stalled-reaper) reports an empty reason;
    // persist something the user can actually read.
    const reason =
      failedReason ||
      "processing failed unexpectedly (the job may have run out of memory or been killed)";
    logger.child({ jobId, assetId: jobId }).error(
      { status: "failed", failedReason: reason },
      "ingest job failed",
    );
    await markAssetFailed(jobId, reason);
  });

  ingestEvents.on("error", (error) => {
    logger.error({ err: error }, "ingest queue events error");
  });

  const render = new QueueEvents(RENDER_QUEUE, {
    connection: connection.duplicate(),
  });

  render.on("active", async ({ jobId }) => {
    await markRenderStarted(jobId);
    logger.child({ jobId, renderJobId: jobId }).info({ status: "rendering" }, "render started");
    renderEvents.emit(jobId, { status: "rendering", progress: 0 });
  });

  render.on("progress", async ({ jobId, data }) => {
    const progress = typeof data === "number" ? data : 0;
    // per-percent ticks during a render: debug only, never flood stdout at info
    logger.child({ jobId, renderJobId: jobId }).debug({ progress }, "render progress");
    renderEvents.emit(jobId, { status: "rendering", progress });
    await updateRenderProgress(jobId, progress);
  });

  render.on("completed", async ({ jobId, returnvalue }) => {
    const log = logger.child({ jobId, renderJobId: jobId });
    try {
      const result = renderResultSchema.parse(returnvalue);
      await markRenderCompleted(jobId, result);
      log.info({ status: "completed", outputUrl: result.outputUrl }, "render completed");
      renderEvents.emit(jobId, {
        status: "completed",
        progress: 1,
        outputUrl: result.outputUrl,
      });
    } catch (error) {
      log.error({ err: error }, "render result rejected");
      const reason = "the render finished but produced an unreadable result";
      await markRenderFailed(jobId, reason);
      // emit the same reason we persisted so the export dialog doesn't fall
      // back to a generic "render failed".
      renderEvents.emit(jobId, { status: "failed", error: reason });
    }
  });

  render.on("failed", async ({ jobId, failedReason }) => {
    // a killed render (OOM is common on large timelines) reports an empty
    // reason; persist and stream something readable instead of a blank line.
    const reason =
      failedReason ||
      "render failed unexpectedly (the job may have run out of memory or been killed)";
    logger.child({ jobId, renderJobId: jobId }).error(
      { status: "failed", failedReason: reason },
      "render job failed",
    );
    await markRenderFailed(jobId, reason);
    renderEvents.emit(jobId, { status: "failed", error: reason });
  });

  render.on("error", (error) => {
    logger.error({ err: error }, "render queue events error");
  });
}
