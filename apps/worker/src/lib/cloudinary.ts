import { createReadStream, createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream } from "node:stream/web";
import { v2 as cloudinary } from "cloudinary";
import { env } from "./env";
import { jobLog } from "./log-context";

cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
});

/** Upload a file from local scratch to Cloudinary under the clipline folder. */
export async function uploadFile(
  filePath: string,
  options: {
    folder: string;
    resourceType: "video" | "image" | "raw";
    publicIdPrefix: string;
  },
) {
  return new Promise<{ publicId: string; url: string }>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: `clipline/${options.folder}`,
        resource_type: options.resourceType,
        public_id: `${options.publicIdPrefix}-${crypto.randomUUID()}`,
      },
      (error, result) => {
        if (error || !result) {
          jobLog().error(
            { err: error, step: `upload:${options.folder}` },
            "cloudinary upload failed",
          );
          reject(
            new Error(
              `cloudinary upload failed (${options.folder}): ${error?.message ?? "no result returned"}`,
            ),
          );
          return;
        }
        resolve({ publicId: result.public_id, url: result.secure_url });
      },
    );
    createReadStream(filePath).on("error", reject).pipe(stream);
  });
}

/** Download a Cloudinary delivery URL to a local scratch path. */
export async function downloadToFile(url: string, destPath: string) {
  let response: Response;
  try {
    response = await fetch(url);
  } catch (error) {
    jobLog().error({ err: error, step: "download" }, "source download failed (network)");
    throw new Error(
      `source download failed — network error: ${(error as Error).message}`,
    );
  }
  if (!response.ok || !response.body) {
    jobLog().error({ step: "download", httpStatus: response.status }, "source download failed");
    throw new Error(`source download failed (HTTP ${response.status})`);
  }
  // Stream to disk rather than buffering the whole file in memory — source
  // clips can be hundreds of MB to several GB.
  await pipeline(
    Readable.fromWeb(response.body as ReadableStream<Uint8Array>),
    createWriteStream(destPath),
  );
}
