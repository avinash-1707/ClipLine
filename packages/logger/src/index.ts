import pino, { type DestinationStream, type Logger } from "pino";

/**
 * Closed set of correlation fields any child logger may bind. Single source of
 * truth so api and worker tag log lines identically — a search on `jobId`
 * stitches API enqueue -> worker pipeline -> API result persistence.
 */
export interface LogContext {
  /** Per-HTTP-request id (api), generated or carried from x-request-id. */
  requestId?: string;
  /** BullMQ job id — the correlation key across api and worker. */
  jobId?: string;
  /** Asset row id (equals the ingest jobId; bound explicitly for clarity). */
  assetId?: string;
  /** Render job row id (equals the render jobId). */
  renderJobId?: string;
  /** Owning project id. */
  projectId?: string;
  /** Pipeline stage: download | probe | normalize | thumbnail | render | ... */
  step?: string;
  /** Lifecycle state: active | rendering | completed | failed | ... */
  status?: string;
  /** Operation timing in milliseconds. */
  durationMs?: number;
}

export type AppLogger = Logger;

export interface CreateLoggerOptions {
  /** Bound on every line as `service`. */
  name: "api" | "worker";
  /** Overrides LOG_LEVEL. */
  level?: string;
  /** Overrides LOG_PRETTY. */
  pretty?: boolean;
  /** Inject a stream (tests); when set, pretty transport is bypassed. */
  destination?: DestinationStream;
}

/**
 * Build a pino transport for pretty-printing, or undefined for raw JSON.
 * Wrapped so a missing/broken pino-pretty degrades to JSON instead of
 * failing logger construction (and thus app boot).
 */
function buildTransport(pretty: boolean) {
  if (!pretty) return undefined;
  try {
    return {
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "SYS:HH:MM:ss.l",
        ignore: "pid,hostname",
      },
    };
  } catch {
    return undefined;
  }
}

/**
 * Create a root logger. Levels: error | warn | info | debug, driven by
 * LOG_LEVEL (default info). Pretty output is opt-in via LOG_PRETTY=true (no
 * NODE_ENV convention in this codebase); production leaves it unset and writes
 * structured JSON to stdout, which Docker captures.
 */
export function createLogger(opts: CreateLoggerOptions): AppLogger {
  const level = opts.level ?? process.env.LOG_LEVEL ?? "info";
  const pretty = opts.pretty ?? process.env.LOG_PRETTY === "true";

  const options = {
    name: opts.name,
    level,
    // drop pid/hostname noise; keep a stable service tag for single-container
    base: { service: opts.name },
    // emit `level: "info"` rather than pino's numeric default
    formatters: { level: (label: string) => ({ level: label }) },
    // a custom destination (tests) can't coexist with a transport
    transport: opts.destination ? undefined : buildTransport(pretty),
  };

  return opts.destination ? pino(options, opts.destination) : pino(options);
}
