// Queue names and job payload/result contracts shared by apps/api (producer,
// result consumer) and apps/worker (processor). The worker never talks to
// PostgreSQL: it returns an ingest result over BullMQ and the API persists it.
import { z } from "zod";

export const INGEST_QUEUE = "ingest";
export const RENDER_QUEUE = "render";

// ---------------------------------------------------------------------------
// Ingest
// ---------------------------------------------------------------------------

export const ingestJobSchema = z.object({
  assetId: z.uuid(),
  kind: z.enum(["video", "audio"]),
  /** Cloudinary delivery URL of the original upload. */
  originalUrl: z.url(),
  originalFilename: z.string().min(1),
});

export const ingestResultSchema = z.object({
  normalizedPublicId: z.string().min(1),
  normalizedUrl: z.url(),
  /** Video only; null for audio assets. */
  thumbnailPublicId: z.string().min(1).nullable(),
  thumbnailUrl: z.url().nullable(),
  /** Null when the source has no audio stream. */
  waveformPublicId: z.string().min(1).nullable(),
  waveformUrl: z.url().nullable(),
  durationInFrames: z.int().positive(),
  codec: z.string().min(1),
  /** Video only; null for audio assets. */
  width: z.int().positive().nullable(),
  height: z.int().positive().nullable(),
});

export type IngestJob = z.infer<typeof ingestJobSchema>;
export type IngestResult = z.infer<typeof ingestResultSchema>;
