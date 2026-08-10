import { getChannelMessages } from "@/lib/message/channel-messages";
import type { Channel, Customer, CustomerAnalysis, MessageContent, MessageOptimizationRequest, MessageOptimizationResponse, MessageVersion, StructuredField } from "@/types";

export const QUICK_OPTIMIZATION_REQUIREMENTS = {
  "更简短": "在保留关键信息和自然语气的前提下，让当前文案更简短。",
  "更自然": "让当前文案更自然、更像真实商务沟通，避免模板化表达。",
  "更专业": "让当前文案更专业、准确、克制，同时保持友好。",
} as const;

export type QuickOptimizationLabel = keyof typeof QUICK_OPTIMIZATION_REQUIREMENTS;

function confirmedValue(value: string, field: StructuredField | undefined) {
  return field?.value && field.source === "screenshot" && field.confidence !== "low" && !field.needsReview ? value.trim() : "";
}

export function buildCustomerSummary(customer: Customer, analysis: CustomerAnalysis) {
  const fields = analysis.structuredFields;
  const parts = [
    confirmedValue(customer.name, fields?.customerName) && `Name: ${confirmedValue(customer.name, fields?.customerName)}`,
    confirmedValue(customer.title, fields?.jobTitle) && `Role: ${confirmedValue(customer.title, fields?.jobTitle)}`,
    confirmedValue(customer.companyName, fields?.companyName) && `Company: ${confirmedValue(customer.companyName, fields?.companyName)}`,
    confirmedValue(customer.industry, fields?.industry) && `Industry: ${confirmedValue(customer.industry, fields?.industry)}`,
    fields?.customerType.value && fields.customerType.source === "screenshot" && fields.customerType.confidence !== "low" && !fields.customerType.needsReview && `Customer type: ${fields.customerType.value}`,
  ].filter(Boolean);
  return parts.length ? parts.join("; ") : "No confirmed customer facts are available. Keep the copy generic and cautious.";
}

export function combineOptimizationRequirement(customRequirement: string, quickRequirement?: QuickOptimizationLabel) {
  return [quickRequirement ? QUICK_OPTIMIZATION_REQUIREMENTS[quickRequirement] : "", customRequirement.trim()].filter(Boolean).join("\n");
}

export function buildOptimizationRequest(
  content: MessageContent,
  channel: Channel,
  customer: Customer,
  analysis: CustomerAnalysis,
  customRequirement: string,
  quickRequirement?: QuickOptimizationLabel,
): MessageOptimizationRequest {
  return {
    channel,
    messages: getChannelMessages(content, channel).map(({ id, english, chinese }) => ({ id, english, chinese })),
    customerSummary: buildCustomerSummary(customer, analysis),
    requirement: combineOptimizationRequirement(customRequirement, quickRequirement),
  };
}

export function applyOptimizationResult(content: MessageContent, channel: Channel, response?: MessageOptimizationResponse) {
  if (!response) return content;
  const current = getChannelMessages(content, channel);
  if (response.messages.length !== current.length) throw new Error("OPTIMIZATION_MESSAGE_COUNT_MISMATCH");
  const optimized = current.map(message => {
    const replacement = response.messages.find(item => item.id === message.id);
    if (!replacement?.english.trim() || !replacement.chinese.trim()) throw new Error("OPTIMIZATION_MESSAGE_INVALID");
    return { ...message, english: replacement.english.trim(), chinese: replacement.chinese.trim() };
  });
  return {
    ...content,
    messages: optimized,
    invitationEn: optimized[0]?.english || content.invitationEn,
    invitationZh: optimized[0]?.chinese || content.invitationZh,
    firstMessageEn: optimized[1]?.english || content.firstMessageEn,
    firstMessageZh: optimized[1]?.chinese || content.firstMessageZh,
  };
}

export function createOptimizationSnapshot(content: MessageContent): MessageContent {
  return { ...content, messages: content.messages?.map(message => ({ ...message })) };
}

export function restoreOptimizationSnapshot(snapshot: MessageContent): MessageContent {
  return createOptimizationSnapshot(snapshot);
}

export function toSingleResultStorage(result: MessageVersion | null) {
  return { versions: result ? [result] : [], selectedVersionId: result?.id || "" };
}
