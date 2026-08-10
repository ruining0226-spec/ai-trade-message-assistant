import assert from "node:assert/strict";
import test from "node:test";
import { applyManualConfirmation, CONFIRMATION_NEXT_STEP, CUSTOMER_DETAILS_DEFAULT_OPEN, FULL_DETAIL_EDITABLE_FIELDS, getConfirmationRisks, getConfirmationStatus, getCustomerSummary, setConfirmationUnknown } from "@/lib/customer/confirmation";
import { createMessageContent } from "@/lib/mock/generator";
import { defaultConfig } from "@/lib/mock/defaults";
import type { Customer, CustomerAnalysis, CustomerStructuredFields, StructuredField } from "@/types";

const field = (value: string | null, confidence: "high" | "medium" | "low" = "high", needsReview = false): StructuredField => ({
  value, source: value ? "screenshot" : "unknown", evidence: value ? `Visible: ${value}` : "Not visible", confidence, needsReview,
});
const makeFields = (overrides: Partial<CustomerStructuredFields> = {}): CustomerStructuredFields => ({
  customerName: field("Ada Lovelace"), jobTitle: field("Engineer"), companyName: field("Example Ltd"),
  countryOrRegion: field("United Kingdom"), industry: field("Manufacturing"),
  customerType: { value: "end_user_factory", source: "screenshot", evidence: "Factory", confidence: "high", needsReview: false },
  otherImportantInformation: [], ...overrides,
});
const customer: Customer = { id: "c", name: "Ada Lovelace", title: "Engineer", companyName: "Example Ltd", country: "United Kingdom", industry: "Manufacturing", customerType: "终端工厂" };
const makeAnalysis = (structuredFields?: CustomerStructuredFields): CustomerAnalysis => ({
  mainBusiness: "Industrial manufacturing", decisionInfluence: "无法判断", potentialApplications: "", recommendedAngle: "从运行稳定性和实际用气需求切入",
  completeness: 80, uncertainties: "", conflicts: [], evidence: [], structuredFields, inferences: [],
});

test("高置信度关键信息只进入摘要，不进入需要确认列表", () => {
  const analysis = makeAnalysis(makeFields());
  assert.deepEqual(getConfirmationRisks(customer, analysis), []);
  assert.equal(getCustomerSummary(customer, analysis).name, "Ada Lovelace");
});

test("重要的中低置信度字段进入需要确认区域", () => {
  const analysis = makeAnalysis(makeFields({ customerName: field("Ada Lovelace", "medium", true), companyName: field("Example...", "low", true) }));
  const risks = getConfirmationRisks({ ...customer, companyName: "Example..." }, analysis);
  assert.deepEqual(risks.map(item => item.key), ["name", "companyName"]);
});

test("没有风险字段时可以直接继续", () => {
  const risks = getConfirmationRisks(customer, makeAnalysis(makeFields()));
  assert.deepEqual(getConfirmationStatus(customer, risks), { label: "资料充足，可以生成开发信", canContinue: true });
});

test("保留当前内容通过会话内已处理集合消除提示且不改变值", () => {
  const analysis = makeAnalysis(makeFields({ customerName: field("Ada Lovelace", "medium", true) }));
  const resolved = new Set(["name"] as const);
  assert.equal(getConfirmationRisks(customer, analysis, resolved).some(item => item.key === "name"), false);
  assert.equal(customer.name, "Ada Lovelace");
});

test("设为未知后清除原值并且开发信不再使用旧称呼", () => {
  const analysis = { ...makeAnalysis(makeFields({ customerName: field("Wrong Name", "low", true) })), generatedOutreach: { subjectEn: "Hello", subjectZh: "您好", bodyEn: "Dear Wrong Name, this is an intentionally unsafe old generated message that should never be reused after the user marks the name unknown. It contains enough words only for the test fixture and repeats the incorrect customer name in a definite greeting while adding several neutral sentences about future communication and general industrial applications without making a purchase claim.", bodyZh: "错误称呼" } };
  const next = setConfirmationUnknown({ ...customer, name: "Wrong Name" }, analysis, "name");
  assert.equal(next.customer.name, "");
  assert.equal(next.analysis.structuredFields?.customerName.source, "unknown");
  assert.equal(next.analysis.generatedOutreach, undefined);
  const content = createMessageContent(next.customer, next.analysis, { ...defaultConfig, channel: "Email" });
  assert.doesNotMatch(content.messages?.find(item => item.id === "email-body")?.english || "", /Wrong Name/);
});

test("手动修改后客户状态和生成输入使用新值", () => {
  const analysis = makeAnalysis(makeFields({ customerName: field("Ada...", "low", true) }));
  const next = applyManualConfirmation({ ...customer, name: "Ada..." }, analysis, "name", "Grace Hopper");
  assert.equal(next.customer.name, "Grace Hopper");
  assert.equal(next.analysis.structuredFields?.customerName.needsReview, false);
  const content = createMessageContent(next.customer, next.analysis, { ...defaultConfig, channel: "Email" });
  assert.match(content.messages?.find(item => item.id === "email-body")?.english || "", /Dear Grace/);
});

test("详细信息默认折叠且保留原有关键编辑字段", () => {
  assert.equal(CUSTOMER_DETAILS_DEFAULT_OPEN, false);
  assert.deepEqual(FULL_DETAIL_EDITABLE_FIELDS, ["name", "title", "companyName", "country", "industry", "customerType"]);
});

test("旧任务没有结构化字段时仍可生成摘要和继续", () => {
  const analysis = makeAnalysis(undefined);
  assert.equal(getCustomerSummary(customer, analysis).companyAndRegion, "Example Ltd · United Kingdom");
  assert.equal(getConfirmationStatus(customer, getConfirmationRisks(customer, analysis)).canContinue, true);
});

test("确认辅助逻辑是同步本地计算，不触发AI请求", () => {
  const result = getCustomerSummary(customer, makeAnalysis(makeFields()));
  assert.equal(result instanceof Promise, false);
});

test("确认按钮继续进入原有步骤三流程", () => {
  assert.equal(CONFIRMATION_NEXT_STEP, 3);
});
