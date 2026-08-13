import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { analyzeWithVolcengine, classifyHttpError, VolcengineError } from "@/lib/vision/volcengine";

test("鉴权、余额和参数错误不会被映射成可重试服务错误", () => {
  assert.equal(classifyHttpError(401, "unauthorized").code, "AUTH_FAILED");
  assert.equal(classifyHttpError(403, '{"error":{"code":"AccessDenied","message":"model permission denied"}}').code, "MODEL_UNAVAILABLE");
  assert.equal(classifyHttpError(404, "model not found").code, "MODEL_UNAVAILABLE");
  assert.equal(classifyHttpError(429, "too many requests").code, "RATE_LIMITED");
  assert.equal(classifyHttpError(400, "Insufficient balance").code, "INSUFFICIENT_BALANCE");
  assert.equal(classifyHttpError(400, "invalid image base64").code, "INVALID_IMAGE");
  assert.equal(classifyHttpError(400, "invalid parameter").code, "INVALID_REQUEST");
});

test("临时服务端错误映射为可重试错误", () => {
  assert.equal(classifyHttpError(503, "temporarily unavailable").code, "UPSTREAM_ERROR");
});

test("真实 API 失败会抛出错误，不会返回 Mock 分析", async () => {
  const previousKey = process.env.ARK_API_KEY;
  const previousModel = process.env.ARK_MODEL_ID;
  process.env.ARK_API_KEY = "test-key";
  process.env.ARK_MODEL_ID = "test-model";
  const fetchMock = mock.method(globalThis, "fetch", async () => new Response("temporarily unavailable", { status: 503 }));
  try {
    await assert.rejects(
      analyzeWithVolcengine([{ mimeType: "image/webp", buffer: Buffer.from("test"), originalSize: 4, width: 1, height: 1 }]),
      (error: unknown) => error instanceof VolcengineError && error.code === "UPSTREAM_ERROR",
    );
    assert.equal(fetchMock.mock.callCount(), 1);
  } finally {
    fetchMock.mock.restore();
    if (previousKey === undefined) delete process.env.ARK_API_KEY; else process.env.ARK_API_KEY = previousKey;
    if (previousModel === undefined) delete process.env.ARK_MODEL_ID; else process.env.ARK_MODEL_ID = previousModel;
  }
});

test("模型结构失败日志不泄露 API Key 或完整客户资料", async () => {
  const previousKey = process.env.ARK_API_KEY;
  const previousModel = process.env.ARK_MODEL_ID;
  process.env.ARK_API_KEY = "secret-test-api-key";
  process.env.ARK_MODEL_ID = "test-model";
  const customerSecret = "Synthetic Customer Confidential Name";
  const fetchMock = mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify([customerSecret]) } }] }), { status: 200, headers: { "Content-Type": "application/json" } }));
  const logs: string[] = [];
  const infoMock = mock.method(console, "info", (...values: unknown[]) => { logs.push(values.join(" ")); });
  const warnMock = mock.method(console, "warn", (...values: unknown[]) => { logs.push(values.join(" ")); });
  try {
    await assert.rejects(
      analyzeWithVolcengine([{ mimeType: "image/webp", buffer: Buffer.from("test"), originalSize: 4, width: 1, height: 1 }]),
      (error: unknown) => error instanceof VolcengineError && error.code === "MODEL_SCHEMA_INVALID" && error.upstreamStatus === 200,
    );
    const serializedLogs = logs.join("\n");
    assert.doesNotMatch(serializedLogs, /secret-test-api-key/);
    assert.doesNotMatch(serializedLogs, new RegExp(customerSecret));
    assert.match(serializedLogs, /companyBusiness|MODEL_SCHEMA_INVALID/);
  } finally {
    warnMock.mock.restore();
    infoMock.mock.restore();
    fetchMock.mock.restore();
    if (previousKey === undefined) delete process.env.ARK_API_KEY; else process.env.ARK_API_KEY = previousKey;
    if (previousModel === undefined) delete process.env.ARK_MODEL_ID; else process.env.ARK_MODEL_ID = previousModel;
  }
});
