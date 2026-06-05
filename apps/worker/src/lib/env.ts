import { z } from "zod";

// Load .env if present (gitignored; holds Cloudinary credentials).
try {
  process.loadEnvFile();
} catch {
  // no .env file — defaults and process env apply
}

const envSchema = z.object({
  REDIS_URL: z.string().min(1).default("redis://localhost:6380"),
  // Required: every worker job reads from and writes to Cloudinary.
  CLOUDINARY_CLOUD_NAME: z.string().min(1),
  CLOUDINARY_API_KEY: z.string().min(1),
  CLOUDINARY_API_SECRET: z.string().min(1),
  /** Parallel ingest jobs; render stays at 1 (set in the render unit). */
  INGEST_CONCURRENCY: z.coerce.number().int().positive().default(2),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error(
    "worker cannot start — missing/invalid environment:",
    parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; "),
  );
  console.error(
    "set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET in apps/worker/.env",
  );
  process.exit(1);
}

export const env = parsed.data;
