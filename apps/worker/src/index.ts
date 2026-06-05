import { INGEST_QUEUE, RENDER_QUEUE } from "@clipline/jobs";
import { Worker } from "bullmq";
import { env } from "./lib/env";
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
  worker.on("completed", (job) => console.log(`${name} ${job.id} completed`));
  worker.on("failed", (job, error) =>
    console.error(`${name} ${job?.id} failed:`, error.message),
  );
}

console.log(
  `worker up: ${INGEST_QUEUE} (x${env.INGEST_CONCURRENCY}), ${RENDER_QUEUE} (x1)`,
);

async function shutdown() {
  await Promise.all([ingestWorker.close(), renderWorker.close()]);
  connection.disconnect();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
