import assert from "node:assert/strict";
import test from "node:test";
import { normalizeTask } from "@/lib/storage/repository";
import type { Task } from "@/types";

test("旧任务缺少分析来源和新增视觉字段时仍可打开", () => {
  const legacy = {
    id: "old", customer: { id: "c", name: "A", title: "B", companyName: "C", country: "", industry: "", customerType: "设备集成商" },
    analysis: { mainBusiness: "", decisionInfluence: "高 — 旧说明", potentialApplications: "", recommendedAngle: "", completeness: 50, uncertainties: "" },
    images: [], config: { channel: "LinkedIn" }, versions: [], selectedVersionId: "", createdAt: "", updatedAt: "", status: "待确认", followUpDate: "", notes: "", followUps: [],
    followUpContext: { stage: "connected", objective: "legacy", tone: "legacy", additionalFacts: "", messages: [{ id: "legacy-message", taskId: "old", role: "sales", platform: "linkedin", content: "Legacy sent message", createdAt: "2026-08-10T00:00:00.000Z" }] },
  } as unknown as Task;
  const normalized = normalizeTask(legacy);
  assert.equal(normalized.analysisSource, "legacy");
  assert.equal(normalized.analysis.decisionInfluence, "无法判断");
  assert.deepEqual(normalized.analysis.evidence, []);
  assert.deepEqual(normalized.analysis.confirmedFacts, []);
  assert.deepEqual(normalized.analysis.reasonableInferences, []);
  assert.deepEqual(normalized.analysis.unknownInformation, []);
  assert.equal(normalized.analysis.structuredFields, undefined);
  assert.equal(normalized.followUpStage, "connected");
  assert.equal(normalized.conversationMessages[0]?.role, "salesperson");
  assert.equal(normalized.conversationMessages[0]?.taskId, "old");
  assert.deepEqual(normalized.followUpGenerations, []);
  assert.equal(normalized.lastContactAt, "2026-08-10T00:00:00.000Z");
});

test("旧多版本任务只保留原来选中的当前结果", () => {
  const base = {
    customer: { id: "c", name: "A", title: "B", companyName: "C", country: "", industry: "", customerType: "设备集成商" },
    analysis: { mainBusiness: "", decisionInfluence: "无法判断", potentialApplications: "", recommendedAngle: "", completeness: 50, uncertainties: "", conflicts: [], evidence: [] },
    images: [], config: { channel: "Email" }, createdAt: "", updatedAt: "", status: "已生成", followUpDate: "", notes: "", followUps: [],
  };
  const content = { identityAnalysis: "", businessConnection: "", recommendedAngle: "", invitationEn: "", firstMessageEn: "", invitationZh: "", firstMessageZh: "", personalizationBasis: "", uncertaintyNotice: "" };
  const legacy = {
    ...base, id: "old-with-history", selectedVersionId: "v1",
    versions: [
      { id: "v1", label: "旧结果", createdAt: "1", reason: "初次生成", content: { ...content, identityAnalysis: "selected" } },
      { id: "v2", label: "新结果", createdAt: "2", reason: "重新生成", content: { ...content, identityAnalysis: "latest" } },
    ],
  } as unknown as Task;
  const normalized = normalizeTask(legacy);
  assert.equal(normalized.versions.length, 1);
  assert.equal(normalized.versions[0]?.id, "v1");
  assert.equal(normalized.versions[0]?.content.identityAnalysis, "selected");
  assert.equal(normalized.selectedVersionId, "v1");
});

test("旧任务找不到已选版本时回退到最新结果", () => {
  const legacy = {
    id: "fallback", customer: { id: "c", name: "A", title: "B", companyName: "C", country: "", industry: "", customerType: "设备集成商" },
    analysis: { mainBusiness: "", decisionInfluence: "无法判断", potentialApplications: "", recommendedAngle: "", completeness: 50, uncertainties: "", conflicts: [], evidence: [] },
    images: [], config: { channel: "LinkedIn" }, selectedVersionId: "missing", createdAt: "", updatedAt: "", status: "已生成", followUpDate: "", notes: "", followUps: [],
    versions: [
      { id: "v1", label: "", createdAt: "1", reason: "", content: { identityAnalysis: "old" } },
      { id: "v2", label: "", createdAt: "2", reason: "", content: { identityAnalysis: "latest" } },
    ],
  } as unknown as Task;
  const normalized = normalizeTask(legacy);
  assert.equal(normalized.versions[0]?.id, "v2");
  assert.equal(normalized.selectedVersionId, "v2");
});
