import sharp from "sharp";
import { MAX_IMAGE_COUNT, MAX_SOURCE_IMAGE_BYTES } from "@/lib/vision/limits";

export { MAX_IMAGE_COUNT };
export const MAX_IMAGE_SIZE = MAX_SOURCE_IMAGE_BYTES;
export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export class ImageValidationError extends Error {
  constructor(public readonly code: "EMPTY_FILE" | "UNSUPPORTED_IMAGE" | "IMAGE_TOO_LARGE" | "INVALID_IMAGE") {
    super(code);
  }
}

function sniffMime(buffer: Buffer): (typeof ACCEPTED_IMAGE_TYPES)[number] | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

export interface PreparedImage {
  mimeType: "image/webp";
  buffer: Buffer;
  originalSize: number;
  width: number;
  height: number;
}

export async function validateAndPrepareImage(file: File): Promise<PreparedImage> {
  if (!file.size) throw new ImageValidationError("EMPTY_FILE");
  if (file.size > MAX_IMAGE_SIZE) throw new ImageValidationError("IMAGE_TOO_LARGE");
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type as (typeof ACCEPTED_IMAGE_TYPES)[number])) throw new ImageValidationError("UNSUPPORTED_IMAGE");

  const input = Buffer.from(await file.arrayBuffer());
  const actualMime = sniffMime(input);
  if (!actualMime || actualMime !== file.type) throw new ImageValidationError("UNSUPPORTED_IMAGE");

  try {
    const base = sharp(input, { failOn: "error", limitInputPixels: 80_000_000 }).rotate();
    const metadata = await base.metadata();
    if (!metadata.width || !metadata.height) throw new ImageValidationError("INVALID_IMAGE");
    const oversized = metadata.width > 3200 || metadata.height > 5000 || input.length > 4 * 1024 * 1024;
    let pipeline = sharp(input, { failOn: "error", limitInputPixels: 80_000_000 }).rotate();
    if (oversized) pipeline = pipeline.resize({ width: 3200, height: 5000, fit: "inside", withoutEnlargement: true });
    let output = await pipeline.webp({ quality: 92, smartSubsample: false }).toBuffer();
    if (output.length > 5 * 1024 * 1024) {
      output = await sharp(input, { failOn: "error", limitInputPixels: 80_000_000 })
        .rotate().resize({ width: 2600, height: 4200, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 86, smartSubsample: false }).toBuffer();
    }
    const finalMetadata = await sharp(output).metadata();
    return { mimeType: "image/webp", buffer: output, originalSize: file.size, width: finalMetadata.width || metadata.width, height: finalMetadata.height || metadata.height };
  } catch (error) {
    if (error instanceof ImageValidationError) throw error;
    throw new ImageValidationError("INVALID_IMAGE");
  }
}
