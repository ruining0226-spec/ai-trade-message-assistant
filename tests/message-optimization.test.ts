import assert from "node:assert/strict";
import test from "node:test";
import { applyOptimizationResult, buildOptimizationRequest, createOptimizationSnapshot, QUICK_OPTIMIZATION_REQUIREMENTS, restoreOptimizationSnapshot, toSingleResultStorage } from "@/lib/message/optimization";
import { messageOptimizationRequestSchema } from "@/lib/message/volcengine";
import type { Customer, CustomerAnalysis, MessageContent, MessageVersion } from "@/types";

const customer: Customer = { id: "c", name: "Ada", title: "Engineer", companyName: "Example", country: "", industry: "manufacturing", customerType: "终端工厂" };
const analysis: CustomerAnalysis = { mainBusiness: "", decisionInfluence: "无法判断", potentialApplications: "", recommendedAngle: "", completeness: 0, uncertainties: "", conflicts: [], evidence: [], inferences: [] };
const content: MessageContent = {
  identityAnalysis: "protected analysis", businessConnection: "protected connection", recommendedAngle: "protected angle",
  invitationEn: "Original English", firstMessageEn: "Second English", invitationZh: "原中文", firstMessageZh: "第二段中文",
  personalizationBasis: "protected basis", uncertaintyNotice: "protected notice",
  messages: [
    { id: "linkedin-request", title: "邀请", titleEn: "Invitation", english: "Original English", chinese: "原中文" },
    { id: "linkedin-first-message", title: "消息", titleEn: "Message", english: "Second English", chinese: "第二段中文" },
  ],
};

test("自定义修改要求会明确进入优化请求", () => {
  const request = buildOptimizationRequest(content, "LinkedIn", customer, analysis, "Please make the opening warmer.");
  assert.match(request.requirement, /opening warmer/);
});

test("三个快捷优化要求都会明确进入请求", () => {
  for (const label of ["更简短", "更自然", "更专业"] as const) {
    const request = buildOptimizationRequest(content, "LinkedIn", customer, analysis, "", label);
    assert.equal(request.requirement, QUICK_OPTIMIZATION_REQUIREMENTS[label]);
  }
});

test("优化成功只覆盖可发送文案并保护分析字段", () => {
  const updated = applyOptimizationResult(content, "LinkedIn", { messages: [
    { id: "linkedin-request", english: "Optimized English", chinese: "优化中文" },
    { id: "linkedin-first-message", english: "Optimized second", chinese: "优化第二段" },
  ] });
  assert.equal(updated.messages?.[0]?.english, "Optimized English");
  assert.equal(updated.messages?.[0]?.chinese, "优化中文");
  assert.equal(updated.identityAnalysis, content.identityAnalysis);
  assert.equal(updated.businessConnection, content.businessConnection);
  assert.equal(updated.personalizationBasis, content.personalizationBasis);
});

test("API失败没有结果时原文案保持不变", () => {
  assert.equal(applyOptimizationResult(content, "LinkedIn", undefined), content);
});

test("保存优化结果不会产生历史版本", () => {
  const result = { id: "current", label: "当前结果", createdAt: "now", reason: "AI优化", content } satisfies MessageVersion;
  const storage = toSingleResultStorage(result);
  assert.equal(storage.versions.length, 1);
  assert.equal(storage.selectedVersionId, "current");
});

test("轻量撤销恢复优化前的英文和中文", () => {
  const snapshot = createOptimizationSnapshot(content);
  const optimized = applyOptimizationResult(content, "LinkedIn", { messages: [
    { id: "linkedin-request", english: "Changed", chinese: "已改变" },
    { id: "linkedin-first-message", english: "Changed second", chinese: "第二段已改变" },
  ] });
  assert.notEqual(optimized.messages?.[0]?.english, snapshot.messages?.[0]?.english);
  const restored = restoreOptimizationSnapshot(snapshot);
  assert.equal(restored.messages?.[0]?.english, "Original English");
  assert.equal(restored.messages?.[0]?.chinese, "原中文");
});

test("优化请求不包含截图、文件或Base64数据", () => {
  const request = buildOptimizationRequest(content, "LinkedIn", customer, analysis, "更自然");
  const serialized = JSON.stringify(request);
  assert.equal("images" in request, false);
  assert.doesNotMatch(serialized, /image_url|base64|data:image|previewUrl|file/i);
  assert.equal(messageOptimizationRequestSchema.safeParse({ ...request, images: ["forbidden"] }).success, false);
});
