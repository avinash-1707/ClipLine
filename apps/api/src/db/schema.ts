import type { TranscribeWord } from "@clipline/jobs";
import type { Timeline } from "@clipline/timeline";
import { sql } from "drizzle-orm";
import {
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => sql`now()`),
};

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  /** Canonical timeline spec; validated against @clipline/timeline on every write. */
  timeline: jsonb("timeline").$type<Timeline>().notNull(),
  ...timestamps,
});

export const assetKind = pgEnum("asset_kind", ["video", "audio"]);

export const assetStatus = pgEnum("asset_status", [
  "processing",
  "ready",
  "failed",
]);

export const assets = pgTable("assets", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  kind: assetKind("kind").notNull(),
  status: assetStatus("status").notNull().default("processing"),
  originalFilename: text("original_filename").notNull(),
  // Cloudinary public IDs + delivery URLs; null until the ingest step that
  // produces them completes.
  originalPublicId: text("original_public_id").notNull(),
  originalUrl: text("original_url").notNull(),
  normalizedPublicId: text("normalized_public_id"),
  normalizedUrl: text("normalized_url"),
  thumbnailPublicId: text("thumbnail_public_id"),
  thumbnailUrl: text("thumbnail_url"),
  waveformPublicId: text("waveform_public_id"),
  waveformUrl: text("waveform_url"),
  // Probed media metadata; null until ingest completes.
  durationInFrames: integer("duration_in_frames"),
  codec: text("codec"),
  width: integer("width"),
  height: integer("height"),
  /** Populated when status is "failed". */
  error: text("error"),
  ...timestamps,
});

export const renderJobStatus = pgEnum("render_job_status", [
  "queued",
  "rendering",
  "completed",
  "failed",
]);

export const renderJobs = pgTable("render_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  status: renderJobStatus("status").notNull().default("queued"),
  /** 0..1 render progress. */
  progress: real("progress").notNull().default(0),
  outputPublicId: text("output_public_id"),
  outputUrl: text("output_url"),
  /** Populated when status is "failed". */
  error: text("error"),
  ...timestamps,
});

// Coarse phases (Deepgram batch STT isn't per-word streaming, so no numeric
// progress column): the SSE stream reports the phase name as the status.
export const transcribeJobStatus = pgEnum("transcribe_job_status", [
  "queued",
  "downloading",
  "transcribing",
  "completed",
  "failed",
]);

export const transcribeJobs = pgTable("transcribe_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  audioAssetId: uuid("audio_asset_id")
    .notNull()
    .references(() => assets.id, { onDelete: "cascade" }),
  status: transcribeJobStatus("status").notNull().default("queued"),
  /** STT word output (seconds); null until completed. */
  result: jsonb("result").$type<{ words: TranscribeWord[] }>(),
  /** Populated when status is "failed". */
  error: text("error"),
  ...timestamps,
});
