import assert from "node:assert/strict";
import test from "node:test";
import { buildFollowUpGenerationRequest } from "@/lib/follow-up/context";
import { FOLLOW_UP_SYSTEM_PROMPT, followUpGenerationResponseSchema, validateFollowUpBusinessSafety } from "@/lib/follow-up/volcengine";
import { isSafeConnectionInvitation, isSafeFirstOutreach } from "@/lib/message/quality";
import { createMessageContent } from "@/lib/mock/generator";
import { defaultConfig } from "@/lib/mock/defaults";
import { parseModelOutput } from "@/lib/vision/schema";
import type { Customer, CustomerAnalysis, CustomerType, CustomerTypeCode, FollowUpGenerationRequest, FollowUpGenerationResponse, StructuredField, Task } from "@/types";

const labels: Record<CustomerTypeCode, CustomerType> = {
  distributor: "经销商", agent: "代理商", end_user_factory: "终端工厂", system_integrator: "系统集成商/工程公司",
  service_provider: "服务商", trader: "贸易商", manufacturer_competitor: "制造商/同行", industry_contact: "行业联系人", unknown: "无法判断",
};
const field = <T extends string>(value: T | null, source: StructuredField<T>["source"] = value ? "screenshot" : "unknown"): StructuredField<T> => ({
  value, source, evidence: value ? `Synthetic evidence: ${value}` : "Not provided", confidence: value ? "high" : "low", needsReview: !value,
});

function fixture(type: CustomerTypeCode, industry = "industrial equipment") {
  const customer: Customer = { id: `customer-${type}`, name: "Case Contact", title: "Business Contact", companyName: "Example Industrial", country: "", industry, customerType: labels[type] };
  const analysis: CustomerAnalysis = {
    mainBusiness: industry, decisionInfluence: "无法判断", potentialApplications: "", recommendedAngle: "", completeness: 70,
    uncertainties: "Current requirement is not confirmed", conflicts: [], evidence: [], confirmedFacts: [`Works in ${industry}`], reasonableInferences: [], unknownInformation: ["Current requirement"],
    structuredFields: {
      customerName: field(customer.name), jobTitle: field(customer.title), companyName: field(customer.companyName), countryOrRegion: field(null), industry: field(industry), customerType: field(type), otherImportantInformation: [],
    },
    companyBusinessField: field(industry), inferences: [],
  };
  return { customer, analysis };
}

function linkedIn(type: CustomerTypeCode, industry?: string) {
  const { customer, analysis } = fixture(type, industry);
  return createMessageContent(customer, analysis, { ...defaultConfig, channel: "LinkedIn", customerType: labels[type] });
}

function followUpRequest(latestCustomerReply: string, messages: FollowUpGenerationRequest["messages"] = []): FollowUpGenerationRequest {
  return {
    taskId: "task-quality", customer: fixture("end_user_factory").customer,
    analysis: { mainBusiness: "Food factory", decisionInfluence: "无法判断", potentialApplications: "Oil-free air", recommendedAngle: "Confirm application", uncertainties: "", conflicts: [], confirmedFacts: [], reasonableInferences: [], unknownInformation: [] },
    currentOutreach: "Unsaved draft reference", followUpStage: "replied", replyGoal: "回答问题", customReplyGoal: "", tone: "专业", businessFacts: "", messages, latestCustomerReply,
  };
}

const safeResult = (overrides: Partial<FollowUpGenerationResponse> = {}): FollowUpGenerationResponse => ({
  replyEnglish: "Thank you for the question. I need to confirm the exact details with our responsible team before giving you a precise answer.",
  replyChinese: "感谢您的问题。我需要先与相关团队确认准确细节，再给您明确答复。", customerIntent: "Requests specific information", nextAction: "Verify internally",
  missingInformation: ["Verified commercial or technical detail"], riskWarnings: ["Do not make an unverified commitment"],
  safeTransitionReplyEnglish: "I will verify the exact details and come back with a precise answer.", safeTransitionReplyChinese: "我会核实准确细节后再给您明确答复。", ...overrides,
});

test("明确的空压机经销商采用市场、产品范围和服务能力策略", () => {
  const content = linkedIn("distributor");
  assert.match(content.firstMessageEn, /local market focus|product scope|supports customers/i);
  assert.doesNotMatch(content.firstMessageEn, /exclusive rights|authorized distributor/i);
});

test("食品工厂询问无油空压机时不使用代理合作话术", () => {
  const { customer, analysis } = fixture("end_user_factory", "food manufacturing");
  const content = createMessageContent(customer, analysis, { ...defaultConfig, channel: "LinkedIn", customerType: "终端工厂", product: "无油空压机" });
  assert.match(content.firstMessageEn, /pressure|required flow|air-quality/i);
  assert.doesNotMatch(content.firstMessageEn, /distributor|agency|local market/i);
});

test("工程公司收到项目技术选型与系统配置策略", () => {
  const content = linkedIn("system_integrator", "engineering projects");
  assert.match(content.firstMessageEn, /specification matching|system configuration|technical/i);
  assert.doesNotMatch(content.firstMessageEn, /distribution relationship.*assume/i);
});

test("维修服务商策略覆盖服务区域、品牌、备件或技术支持", () => {
  const content = linkedIn("service_provider", "compressor maintenance");
  assert.match(content.firstMessageEn, /area you cover|brands|spare parts|technical support/i);
});

test("同行或竞争品牌从业者收到行业交流而非强推销模板", () => {
  const content = linkedIn("manufacturer_competitor", "air-compressor manufacturing");
  assert.match(content.firstMessageEn, /industry exchange|not a standard sales pitch/i);
  assert.doesNotMatch(content.firstMessageEn, /buy|lowest price|product range/i);
});

test("身份不明确的联系人保持 Unknown 并只询问业务身份", () => {
  const content = linkedIn("unknown");
  assert.match(content.identityAnalysis, /客户类型：unknown/);
  assert.match(content.firstMessageEn, /buyer, distributor, or project partner/);
  assert.equal((content.firstMessageEn.match(/\?/g) || []).length, 1);
});

test("基础识图之后的文案阶段仍使用客户类型和事实分类", () => {
  const content = linkedIn("service_provider", "compressor maintenance");
  assert.match(content.identityAnalysis, /客户类型：service_provider/);
  assert.match(content.identityAnalysis, /已确认事实：Works in compressor maintenance/);
  assert.match(content.recommendedAngle, /服务区域|备件|技术支持/);
});

test("所有代表类型的连接邀请和首次开发信满足长度质量门", () => {
  for (const type of Object.keys(labels) as CustomerTypeCode[]) {
    const content = linkedIn(type);
    assert.equal(isSafeConnectionInvitation(content.invitationEn), true, `${type} invitation: ${content.invitationEn.length}`);
    assert.equal(isSafeFirstOutreach(content.firstMessageEn), true, `${type} first outreach`);
  }
});

test("客户询价但缺少参数时必须返回缺失信息和风险", () => {
  const request = followUpRequest("What is your price for this compressor?");
  assert.equal(validateFollowUpBusinessSafety(request, safeResult({ missingInformation: [], riskWarnings: [] })), false);
  assert.equal(validateFollowUpBusinessSafety(request, safeResult()), true);
});

test("认证未知时不得无风险地声称已经具备", () => {
  const request = followUpRequest("Is this product certified for our market?");
  assert.equal(validateFollowUpBusinessSafety(request, safeResult({ replyEnglish: "Yes, it is certified.", missingInformation: [], riskWarnings: [] })), false);
});

test("独家代理承诺被结构化输出校验拒绝", () => {
  const result = safeResult({ replyEnglish: "We guarantee exclusive rights for your market." });
  assert.equal(followUpGenerationResponseSchema.safeParse(result).success, false);
});

test("客户暂时无需求时提示词要求低压力回应而非立即推销", () => {
  assert.match(FOLLOW_UP_SYSTEM_PROMPT, /no current need/i);
  assert.match(FOLLOW_UP_SYSTEM_PROMPT, /without pressure|low-pressure/i);
});

test("客户已提供压力和排气量后禁止重复询问", () => {
  const messages: FollowUpGenerationRequest["messages"] = [{ id: "m1", taskId: "task-quality", role: "customer", platform: "linkedin", content: "We need 8 bar and 12 m3/min.", createdAt: "2026-08-13T00:00:00.000Z" }];
  const request = followUpRequest("What else do you need?", messages);
  assert.equal(validateFollowUpBusinessSafety(request, safeResult({ replyEnglish: "What pressure and flow do you need?" })), false);
  assert.equal(validateFollowUpBusinessSafety(request, safeResult({ replyEnglish: "Could you confirm the required voltage?" })), true);
});

test("两个任务的数据隔离与最近二十条边界保持有效", () => {
  const { customer, analysis } = fixture("end_user_factory");
  const makeTask = (id: string): Task => ({ id, customer: { ...customer, id: `customer-${id}` }, analysis, analysisSource: "volcengine", images: [], config: { ...defaultConfig }, versions: [], selectedVersionId: "", createdAt: "", updatedAt: "", status: "已回复", followUpDate: "", notes: "", followUps: [], conversationMessages: Array.from({ length: 21 }, (_, index) => ({ id: `${id}-${index}`, taskId: id, role: "customer", platform: "linkedin", content: `${id} message ${index}`, createdAt: `2026-08-13T00:${String(index).padStart(2, "0")}:00.000Z` })), followUpGenerations: [], followUpStage: "replied", lastContactAt: "" });
  const requestA = buildFollowUpGenerationRequest(makeTask("task-a"), { replyGoal: "回答问题", customReplyGoal: "", tone: "专业", businessFacts: "" });
  assert.equal(requestA.messages.length, 20);
  assert.ok(requestA.messages.every(message => message.taskId === "task-a" && !message.content.includes("task-b")));
});

test("视觉结构化输出区分事实、推断和未知信息并拒绝非法类型", () => {
  const parsed = parseModelOutput(JSON.stringify({ confirmedFacts: ["Company page shows maintenance services"], reasonableInferences: ["May support industrial users"], unknownInformation: ["Current compressor brands"], customer: { companyName: { value: "Synthetic Service Company", source: "screenshot", evidence: "Synthetic Service Company", confidence: "high" }, customerType: { value: "dealer_by_title_only", source: "inference" } } }));
  assert.deepEqual(parsed.confirmedFacts, ["Company page shows maintenance services"]);
  assert.deepEqual(parsed.reasonableInferences, ["May support industrial users"]);
  assert.deepEqual(parsed.unknownInformation, ["Current compressor brands"]);
  assert.equal(parsed.customer.customerType.value, null);
});

test("旧任务中的 oem_integrator 仍按系统集成策略生成", () => {
  const { customer, analysis } = fixture("system_integrator", "engineering projects");
  analysis.structuredFields!.customerType = { ...analysis.structuredFields!.customerType, value: "oem_integrator" as CustomerTypeCode };
  const content = createMessageContent({ ...customer, customerType: "设备集成商" }, analysis, { ...defaultConfig, channel: "LinkedIn", customerType: "设备集成商" });
  assert.match(content.firstMessageEn, /specification matching|system configuration/i);
});
