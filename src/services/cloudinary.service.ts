import { v2 as cloudinary } from "cloudinary";
import { logger } from "../utils/logger";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Upload an image buffer to Cloudinary
 */
export const uploadImage = (fileBuffer: Buffer): Promise<string> => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: "ai-therapy-avatars",
      },
      (error, result) => {
        if (error) {
          logger.error("Cloudinary upload error:", error);
          return reject(error);
        }
        if (result) {
          resolve(result.secure_url);
        } else {
          reject(new Error("Cloudinary upload failed with no result"));
        }
      }
    );

    uploadStream.end(fileBuffer);
  });
};
