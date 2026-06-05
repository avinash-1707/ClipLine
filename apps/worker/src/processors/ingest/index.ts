import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import {
  ingestJobSchema,
  type IngestResult,
} from "@clipline/jobs";
import type { Job } from "bullmq";
import { downloadToFile, uploadFile } from "../../lib/cloudinary";
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
  const { assetId, kind, originalUrl, originalFilename } =
    ingestJobSchema.parse(job.data);

  const scratch = await mkdtemp(join(tmpdir(), `clipline-ingest-${assetId}-`));
  try {
    const sourcePath = join(
      scratch,
      `source${extname(originalFilename) || ".bin"}`,
    );
    await downloadToFile(originalUrl, sourcePath);

    const meta = await probe(sourcePath);
    if (kind === "video" && !meta.hasVideo) {
      throw new Error("asset uploaded as video but has no video stream");
    }

    // Normalize
    const normalizedPath = join(
      scratch,
      kind === "video" ? "normalized.mp4" : "normalized.m4a",
    );
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
