import type { TaskImage } from "@/types";
import {
  MAX_IMAGE_COUNT,
  MAX_PREPARED_IMAGE_BYTES,
  MAX_PREPARED_TOTAL_BYTES,
  MAX_SOURCE_IMAGE_BYTES,
  UPLOAD_TOO_LARGE_MESSAGE,
} from "@/lib/vision/limits";

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_WIDTH = 2400;
const MAX_HEIGHT = 4000;

export class ClientImageError extends Error {
  constructor(public readonly code: "TOO_MANY_IMAGES" | "INVALID_IMAGE" | "SOURCE_TOO_LARGE" | "PREPARED_TOO_LARGE", message: string) {
    super(message);
  }
}

export interface PrepareClientImagesOptions {
  existingCount?: number;
  existingBytes?: number;
  compress?: (file: File, maxBytes: number) => Promise<File>;
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("图片压缩失败。")), "image/webp", quality);
  });
}

function webpName(name: string) {
  return `${name.replace(/\.[^.]+$/, "") || "customer-screenshot"}.webp`;
}

export async function compressImageForUpload(file: File, maxBytes: number): Promise<File> {
  if (file.size <= maxBytes) return file;
  if (typeof document === "undefined" || typeof createImageBitmap === "undefined") {
    throw new ClientImageError("PREPARED_TOO_LARGE", UPLOAD_TOO_LARGE_MESSAGE);
  }

  const bitmap = await createImageBitmap(file);
  let scale = Math.min(1, MAX_WIDTH / bitmap.width, MAX_HEIGHT / bitmap.height);
  let lastBlob: Blob | null = null;
  try {
    for (let resizeAttempt = 0; resizeAttempt < 5; resizeAttempt += 1) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("浏览器无法创建图片压缩画布。");
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

      for (const quality of [0.9, 0.82, 0.74, 0.66, 0.58]) {
        lastBlob = await canvasToBlob(canvas, quality);
        if (lastBlob.size <= maxBytes) return new File([lastBlob], webpName(file.name), { type: "image/webp", lastModified: file.lastModified });
      }
      scale *= 0.82;
    }
  } finally {
    bitmap.close?.();
  }

  if (!lastBlob) throw new ClientImageError("PREPARED_TOO_LARGE", UPLOAD_TOO_LARGE_MESSAGE);
  return new File([lastBlob], webpName(file.name), { type: "image/webp", lastModified: file.lastModified });
}

export async function prepareClientImages(files: File[], options: PrepareClientImagesOptions = {}) {
  const existingCount = options.existingCount || 0;
  const existingBytes = options.existingBytes || 0;
  if (existingCount + files.length > MAX_IMAGE_COUNT) {
    throw new ClientImageError("TOO_MANY_IMAGES", `最多只能上传 ${MAX_IMAGE_COUNT} 张图片。`);
  }
  if (!files.length) return [];

  for (const file of files) {
    if (!file.size || !ACCEPTED_TYPES.includes(file.type)) throw new ClientImageError("INVALID_IMAGE", `${file.name} 不是有效的 JPG、PNG 或 WebP 图片。`);
    if (file.size > MAX_SOURCE_IMAGE_BYTES) throw new ClientImageError("SOURCE_TOO_LARGE", `${file.name} 原图超过 10MB，请先缩小后重试。`);
  }

  const remainingBytes = MAX_PREPARED_TOTAL_BYTES - existingBytes;
  if (remainingBytes <= 0) throw new ClientImageError("PREPARED_TOO_LARGE", UPLOAD_TOO_LARGE_MESSAGE);
  const perImageBudget = Math.min(MAX_PREPARED_IMAGE_BYTES, Math.floor(remainingBytes / files.length));
  const compressor = options.compress || compressImageForUpload;
  const prepared: File[] = [];
  for (const file of files) prepared.push(file.size > perImageBudget ? await compressor(file, perImageBudget) : file);

  if (prepared.some(file => file.size > MAX_PREPARED_IMAGE_BYTES) || existingBytes + prepared.reduce((sum, file) => sum + file.size, 0) > MAX_PREPARED_TOTAL_BYTES) {
    throw new ClientImageError("PREPARED_TOO_LARGE", UPLOAD_TOO_LARGE_MESSAGE);
  }
  return prepared;
}

export function assertPreparedUpload(files: File[]) {
  if (!files.length) throw new ClientImageError("INVALID_IMAGE", "请至少上传一张客户或公司截图。");
  if (files.length > MAX_IMAGE_COUNT) throw new ClientImageError("TOO_MANY_IMAGES", `最多只能上传 ${MAX_IMAGE_COUNT} 张图片。`);
  if (files.some(file => file.size > MAX_PREPARED_IMAGE_BYTES) || files.reduce((sum, file) => sum + file.size, 0) > MAX_PREPARED_TOTAL_BYTES) {
    throw new ClientImageError("PREPARED_TOO_LARGE", UPLOAD_TOO_LARGE_MESSAGE);
  }
}

export async function postPreparedImages(files: File[], requestId: string, signal: AbortSignal, fetcher: typeof fetch = fetch) {
  assertPreparedUpload(files);
  const formData = new FormData();
  files.forEach(file => formData.append("images", file));
  return fetcher("/api/analyze-customer", { method: "POST", headers: { "x-analysis-request-id": requestId }, body: formData, signal });
}

export function toPersistedImageMetadata(images: TaskImage[]): TaskImage[] {
  return images.map(image => ({ id: image.id, name: image.name, type: image.type, size: image.size }));
}

