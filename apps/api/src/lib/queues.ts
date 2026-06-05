import { INGEST_QUEUE, ingestResultSchema, type IngestJob } from "@clipline/jobs";
import { Queue, QueueEvents } from "bullmq";
import IORedis from "ioredis";
import { markAssetFailed, markAssetReady } from "../services/assets";
import { env } from "./env";

const connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });

export const ingestQueue = new Queue<IngestJob>(INGEST_QUEUE, { connection });

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
}
