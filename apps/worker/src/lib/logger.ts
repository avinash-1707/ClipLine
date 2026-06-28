import { createLogger } from "@clipline/logger";

/** Process-wide root logger for the worker. */
export const logger = createLogger({ name: "worker" });
