import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

/** Uniform success envelope: { data }. */
export function ok<T>(c: Context, data: T, status: ContentfulStatusCode = 200) {
  return c.json({ data }, status);
}

/** Uniform error envelope: { error }. */
export function fail(
  c: Context,
  message: string,
  status: ContentfulStatusCode,
) {
  return c.json({ error: message }, status);
}
