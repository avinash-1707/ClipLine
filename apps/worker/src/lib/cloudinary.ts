import { createReadStream } from "node:fs";
import { v2 as cloudinary } from "cloudinary";
import { env } from "./env";

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
    throw new Error(
      `source download failed — network error: ${(error as Error).message}`,
    );
  }
  if (!response.ok || !response.body) {
    throw new Error(`source download failed (HTTP ${response.status})`);
  }
  const { writeFile } = await import("node:fs/promises");
  await writeFile(destPath, Buffer.from(await response.arrayBuffer()));
}
