import assert from "node:assert/strict";
import test from "node:test";
import { ANALYSIS_DETAILS_DEFAULT_OPEN, countAnalysisVerificationItems } from "@/components/task/analysis-details";
import type { CustomerAnalysis, MessageContent } from "@/types";

const draft: MessageContent = {
  identityAnalysis: "", businessConnection: "", recommendedAngle: "", invitationEn: "", firstMessageEn: "", invitationZh: "", firstMessageZh: "", personalizationBasis: "", uncertaintyNotice: "需要确认当前用气量；需要确认采购时间",
};
const analysis: CustomerAnalysis = {
  mainBusiness: "", decisionInfluence: "无法判断", potentialApplications: "", recommendedAngle: "", completeness: 50, uncertainties: "", conflicts: [], evidence: [],
};

test("折叠标题显示需要核实的信息数量", () => {
  assert.equal(ANALYSIS_DETAILS_DEFAULT_OPEN, false);
  assert.equal(countAnalysisVerificationItems(analysis, draft), 2);
});

test("没有不确定信息时不显示数量", () => {
  assert.equal(countAnalysisVerificationItems(analysis, { ...draft, uncertaintyNotice: "暂无" }), 0);
});
