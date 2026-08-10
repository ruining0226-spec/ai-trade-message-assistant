import assert from "node:assert/strict";
import test from "node:test";
import { ModelOutputError, normalizeStructuredField, parseModelOutput } from "@/lib/vision/schema";

test("模型遗漏的截图信息回退为 unknown，而不是确定事实", () => {
  const parsed = parseModelOutput("{}");
  assert.equal(parsed.customer.customerName.value, null);
  assert.equal(parsed.customer.customerName.source, "unknown");
  assert.equal(parsed.customer.customerName.needsReview, true);
});

test("截断的公司名称被标记为低置信度并需要确认", () => {
  const parsed = normalizeStructuredField({
    value: "Example Industrial...", source: "screenshot", evidence: "公司名称在截图右侧被截断",
    confidence: "high", needsReview: false,
  }, { detectTruncation: true });
  assert.equal(parsed.value, "Example Industrial...");
  assert.equal(parsed.confidence, "low");
  assert.equal(parsed.needsReview, true);
});

test("推测只进入 inferences，不会填入缺失的客户事实", () => {
  const parsed = parseModelOutput(JSON.stringify({
    customer: {},
    inferences: [{ content: "可能涉及项目配套", basis: "截图显示机械设备业务", confidence: "medium" }],
  }));
  assert.equal(parsed.customer.industry.value, null);
  assert.equal(parsed.inferences[0]?.content, "可能涉及项目配套");
});

test("证据不足或非法客户类型安全回退为 unknown", () => {
  const parsed = parseModelOutput(JSON.stringify({
    customer: { customerType: { value: "wholesaler", source: "inference", evidence: "", confidence: "high", needsReview: false } },
  }));
  assert.equal(parsed.customer.customerType.value, null);
  assert.equal(parsed.customer.customerType.source, "unknown");
});

test("非法 JSON 被判定为失败", () => {
  assert.throws(() => parseModelOutput("not-json"), (error: unknown) => error instanceof ModelOutputError && error.code === "INVALID_MODEL_JSON");
});
