import assert from "node:assert/strict";
import test from "node:test";
import { ImageValidationError, validateAndPrepareImage } from "@/lib/vision/images";

test("拒绝伪装成图片的文件", async () => {
  const file = new File(["plain text"], "fake.png", { type: "image/png" });
  await assert.rejects(validateAndPrepareImage(file), (error: unknown) => error instanceof ImageValidationError && error.code === "UNSUPPORTED_IMAGE");
});

test("拒绝空图片", async () => {
  const file = new File([], "empty.png", { type: "image/png" });
  await assert.rejects(validateAndPrepareImage(file), (error: unknown) => error instanceof ImageValidationError && error.code === "EMPTY_FILE");
});
