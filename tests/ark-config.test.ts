import assert from "node:assert/strict";
import test from "node:test";
import { getArkConfigStatus } from "@/lib/vision/config";

test("接受 doubao 开头的模型 ID，不要求 ep- 前缀", () => {
  const previousKey = process.env.ARK_API_KEY;
  const previousModel = process.env.ARK_MODEL_ID;
  try {
    process.env.ARK_API_KEY = "test-key-present";
    process.env.ARK_MODEL_ID = "doubao-seed-2-1-pro-260628";
    const status = getArkConfigStatus();
    assert.equal(status.configured, true);
    assert.deepEqual(status.missingVariables, []);
    assert.equal(status.modelId, "doubao-seed-2-1-pro-260628");
  } finally {
    if (previousKey === undefined) delete process.env.ARK_API_KEY; else process.env.ARK_API_KEY = previousKey;
    if (previousModel === undefined) delete process.env.ARK_MODEL_ID; else process.env.ARK_MODEL_ID = previousModel;
  }
});
