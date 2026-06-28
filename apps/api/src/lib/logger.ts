import { createLogger, type AppLogger } from "@clipline/logger";
import type { MiddlewareHandler } from "hono";

/** Process-wide root logger for the API. */
export const logger = createLogger({ name: "api" });

/** Hono env binding: request-scoped logger + id available on every context. */
export type AppEnv = {
  Variables: {
    log: AppLogger;
    requestId: string;
  };
};

/**
 * Replaces Hono's built-in logger(): mints a request id (honoring an inbound
 * x-request-id so a future proxy can supply one), binds a request-scoped child
 * logger onto the context, echoes the id back, and logs one structured line per
 * request with status and duration.
 */
export const requestLogger: MiddlewareHandler<AppEnv> = async (c, next) => {
  const requestId = c.req.header("x-request-id") ?? crypto.randomUUID();
  const log = logger.child({ requestId });
  c.set("requestId", requestId);
  c.set("log", log);
  c.header("x-request-id", requestId);

  const start = performance.now();
  await next();
  const durationMs = Math.round(performance.now() - start);
  log.info(
    {
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      durationMs,
    },
    "request",
  );
};
