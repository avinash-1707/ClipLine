import { INGEST_QUEUE, RENDER_QUEUE } from "@clipline/jobs";
import { Worker } from "bullmq";
import { env } from "./lib/env";
import { logger } from "./lib/logger";
import { processIngestJob } from "./processors/ingest";
import { processRenderJob } from "./processors/render";
import { connection } from "./queues/connection";

const ingestWorker = new Worker(INGEST_QUEUE, processIngestJob, {
  connection,
  concurrency: env.INGEST_CONCURRENCY,
});

// renders saturate cores via Remotion's internal concurrency; never run two
const renderWorker = new Worker(RENDER_QUEUE, processRenderJob, {
  connection: connection.duplicate(),
  concurrency: 1,
});

for (const [name, worker] of [
  [INGEST_QUEUE, ingestWorker],
  [RENDER_QUEUE, renderWorker],
] as const) {
  worker.on("completed", (job) => {
    logger.child({ jobId: job.id, queue: name }).info(
      { status: "completed", durationMs: job.finishedOn ? job.finishedOn - (job.processedOn ?? job.finishedOn) : undefined },
      `${name} job completed`,
    );
  });
  worker.on("failed", (job, error) => {
    logger.child({ jobId: job?.id, queue: name }).error(
      { err: error, status: "failed" },
      `${name} job failed`,
    );
  });
}

logger.info(
  { ingestConcurrency: env.INGEST_CONCURRENCY },
  `worker up: ${INGEST_QUEUE} (x${env.INGEST_CONCURRENCY}), ${RENDER_QUEUE} (x1)`,
);

async function shutdown(signal: string) {
  logger.info({ signal }, "worker shutting down");
  await Promise.all([ingestWorker.close(), renderWorker.close()]);
  connection.disconnect();
  logger.info("worker shutdown complete");
  process.exit(0);
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

// keep the process alive on stray async failures; BullMQ owns job errors
process.on("unhandledRejection", (reason) => {
  logger.error({ err: reason }, "unhandledRejection");
});
process.on("uncaughtException", (error) => {
  logger.error({ err: error }, "uncaughtException");
});
