import type { IngestResult } from "@clipline/jobs";
import { stripAssetFromTimeline } from "@clipline/timeline";
import { desc, eq } from "drizzle-orm";
import { destroyMedia } from "../lib/cloudinary";
import { logger } from "../lib/logger";
import { db } from "../db/client";
import { assets, projects } from "../db/schema";

export async function listAssets(projectId: string) {
  return db
    .select()
    .from(assets)
    .where(eq(assets.projectId, projectId))
    .orderBy(desc(assets.createdAt));
}

export async function getAsset(id: string) {
  const [asset] = await db.select().from(assets).where(eq(assets.id, id));
  return asset ?? null;
}

export async function createAsset(input: {
  projectId: string;
  kind: "video" | "audio";
  originalFilename: string;
  originalPublicId: string;
  originalUrl: string;
}) {
  const [asset] = await db.insert(assets).values(input).returning();
  return asset!;
}

/** Persist a successful ingest result coming back over BullMQ. */
export async function markAssetReady(assetId: string, result: IngestResult) {
  await db
    .update(assets)
    .set({
      status: "ready",
      normalizedPublicId: result.normalizedPublicId,
      normalizedUrl: result.normalizedUrl,
      thumbnailPublicId: result.thumbnailPublicId,
      thumbnailUrl: result.thumbnailUrl,
      waveformPublicId: result.waveformPublicId,
      waveformUrl: result.waveformUrl,
      durationInFrames: result.durationInFrames,
      codec: result.codec,
      width: result.width,
      height: result.height,
      error: null,
    })
    .where(eq(assets.id, assetId));
}

export async function markAssetFailed(assetId: string, error: string) {
  await db
    .update(assets)
    .set({ status: "failed", error })
    .where(eq(assets.id, assetId));
}

/**
 * Delete the asset row and its Cloudinary binaries. Scrubs every clip that
 * references the asset from the owning project's timeline in the same
 * transaction so no dangling reference is left behind (a dangling ref would
 * silently break preview and hard-fail export).
 */
export async function deleteAsset(id: string) {
  const binaries = await db.transaction(async (tx) => {
    const [asset] = await tx.select().from(assets).where(eq(assets.id, id));
    if (!asset) return null;

    const [project] = await tx
      .select()
      .from(projects)
      .where(eq(projects.id, asset.projectId));
    if (project) {
      const stripped = stripAssetFromTimeline(project.timeline, id);
      if (stripped !== project.timeline) {
        await tx
          .update(projects)
          .set({ timeline: stripped })
          .where(eq(projects.id, asset.projectId));
      }
    }

    await tx.delete(assets).where(eq(assets.id, id));
    return [
      ["video", asset.originalPublicId],
      ["video", asset.normalizedPublicId],
      ["image", asset.thumbnailPublicId],
      ["image", asset.waveformPublicId],
    ] as Array<["video" | "image" | "raw", string | null]>;
  });

  if (!binaries) return false;

  // Binaries are removed after the row is gone; orphaned binaries are logged,
  // not fatal — the DB is already consistent.
  for (const [resourceType, publicId] of binaries) {
    if (!publicId) continue;
    try {
      await destroyMedia(publicId, resourceType);
    } catch (error) {
      logger.warn(
        { err: error, publicId, assetId: id },
        "failed to delete orphaned Cloudinary binary",
      );
    }
  }
  return true;
}
