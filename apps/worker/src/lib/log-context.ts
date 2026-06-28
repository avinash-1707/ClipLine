import { AsyncLocalStorage } from "node:async_hooks";
import type { AppLogger } from "@clipline/logger";
import { logger } from "./logger";

/**
 * Per-job logger store. A processor wraps its body in `jobLogStore.run(child,
 * ...)`, binding jobId/assetId/renderJobId once; the deep ffmpeg/Cloudinary
 * leaf helpers then call `jobLog()` to log with that context WITHOUT taking a
 * logger parameter. AsyncLocalStorage carries the binding across await,
 * execFile, and fetch boundaries for the whole pipeline.
 */
export const jobLogStore = new AsyncLocalStorage<AppLogger>();

/** The job-scoped logger if inside a processor run, else the root logger. */
export function jobLog(): AppLogger {
  return jobLogStore.getStore() ?? logger;
}
