import assert from "node:assert/strict";
import test from "node:test";
import { countEnglishWords, createMessageContent } from "@/lib/mock/generator";
import { defaultConfig } from "@/lib/mock/defaults";
import type { Customer, CustomerAnalysis, CustomerStructuredFields, StructuredField } from "@/types";

const field = (value: string | null, confidence: "high" | "medium" | "low" = "high", needsReview = false): StructuredField => ({
  value, source: value ? "screenshot" : "unknown", evidence: value ? `Visible text: ${value}` : "Not visible", confidence, needsReview,
});
const structuredFields: CustomerStructuredFields = {
  customerName: field("Alex Morgan"), jobTitle: field("Engineering Manager"), companyName: field("Partial Industr...", "low", true),
  countryOrRegion: field(null, "low", true), industry: field("industrial manufacturing"),
  customerType: { value: "end_user_factory", source: "screenshot", evidence: "Manufacturing facility", confidence: "high", needsReview: false },
  otherImportantInformation: [],
};
const customer: Customer = { id: "c", name: "Alex Morgan", title: "Engineering Manager", companyName: "Partial Industr...", country: "", industry: "industrial manufacturing", customerType: "终端工厂" };
const analysis: CustomerAnalysis = {
  mainBusiness: "manufacturing", decisionInfluence: "无法判断", potentialApplications: "", recommendedAngle: "先确认实际用气需求",
  completeness: 60, uncertainties: "公司名称需要确认", conflicts: [], evidence: [], structuredFields,
  companyBusinessField: field("manufacturing"), inferences: [],
};

test("开发信不声称客户正在采购，也不使用低置信度公司名", () => {
  const content = createMessageContent(customer, analysis, { ...defaultConfig, channel: "Email" });
  const body = content.messages?.find(item => item.id === "email-body")?.english || "";
  assert.doesNotMatch(body, /looking for|noticed you need|are purchasing/i);
  assert.doesNotMatch(body, /Partial Industr/i);
});

test("安全回退英文开发信正文保持在 80 到 160 词", () => {
  const content = createMessageContent(customer, analysis, { ...defaultConfig, channel: "Email" });
  const body = content.messages?.find(item => item.id === "email-body")?.english || "";
  assert.ok(countEnglishWords(body) >= 80 && countEnglishWords(body) <= 160, `word count: ${countEnglishWords(body)}`);
});

test("英文和中文开发信结构均可生成", () => {
  const content = createMessageContent(customer, analysis, { ...defaultConfig, channel: "Email" });
  const body = content.messages?.find(item => item.id === "email-body");
  assert.ok(body?.english);
  assert.ok(body?.chinese);
});
