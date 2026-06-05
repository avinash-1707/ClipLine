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
  // Optional so the API can boot without credentials; upload routes fail
  // with a clear error until they are set (see lib/cloudinary.ts).
  CLOUDINARY_CLOUD_NAME: z.string().min(1).optional(),
  CLOUDINARY_API_KEY: z.string().min(1).optional(),
  CLOUDINARY_API_SECRET: z.string().min(1).optional(),
});

export const env = envSchema.parse(process.env);
