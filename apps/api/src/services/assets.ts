import type { IngestResult } from "@clipline/jobs";
import { desc, eq } from "drizzle-orm";
import { destroyMedia } from "../lib/cloudinary";
import { db } from "../db/client";
import { assets } from "../db/schema";

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

/** Delete the asset row and its Cloudinary binaries. */
export async function deleteAsset(id: string) {
  const asset = await getAsset(id);
  if (!asset) return false;

  const binaries: Array<["video" | "image" | "raw", string | null]> = [
    ["video", asset.originalPublicId],
    ["video", asset.normalizedPublicId],
    ["image", asset.thumbnailPublicId],
    ["image", asset.waveformPublicId],
  ];
  for (const [resourceType, publicId] of binaries) {
    if (!publicId) continue;
    try {
      await destroyMedia(publicId, resourceType);
    } catch (error) {
      // Row deletion proceeds; orphaned binaries are logged, not fatal.
      console.error(`failed to delete ${publicId} from Cloudinary:`, error);
    }
  }

  await db.delete(assets).where(eq(assets.id, id));
  return true;
}
