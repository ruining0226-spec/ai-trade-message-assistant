export const MAX_IMAGE_COUNT = 5;
export const MAX_SOURCE_IMAGE_BYTES = 10 * 1024 * 1024;

// Vercel Functions reject request bodies above roughly 4.5 MB. Keeping the
// binary images at 3 MiB leaves room for multipart headers and also keeps the
// server-side Base64 JSON sent upstream near 4 MiB before prompt overhead.
export const MAX_PREPARED_IMAGE_BYTES = Math.floor(1.5 * 1024 * 1024);
export const MAX_PREPARED_TOTAL_BYTES = 3 * 1024 * 1024;

export const UPLOAD_TOO_LARGE_MESSAGE = "图片体积过大，请减少图片数量或上传更小的截图。";

