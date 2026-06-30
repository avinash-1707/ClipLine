import { INGEST_QUEUE, RENDER_QUEUE, TRANSCRIBE_QUEUE } from "@clipline/jobs";
import { Worker } from "bullmq";
import { env } from "./lib/env";
import { logger } from "./lib/logger";
import { processIngestJob } from "./processors/ingest";
import { processRenderJob } from "./processors/render";
import { processTranscribeJob } from "./processors/transcribe";
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

// STT is network-bound (download + Deepgram round-trip); a few run concurrently
const transcribeWorker = new Worker(TRANSCRIBE_QUEUE, processTranscribeJob, {
  connection: connection.duplicate(),
  concurrency: env.TRANSCRIBE_CONCURRENCY,
});

for (const [name, worker] of [
  [INGEST_QUEUE, ingestWorker],
  [RENDER_QUEUE, renderWorker],
  [TRANSCRIBE_QUEUE, transcribeWorker],
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
  {
    ingestConcurrency: env.INGEST_CONCURRENCY,
    transcribeConcurrency: env.TRANSCRIBE_CONCURRENCY,
    sttEngine: env.STT_ENGINE,
  },
  `worker up: ${INGEST_QUEUE} (x${env.INGEST_CONCURRENCY}), ${RENDER_QUEUE} (x1), ${TRANSCRIBE_QUEUE} (x${env.TRANSCRIBE_CONCURRENCY})`,
);

async function shutdown(signal: string) {
  logger.info({ signal }, "worker shutting down");
  await Promise.all([
    ingestWorker.close(),
    renderWorker.close(),
    transcribeWorker.close(),
  ]);
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
