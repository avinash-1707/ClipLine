import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z
    .string()
    .min(1)
    .default("postgres://clipline:clipline@localhost:5432/clipline"),
  REDIS_URL: z.string().min(1).default("redis://localhost:6380"),
});

export const env = envSchema.parse(process.env);
