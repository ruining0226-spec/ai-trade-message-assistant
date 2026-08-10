import type { Customer, CustomerAnalysis, CustomerType, CustomerTypeCode, StructuredField } from "@/types";

export type ConfirmationFieldKey = "name" | "title" | "companyName" | "country" | "industry" | "customerType";

export interface ConfirmationRisk {
  key: ConfirmationFieldKey;
  label: string;
  value: string;
  reason: string;
}

export const CUSTOMER_DETAILS_DEFAULT_OPEN = false;
export const CONFIRMATION_NEXT_STEP = 3;
export const FULL_DETAIL_EDITABLE_FIELDS: ConfirmationFieldKey[] = ["name", "title", "companyName", "country", "industry", "customerType"];

const definitions: Array<{ key: ConfirmationFieldKey; label: string; impact: string }> = [
  { key: "name", label: "客户姓名", impact: "会影响开发信称呼" },
  { key: "title", label: "职位", impact: "会影响客户身份判断" },
  { key: "companyName", label: "公司名称", impact: "会影响公司称呼和个性化表达" },
  { key: "country", label: "国家或地区", impact: "可能影响沟通语境" },
  { key: "industry", label: "行业", impact: "会影响沟通切入方向" },
  { key: "customerType", label: "客户类型", impact: "会直接影响推荐沟通方向" },
];

const metadataKeys = {
  name: "customerName",
  title: "jobTitle",
  companyName: "companyName",
  country: "countryOrRegion",
  industry: "industry",
  customerType: "customerType",
} as const;

const customerTypeCodes: Record<CustomerType, CustomerTypeCode> = {
  经销商: "distributor", 代理商: "agent", 终端工厂: "end_user_factory", 设备集成商: "oem_integrator",
  工程项目方: "oem_integrator", 服务商: "service_provider", 其他: "unknown", 无法判断: "unknown",
};

function fieldFor(analysis: CustomerAnalysis, key: ConfirmationFieldKey): StructuredField<string> | undefined {
  return analysis.structuredFields?.[metadataKeys[key]] as StructuredField<string> | undefined;
}

function displayValue(customer: Customer, key: ConfirmationFieldKey) {
  const value = customer[key];
  return typeof value === "string" && value.trim() ? value.trim() : "未识别";
}

function isUnknownCustomerType(customer: Customer) {
  return customer.customerType === "无法判断" || customer.customerType === "其他";
}

export function getConfirmationRisks(customer: Customer, analysis: CustomerAnalysis, resolved: ReadonlySet<ConfirmationFieldKey> = new Set()) {
  return definitions.flatMap<ConfirmationRisk>(definition => {
    if (resolved.has(definition.key)) return [];
    const field = fieldFor(analysis, definition.key);
    const value = displayValue(customer, definition.key);
    const missing = value === "未识别" || definition.key === "customerType" && isUnknownCustomerType(customer);
    if (!field) {
      return missing ? [{ key: definition.key, label: definition.label, value, reason: `旧任务缺少该字段的可靠信息，${definition.impact}。` }] : [];
    }
    const risky = missing || field.needsReview || field.confidence !== "high" || field.source !== "screenshot";
    if (!risky) return [];
    const reason = missing
      ? `当前无法确认，${definition.impact}。`
      : `${field.confidence === "medium" ? "中等" : field.confidence === "low" ? "较低" : "待核对"}置信度，${definition.impact}。`;
    return [{ key: definition.key, label: definition.label, value, reason }];
  });
}

export function getConfirmationStatus(customer: Customer, risks: ConfirmationRisk[]) {
  const hasMinimumContext = Boolean(customer.name.trim() || customer.title.trim() || customer.companyName.trim() || customer.industry.trim());
  if (!hasMinimumContext) return { label: "缺少必要信息，请先补充", canContinue: false } as const;
  if (risks.length) return { label: "部分关键信息需要确认", canContinue: true } as const;
  return { label: "资料充足，可以生成开发信", canContinue: true } as const;
}

export function setConfirmationUnknown(customer: Customer, analysis: CustomerAnalysis, key: ConfirmationFieldKey) {
  const nextCustomer = { ...customer, [key]: key === "customerType" ? "无法判断" : "" } as Customer;
  if (!analysis.structuredFields) return { customer: nextCustomer, analysis: { ...analysis, generatedOutreach: undefined } };
  const metadataKey = metadataKeys[key];
  const nextField = {
    value: key === "customerType" ? "unknown" : null,
    source: "unknown",
    evidence: "用户在快速确认步骤中设为未知。",
    confidence: "low",
    needsReview: false,
  } as StructuredField<string>;
  return {
    customer: nextCustomer,
    analysis: { ...analysis, generatedOutreach: undefined, structuredFields: { ...analysis.structuredFields, [metadataKey]: nextField } },
  };
}

export function applyManualConfirmation(customer: Customer, analysis: CustomerAnalysis, key: ConfirmationFieldKey, value: string) {
  const normalized = value.trim();
  const nextCustomer = { ...customer, [key]: key === "customerType" ? normalized as CustomerType : normalized } as Customer;
  if (!analysis.structuredFields) return { customer: nextCustomer, analysis: { ...analysis, generatedOutreach: undefined } };
  const metadataKey = metadataKeys[key];
  const previous = fieldFor(analysis, key);
  const nextField = {
    value: key === "customerType" ? customerTypeCodes[nextCustomer.customerType] : normalized || null,
    source: previous?.source || "unknown",
    evidence: `用户人工修改并确认。${previous?.evidence ? ` 原依据：${previous.evidence}` : ""}`,
    confidence: normalized ? "high" : "low",
    needsReview: !normalized,
  } as StructuredField<string>;
  return {
    customer: nextCustomer,
    analysis: { ...analysis, generatedOutreach: undefined, structuredFields: { ...analysis.structuredFields, [metadataKey]: nextField } },
  };
}

export function getCustomerSummary(customer: Customer, analysis: CustomerAnalysis) {
  return {
    name: customer.name.trim() || "客户姓名待确认",
    role: customer.title.trim() || analysis.mainBusiness.trim() || customer.industry.trim() || "业务描述待确认",
    companyAndRegion: [customer.companyName.trim() || "公司名称待确认", customer.country.trim()].filter(Boolean).join(" · "),
    customerType: customer.customerType,
    direction: analysis.recommendedAngle.trim() || "先进行简短介绍，再确认对方是否愿意了解相关产品与合作。",
  };
}
