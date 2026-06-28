import { z } from "zod";

// Load .env if present (gitignored; holds Cloudinary credentials).
try {
  process.loadEnvFile();
} catch {
  // no .env file — defaults and process env apply
}

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z
    .string()
    .min(1)
    .default("postgres://clipline:clipline@localhost:5432/clipline"),
  REDIS_URL: z.string().min(1).default("redis://localhost:6380"),
  // Browser origin allowed to call the API. The editor runs on localhost:3000
  // by default; widen only deliberately (no auth means CORS is the only gate).
  CORS_ORIGIN: z.string().min(1).default("http://localhost:3000"),
  // Reject uploads larger than this before buffering them into memory.
  MAX_UPLOAD_MB: z.coerce.number().int().positive().default(1024),
  // Optional so the API can boot without credentials; upload routes fail
  // with a clear error until they are set (see lib/cloudinary.ts).
  CLOUDINARY_CLOUD_NAME: z.string().min(1).optional(),
  CLOUDINARY_API_KEY: z.string().min(1).optional(),
  CLOUDINARY_API_SECRET: z.string().min(1).optional(),
});

export const env = envSchema.parse(process.env);
