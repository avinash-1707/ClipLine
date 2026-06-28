import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import {
  ingestJobSchema,
  type IngestJob,
  type IngestResult,
} from "@clipline/jobs";
import type { Job } from "bullmq";
import { downloadToFile, uploadFile } from "../../lib/cloudinary";
import { jobLog, jobLogStore } from "../../lib/log-context";
import { logger } from "../../lib/logger";
import {
  durationToFrames,
  normalizeAudio,
  normalizeVideo,
  probe,
  thumbnail,
  waveform,
} from "./ffmpeg";

/**
 * Ingest pipeline: download original from Cloudinary to local scratch,
 * normalize with ffmpeg, generate thumbnail (video) and waveform (audio
 * stream), upload artifacts back to Cloudinary, return metadata over BullMQ.
 * The API persists the result; this processor never touches PostgreSQL.
 */
export async function processIngestJob(job: Job): Promise<IngestResult> {
  // A malformed payload would otherwise throw a raw ZodError that BullMQ
  // persists as failedReason and shows verbatim on the asset card.
  let input: IngestJob;
  try {
    input = ingestJobSchema.parse(job.data);
  } catch {
    throw new Error("ingest input was invalid — the job payload could not be read");
  }
  const { assetId, kind, originalUrl, originalFilename } = input;

  const log = logger.child({ jobId: job.id, assetId, step: "ingest" });
  return jobLogStore.run(log, () =>
    runIngest({ assetId, kind, originalUrl, originalFilename }),
  );
}

async function runIngest({
  assetId,
  kind,
  originalUrl,
  originalFilename,
}: IngestJob): Promise<IngestResult> {
  const started = performance.now();
  jobLog().info({ kind, status: "active" }, "ingest started");

  const scratch = await mkdtemp(join(tmpdir(), `clipline-ingest-${assetId}-`));
  try {
    const sourcePath = join(
      scratch,
      `source${extname(originalFilename) || ".bin"}`,
    );
    jobLog().debug({ step: "download" }, "downloading source");
    await downloadToFile(originalUrl, sourcePath);

    const meta = await probe(sourcePath);
    if (kind === "video" && !meta.hasVideo) {
      throw new Error("asset uploaded as video but has no video stream");
    }
    if (kind === "audio" && !meta.hasAudio) {
      throw new Error("asset uploaded as audio but has no audio stream");
    }

    // Normalize
    const normalizedPath = join(
      scratch,
      kind === "video" ? "normalized.mp4" : "normalized.m4a",
    );
    jobLog().debug({ step: "normalize" }, "normalizing media");
    if (kind === "video") {
      await normalizeVideo(sourcePath, normalizedPath);
    } else {
      await normalizeAudio(sourcePath, normalizedPath);
    }
    const normalized = await uploadFile(normalizedPath, {
      folder: "normalized",
      resourceType: "video",
      publicIdPrefix: "normalized",
    });

    // Thumbnail (video only)
    let thumb: { publicId: string; url: string } | null = null;
    if (kind === "video") {
      const thumbnailPath = join(scratch, "thumbnail.jpg");
      await thumbnail(normalizedPath, thumbnailPath, meta.durationSeconds);
      thumb = await uploadFile(thumbnailPath, {
        folder: "thumbnails",
        resourceType: "image",
        publicIdPrefix: "thumbnail",
      });
    }

    // Waveform (any audio stream)
    let wave: { publicId: string; url: string } | null = null;
    if (meta.hasAudio) {
      const waveformPath = join(scratch, "waveform.png");
      await waveform(normalizedPath, waveformPath);
      wave = await uploadFile(waveformPath, {
        folder: "waveforms",
        resourceType: "image",
        publicIdPrefix: "waveform",
      });
    }

    // Probe the normalized output for final dimensions/codec.
    const finalMeta = await probe(normalizedPath);

    jobLog().info(
      {
        status: "completed",
        durationMs: Math.round(performance.now() - started),
        codec: finalMeta.codec,
        width: finalMeta.width,
        height: finalMeta.height,
        hasThumbnail: thumb !== null,
        hasWaveform: wave !== null,
      },
      "ingest completed",
    );

    return {
      normalizedPublicId: normalized.publicId,
      normalizedUrl: normalized.url,
      thumbnailPublicId: thumb?.publicId ?? null,
      thumbnailUrl: thumb?.url ?? null,
      waveformPublicId: wave?.publicId ?? null,
      waveformUrl: wave?.url ?? null,
      durationInFrames: durationToFrames(finalMeta.durationSeconds),
      codec: finalMeta.codec,
      width: finalMeta.width,
      height: finalMeta.height,
    };
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}
