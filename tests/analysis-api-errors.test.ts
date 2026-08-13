import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { POST } from "@/app/api/analyze-customer/route";

const onePixelPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");

test("分析 API 区分结构错误且响应不泄露密钥或模型正文", async () => {
  const previousKey = process.env.ARK_API_KEY;
  const previousModel = process.env.ARK_MODEL_ID;
  process.env.ARK_API_KEY = "secret-analysis-api-key";
  process.env.ARK_MODEL_ID = "test-model";
  const customerSecret = "Synthetic Confidential Customer";
  const fetchMock = mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify([customerSecret]) } }] }), { status: 200, headers: { "Content-Type": "application/json" } }));
  const infoMock = mock.method(console, "info", () => undefined);
  const warnMock = mock.method(console, "warn", () => undefined);
  try {
    const form = new FormData();
    form.append("images", new File([onePixelPng], "synthetic.png", { type: "image/png" }));
    const response = await POST(new Request("http://localhost/api/analyze-customer", { method: "POST", headers: { "x-analysis-request-id": "safe-schema-test" }, body: form }));
    const body = await response.text();
    assert.equal(response.status, 502);
    assert.match(body, /MODEL_SCHEMA_INVALID/);
    assert.doesNotMatch(body, /secret-analysis-api-key/);
    assert.doesNotMatch(body, new RegExp(customerSecret));
  } finally {
    warnMock.mock.restore();
    infoMock.mock.restore();
    fetchMock.mock.restore();
    if (previousKey === undefined) delete process.env.ARK_API_KEY; else process.env.ARK_API_KEY = previousKey;
    if (previousModel === undefined) delete process.env.ARK_MODEL_ID; else process.env.ARK_MODEL_ID = previousModel;
  }
});
