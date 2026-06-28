import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { ZodError } from "zod";
import { logger, type AppEnv } from "./logger";
import { fail } from "./respond";

/** Operational error with an HTTP status — thrown by services/libs, mapped
 * to a clean response by the global onError handler. */
export class AppError extends Error {
  constructor(
    public readonly status: ContentfulStatusCode,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

/** "tracks.0.clips.1.startFrame: clip overlaps…" — first issues, compact. */
export function formatZodError(error: ZodError): string {
  return error.issues
    .slice(0, 3)
    .map((issue) => {
      const path = issue.path.join(".");
      return path ? `${path}: ${issue.message}` : issue.message;
    })
    .join("; ");
}

/** Global error mapper: AppError -> its status, ZodError -> 422,
 * infrastructure connection failures -> 503, anything else -> 500. */
export function handleError(err: Error, c: Context<AppEnv>) {
  const log = c.get("log") ?? logger;
  if (err instanceof AppError) {
    // server faults are logged; client (4xx) AppErrors are returned cleanly,
    // without log noise.
    if (err.status >= 500) log.error({ err, status: err.status }, err.message);
    return fail(c, err.message, err.status);
  }
  if (err instanceof ZodError) {
    return fail(c, formatZodError(err), 422);
  }
  const code = (err as NodeJS.ErrnoException).code;
  if (code === "ECONNREFUSED" || code === "ENOTFOUND" || code === "ETIMEDOUT") {
    log.warn({ err, code }, "infrastructure unreachable");
    return fail(c, "a backing service is unreachable — is docker compose up?", 503);
  }
  log.error({ err }, "unhandled error");
  return fail(c, "internal server error", 500);
}
