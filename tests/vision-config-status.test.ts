import assert from "node:assert/strict";
import test from "node:test";
import nextConfig from "@/next.config";
import { GET } from "@/app/api/analyze-customer/route";
import { VisionConfigCheckController } from "@/lib/vision/config-client";

const jsonResponse = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { "Content-Type": "application/json" },
});

function preserveArkEnvironment() {
  const apiKey = process.env.ARK_API_KEY;
  const modelId = process.env.ARK_MODEL_ID;
  return () => {
    if (apiKey === undefined) delete process.env.ARK_API_KEY; else process.env.ARK_API_KEY = apiKey;
    if (modelId === undefined) delete process.env.ARK_MODEL_ID; else process.env.ARK_MODEL_ID = modelId;
  };
}

test("配置齐全时接口快速返回 configured:true 且不调用外部服务", async () => {
  const restoreEnvironment = preserveArkEnvironment();
  const originalFetch = globalThis.fetch;
  let externalCalls = 0;
  try {
    process.env.ARK_API_KEY = "synthetic-test-key";
    process.env.ARK_MODEL_ID = "synthetic-test-model";
    globalThis.fetch = async () => { externalCalls += 1; throw new Error("External request must not run"); };
    const started = performance.now();
    const response = GET();
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.ok(performance.now() - started < 500);
    assert.deepEqual(payload, { mode: "volcengine", configured: true });
    assert.equal(externalCalls, 0);
    assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
    assert.doesNotMatch(JSON.stringify(payload), /synthetic-test-key|synthetic-test-model|apiKey|modelId/i);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnvironment();
  }
});

test("配置缺失时接口返回 configured:false 而不是 500", async () => {
  const restoreEnvironment = preserveArkEnvironment();
  try {
    delete process.env.ARK_API_KEY;
    delete process.env.ARK_MODEL_ID;
    const response = GET();
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { mode: "mock", configured: false });
  } finally {
    restoreEnvironment();
  }
});

test("API 异常、超时和格式异常都返回明确错误结果", async () => {
  const requestFailure = new VisionConfigCheckController(async () => { throw new Error("offline"); });
  assert.deepEqual(await requestFailure.check(), { kind: "error", reason: "request_failed" });

  const invalid = new VisionConfigCheckController(async () => jsonResponse({ configured: true, mode: "unexpected", apiKey: "must-ignore" }));
  assert.deepEqual(await invalid.check(), { kind: "error", reason: "invalid_response" });

  const hanging = new VisionConfigCheckController((_input, init) => new Promise((_resolve, reject) => {
    init.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
  }));
  assert.deepEqual(await hanging.check(10), { kind: "error", reason: "timeout" });
});

test("重新检查可以再次请求并使用新的成功结果", async () => {
  let calls = 0;
  const checker = new VisionConfigCheckController(async () => {
    calls += 1;
    if (calls === 1) throw new Error("temporary");
    return jsonResponse({ configured: true, mode: "volcengine" });
  });
  assert.equal((await checker.check()).kind, "error");
  assert.deepEqual(await checker.check(), { kind: "success", status: { configured: true, mode: "volcengine" } });
  assert.equal(calls, 2);
});

test("组件取消和重复请求不会让旧结果覆盖新结果", async () => {
  let resolveFirst: ((response: Response) => void) | undefined;
  let calls = 0;
  const checker = new VisionConfigCheckController(async () => {
    calls += 1;
    if (calls === 1) return new Promise<Response>(resolve => { resolveFirst = resolve; });
    return jsonResponse({ configured: false, mode: "mock" });
  });
  const first = checker.check();
  const second = checker.check();
  assert.deepEqual(await second, { kind: "success", status: { configured: false, mode: "mock" } });
  resolveFirst?.(jsonResponse({ configured: true, mode: "volcengine" }));
  assert.deepEqual(await first, { kind: "stale" });

  const pending = checker.check();
  checker.cancel();
  assert.equal((await pending).kind, "stale");
});

test("本地开发允许通过 127.0.0.1 加载客户端资源", () => {
  assert.ok(Array.isArray(nextConfig.allowedDevOrigins));
  assert.ok(nextConfig.allowedDevOrigins.includes("127.0.0.1"));
});
