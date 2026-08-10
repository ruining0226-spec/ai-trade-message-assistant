import assert from "node:assert/strict";
import test from "node:test";
import {
  ClientImageError,
  postPreparedImages,
  prepareClientImages,
  toPersistedImageMetadata,
} from "@/lib/vision/client-images";
import {
  MAX_IMAGE_COUNT,
  MAX_PREPARED_IMAGE_BYTES,
  MAX_PREPARED_TOTAL_BYTES,
  UPLOAD_TOO_LARGE_MESSAGE,
} from "@/lib/vision/limits";
import type { TaskImage } from "@/types";

function imageFile(name: string, size: number) {
  return new File([new Uint8Array(size)], name, { type: "image/png" });
}

test("小图片无需压缩即可正常准备和提交", async () => {
  const original = imageFile("small.png", 20_000);
  const prepared = await prepareClientImages([original]);
  assert.equal(prepared[0], original);

  let calls = 0;
  const response = await postPreparedImages(prepared, "request-small", new AbortController().signal, (async () => {
    calls += 1;
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as typeof fetch);
  assert.equal(response.status, 200);
  assert.equal(calls, 1);
});

test("大图片会先经过浏览器压缩函数", async () => {
  const original = imageFile("large.png", MAX_PREPARED_IMAGE_BYTES + 100_000);
  let compressed = false;
  const prepared = await prepareClientImages([original], {
    compress: async (file, maxBytes) => {
      compressed = true;
      assert.equal(file, original);
      return new File([new Uint8Array(maxBytes - 1)], "large.webp", { type: "image/webp" });
    },
  });
  assert.equal(compressed, true);
  assert.equal(prepared[0]?.type, "image/webp");
  assert.ok((prepared[0]?.size || 0) <= MAX_PREPARED_IMAGE_BYTES);
});

test("最多五张图片压缩后的总大小保持在安全限制以内", async () => {
  const source = Array.from({ length: MAX_IMAGE_COUNT }, (_, index) => imageFile(`${index}.png`, 900_000));
  const prepared = await prepareClientImages(source, {
    compress: async (file, maxBytes) => new File([new Uint8Array(maxBytes - 100)], file.name.replace(".png", ".webp"), { type: "image/webp" }),
  });
  assert.equal(prepared.length, MAX_IMAGE_COUNT);
  assert.ok(prepared.reduce((sum, file) => sum + file.size, 0) <= MAX_PREPARED_TOTAL_BYTES);
  assert.ok(Math.ceil(MAX_PREPARED_TOTAL_BYTES / 3) * 4 < 4.5 * 1024 * 1024);
});

test("压缩后仍然超限时给出明确提示", async () => {
  const original = imageFile("too-large.png", MAX_PREPARED_IMAGE_BYTES + 1);
  await assert.rejects(
    prepareClientImages([original], { compress: async file => file }),
    (error: unknown) => error instanceof ClientImageError && error.code === "PREPARED_TOO_LARGE" && error.message === UPLOAD_TOO_LARGE_MESSAGE,
  );
});

test("超限时不会调用后端API", async () => {
  let calls = 0;
  await assert.rejects(
    postPreparedImages([imageFile("too-large.png", MAX_PREPARED_IMAGE_BYTES + 1)], "blocked", new AbortController().signal, (async () => {
      calls += 1;
      return new Response(null, { status: 200 });
    }) as typeof fetch),
    (error: unknown) => error instanceof ClientImageError && error.message === UPLOAD_TOO_LARGE_MESSAGE,
  );
  assert.equal(calls, 0);
});

test("现有最多五张规则保持不变", async () => {
  const five = Array.from({ length: MAX_IMAGE_COUNT }, (_, index) => imageFile(`${index}.png`, 10_000));
  assert.equal((await prepareClientImages(five)).length, MAX_IMAGE_COUNT);
  await assert.rejects(
    prepareClientImages([...five, imageFile("six.png", 10_000)]),
    (error: unknown) => error instanceof ClientImageError && error.code === "TOO_MANY_IMAGES",
  );
});

test("持久化任务时只保留图片元数据", () => {
  const file = imageFile("customer.png", 10_000);
  const sessionImage: TaskImage = { id: "image-1", name: file.name, type: file.type, size: file.size, file, previewUrl: "blob:preview" };
  const persisted = toPersistedImageMetadata([sessionImage]);
  assert.deepEqual(persisted, [{ id: "image-1", name: "customer.png", type: "image/png", size: 10_000 }]);
  assert.equal("file" in persisted[0]!, false);
  assert.equal("previewUrl" in persisted[0]!, false);
});

test("合规图片仍调用原有客户分析API并使用multipart字段", async () => {
  const files = [imageFile("one.png", 10_000), imageFile("two.png", 10_000)];
  let capturedUrl = "";
  let capturedImages = 0;
  await postPreparedImages(files, "request-existing-flow", new AbortController().signal, (async (input, init) => {
    capturedUrl = String(input);
    capturedImages = init?.body instanceof FormData ? init.body.getAll("images").length : 0;
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as typeof fetch);
  assert.equal(capturedUrl, "/api/analyze-customer");
  assert.equal(capturedImages, 2);
});

