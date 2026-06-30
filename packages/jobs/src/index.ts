// Queue names and job payload/result contracts shared by apps/api (producer,
// result consumer) and apps/worker (processor). The worker never talks to
// PostgreSQL: it returns an ingest result over BullMQ and the API persists it.
import { z } from "zod";

export const INGEST_QUEUE = "ingest";
export const RENDER_QUEUE = "render";
export const TRANSCRIBE_QUEUE = "transcribe";

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

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

export const renderJobSchema = z.object({
  renderJobId: z.uuid(),
  projectId: z.uuid(),
  /** Validated against @clipline/timeline by the API before enqueue and by
   * the worker before render. Kept loose here to avoid a schema dependency
   * between queue plumbing and the timeline package. */
  timeline: z.unknown(),
  /** assetId -> normalized Cloudinary URL for every asset the timeline uses. */
  assetUrls: z.record(z.string(), z.url()),
  /** assetId -> source dimensions, for video clips. Used to compute the
   * pan/zoom framing rect at render time (parity with the canvas preview).
   * Defaults to empty so older queued payloads still parse. */
  assetDims: z
    .record(
      z.string(),
      z.object({
        width: z.int().positive(),
        height: z.int().positive(),
      }),
    )
    .default({}),
});

export const renderResultSchema = z.object({
  outputPublicId: z.string().min(1),
  outputUrl: z.url(),
});

export type RenderJob = z.infer<typeof renderJobSchema>;
export type RenderResult = z.infer<typeof renderResultSchema>;

// ---------------------------------------------------------------------------
// Transcribe (speech-to-text for auto subtitles)
// ---------------------------------------------------------------------------

export const transcribeJobSchema = z.object({
  transcribeJobId: z.uuid(),
  projectId: z.uuid(),
  /** The voiceover asset the API resolved (longest contiguous audio clip). */
  audioAssetId: z.uuid(),
  /** Normalized Cloudinary delivery URL of that asset. */
  audioUrl: z.url(),
  /** BCP-47-ish language hint for the STT engine. */
  language: z.string().min(2).default("en"),
});

/** One transcribed word with SECOND-based timing. The worker stays unaware of
 * fps; the web client converts seconds -> frames when authoring caption clips. */
export const transcribeWordSchema = z.object({
  text: z.string().min(1),
  startSec: z.number().nonnegative(),
  endSec: z.number().positive(),
});

export const transcribeResultSchema = z.object({
  /** Empty when the audio has no detectable speech — a valid result, not a failure. */
  words: z.array(transcribeWordSchema),
});

export type TranscribeJob = z.infer<typeof transcribeJobSchema>;
export type TranscribeWord = z.infer<typeof transcribeWordSchema>;
export type TranscribeResult = z.infer<typeof transcribeResultSchema>;
