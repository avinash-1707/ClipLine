import { v2 as cloudinary } from "cloudinary";
import { env } from "./env";

let configured = false;

/** True when Cloudinary credentials are present in the environment. */
export function isCloudinaryConfigured(): boolean {
  return Boolean(
    env.CLOUDINARY_CLOUD_NAME &&
      env.CLOUDINARY_API_KEY &&
      env.CLOUDINARY_API_SECRET,
  );
}

/**
 * Returns the configured Cloudinary client, or throws if credentials are
 * missing from the environment. Called lazily so the API can boot (health,
 * project CRUD) without credentials.
 */
export function getCloudinary() {
  if (!configured) {
    if (
      !env.CLOUDINARY_CLOUD_NAME ||
      !env.CLOUDINARY_API_KEY ||
      !env.CLOUDINARY_API_SECRET
    ) {
      throw new Error(
        "Cloudinary credentials missing: set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET",
      );
    }
    cloudinary.config({
      cloud_name: env.CLOUDINARY_CLOUD_NAME,
      api_key: env.CLOUDINARY_API_KEY,
      api_secret: env.CLOUDINARY_API_SECRET,
    });
    configured = true;
  }
  return cloudinary;
}

/** Upload a buffer to Cloudinary under the clipline folder. */
export async function uploadBuffer(
  buffer: Buffer,
  options: {
    folder: string;
    resourceType: "video" | "image" | "raw";
    publicIdPrefix: string;
  },
) {
  const client = getCloudinary();
  return new Promise<{ publicId: string; url: string }>((resolve, reject) => {
    const stream = client.uploader.upload_stream(
      {
        folder: `clipline/${options.folder}`,
        resource_type: options.resourceType,
        public_id: `${options.publicIdPrefix}-${crypto.randomUUID()}`,
      },
      (error, result) => {
        if (error || !result) {
          reject(error ?? new Error("cloudinary upload returned no result"));
          return;
        }
        resolve({ publicId: result.public_id, url: result.secure_url });
      },
    );
    stream.end(buffer);
  });
}

/** Delete an asset's binaries from Cloudinary; ignores already-deleted ids. */
export async function destroyMedia(
  publicId: string,
  resourceType: "video" | "image" | "raw",
) {
  const client = getCloudinary();
  await client.uploader.destroy(publicId, { resource_type: resourceType });
}
