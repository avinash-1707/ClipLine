import type { Context } from "hono";
import { formatZodError } from "./errors";
import { fail } from "./respond";

/**
 * Shared zValidator hook: failed validation returns the uniform { error }
 * envelope with a compact, human-readable message instead of raw zod JSON.
 */
export function validationHook(
  result: { success: boolean; error?: unknown },
  c: Context,
) {
  if (!result.success) {
    const error = result.error;
    return fail(
      c,
      error && typeof error === "object" && "issues" in error
        ? formatZodError(error as never)
        : "invalid request",
      400,
    );
  }
}
