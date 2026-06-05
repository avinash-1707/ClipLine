import { INGEST_QUEUE } from "@clipline/jobs";
import { Worker } from "bullmq";
import { env } from "./lib/env";
import { processIngestJob } from "./processors/ingest";
import { connection } from "./queues/connection";

const ingestWorker = new Worker(INGEST_QUEUE, processIngestJob, {
  connection,
  concurrency: env.INGEST_CONCURRENCY,
});

ingestWorker.on("completed", (job) => {
  console.log(`ingest ${job.id} completed`);
});
ingestWorker.on("failed", (job, error) => {
  console.error(`ingest ${job?.id} failed:`, error.message);
});

console.log(
  `worker up: ${INGEST_QUEUE} queue, concurrency ${env.INGEST_CONCURRENCY}`,
);

async function shutdown() {
  await ingestWorker.close();
  connection.disconnect();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
