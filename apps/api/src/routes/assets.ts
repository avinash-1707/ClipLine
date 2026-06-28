import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { isCloudinaryConfigured, uploadBuffer } from "../lib/cloudinary";
import { env } from "../lib/env";
import { AppError } from "../lib/errors";
import { enqueueIngest } from "../lib/queues";
import { fail, ok } from "../lib/respond";
import { validationHook } from "../lib/validate";
import {
  createAsset,
  deleteAsset,
  getAsset,
  listAssets,
  markAssetFailed,
} from "../services/assets";
import { getProject } from "../services/projects";

const idParam = z.object({ id: z.uuid() });
const projectIdParam = z.object({ projectId: z.uuid() });
const MAX_UPLOAD_BYTES = env.MAX_UPLOAD_MB * 1024 * 1024;

function assetKindFromMime(mime: string): "video" | "audio" | null {
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return null;
}

/** Mounted at /projects/:projectId/assets */
export const projectAssetRoutes = new Hono()

  .get("/", zValidator("param", projectIdParam, validationHook), async (c) => {
    const { projectId } = c.req.valid("param");
    if (!(await getProject(projectId))) {
      return fail(c, "project not found", 404);
    }
    return ok(c, await listAssets(projectId));
  })

  .post("/", zValidator("param", projectIdParam, validationHook), async (c) => {
    if (!isCloudinaryConfigured()) {
      return fail(
        c,
        "media storage is not configured: set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET",
        503,
      );
    }
    const { projectId } = c.req.valid("param");
    if (!(await getProject(projectId))) {
      return fail(c, "project not found", 404);
    }

    // Reject oversized uploads before the body is buffered into memory.
    const contentLength = Number(c.req.header("content-length") ?? 0);
    if (contentLength > MAX_UPLOAD_BYTES) {
      return fail(c, `upload exceeds the ${env.MAX_UPLOAD_MB} MB limit`, 413);
    }

    const body = await c.req.parseBody();
    const file = body["file"];
    if (!(file instanceof File)) {
      return fail(c, "multipart field 'file' is required", 400);
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return fail(c, `upload exceeds the ${env.MAX_UPLOAD_MB} MB limit`, 413);
    }
    const kind = assetKindFromMime(file.type);
    if (!kind) {
      return fail(c, `unsupported media type '${file.type}'`, 415);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const original = await uploadBuffer(buffer, {
      folder: "uploads",
      resourceType: "video", // Cloudinary stores audio under resource_type video
      publicIdPrefix: "original",
    });

    const asset = await createAsset({
      projectId,
      kind,
      originalFilename: file.name,
      originalPublicId: original.publicId,
      originalUrl: original.url,
    });

    // If the enqueue fails the row would otherwise sit in "processing" forever;
    // mark it failed so the client stops polling and surfaces the error.
    try {
      await enqueueIngest({
        assetId: asset.id,
        kind,
        originalUrl: original.url,
        originalFilename: file.name,
      });
    } catch (error) {
      await markAssetFailed(
        asset.id,
        error instanceof Error ? error.message : "could not queue ingest",
      );
      // the file did upload; only queueing the ingest failed — don't imply the
      // upload itself was lost.
      throw new AppError(503, "uploaded, but couldn't start processing — is redis running?");
    }

    return ok(c, asset, 201);
  });

/** Mounted at /assets */
export const assetRoutes = new Hono()

  .get("/:id", zValidator("param", idParam, validationHook), async (c) => {
    const { id } = c.req.valid("param");
    const asset = await getAsset(id);
    if (!asset) return fail(c, "asset not found", 404);
    return ok(c, asset);
  })

  .delete("/:id", zValidator("param", idParam, validationHook), async (c) => {
    const { id } = c.req.valid("param");
    const deleted = await deleteAsset(id);
    if (!deleted) return fail(c, "asset not found", 404);
    return ok(c, { id });
  });
