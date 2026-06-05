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
  await renderQueue.add("render", job, {
    jobId: job.renderJobId,
    removeOnComplete: 100,
    removeOnFail: 100,
  });
}

export async function enqueueIngest(job: IngestJob) {
  await ingestQueue.add("ingest", job, {
    // jobId = assetId so queue events map back to the asset row
    jobId: job.assetId,
    removeOnComplete: 100,
    removeOnFail: 100,
  });
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
    try {
      const result = ingestResultSchema.parse(returnvalue);
      await markAssetReady(jobId, result);
    } catch (error) {
      console.error(`ingest result for asset ${jobId} rejected:`, error);
      await markAssetFailed(jobId, "worker returned an invalid ingest result");
    }
  });

  ingestEvents.on("failed", async ({ jobId, failedReason }) => {
    console.error(`ingest job ${jobId} failed: ${failedReason}`);
    await markAssetFailed(jobId, failedReason);
  });

  ingestEvents.on("error", (error) => {
    console.error("ingest queue events error:", error);
  });

  const render = new QueueEvents(RENDER_QUEUE, {
    connection: connection.duplicate(),
  });

  render.on("active", async ({ jobId }) => {
    await markRenderStarted(jobId);
    renderEvents.emit(jobId, { status: "rendering", progress: 0 });
  });

  render.on("progress", async ({ jobId, data }) => {
    const progress = typeof data === "number" ? data : 0;
    renderEvents.emit(jobId, { status: "rendering", progress });
    await updateRenderProgress(jobId, progress);
  });

  render.on("completed", async ({ jobId, returnvalue }) => {
    try {
      const result = renderResultSchema.parse(returnvalue);
      await markRenderCompleted(jobId, result);
      renderEvents.emit(jobId, {
        status: "completed",
        progress: 1,
        outputUrl: result.outputUrl,
      });
    } catch (error) {
      console.error(`render result for job ${jobId} rejected:`, error);
      await markRenderFailed(jobId, "worker returned an invalid render result");
      renderEvents.emit(jobId, { status: "failed" });
    }
  });

  render.on("failed", async ({ jobId, failedReason }) => {
    console.error(`render job ${jobId} failed: ${failedReason}`);
    await markRenderFailed(jobId, failedReason);
    renderEvents.emit(jobId, { status: "failed", error: failedReason });
  });

  render.on("error", (error) => {
    console.error("render queue events error:", error);
  });
}
