import IORedis from "ioredis";
import { env } from "../lib/env";

export const connection = new IORedis(env.REDIS_URL, {
  // Required by BullMQ workers: blocking commands must not time out.
  maxRetriesPerRequest: null,
});
