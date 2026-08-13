import { z } from "zod";
import type { Confidence, CustomerAnalysisResponse, CustomerTypeCode, DecisionInfluence, FieldSource, StructuredField } from "@/types";

const sources = ["screenshot", "inference", "unknown"] as const;
const confidenceLevels = ["high", "medium", "low"] as const;
const customerTypeCodes = ["distributor", "agent", "end_user_factory", "system_integrator", "service_provider", "trader", "manufacturer_competitor", "industry_contact", "unknown"] as const;
const influenceLevels = ["高", "中", "低", "无法判断"] as const;

type JsonExtractionMetadata = { hadCodeFence: boolean; hadSurroundingText: boolean; textLength: number; responseEmpty: boolean };
type ModelOutputDiagnostic = {
  extraction?: JsonExtractionMetadata;
  jsonError?: { category: "NO_JSON_START" | "UNTERMINATED_JSON" | "MISMATCHED_DELIMITER" | "JSON_PARSE_ERROR"; position?: number };
  topLevel?: Record<string, string>;
  issues?: Array<{ path: string; code: string; expected?: string }>;
};

const unknownField = <T,>(value: T | null = null): StructuredField<T> => ({
  value,
  source: "unknown",
  evidence: "截图中未找到足够证据。",
  confidence: "low",
  needsReview: true,
});

const truncationPattern = /截断|不完整|未显示完整|truncat|cut\s*off|incomplete|ellipsis/i;

export function normalizeStructuredField<T extends string>(
  input: Partial<StructuredField<T>> | undefined,
  options: { allowedValues?: readonly T[]; detectTruncation?: boolean } = {},
): StructuredField<T> {
  const value = typeof input?.value === "string" && input.value.trim() ? input.value.trim() as T : null;
  const allowedValue = !value || !options.allowedValues || options.allowedValues.includes(value);
  if (!value || !allowedValue) return unknownField<T>();

  const source: FieldSource = sources.includes(input?.source as typeof sources[number]) ? input?.source as FieldSource : "unknown";
  const evidence = typeof input?.evidence === "string" ? input.evidence.trim().slice(0, 500) : "";
  const confidence: Confidence = confidenceLevels.includes(input?.confidence as Confidence) ? input?.confidence as Confidence : "low";
  const truncated = Boolean(options.detectTruncation && (truncationPattern.test(evidence) || /(?:\.{3}|…|[\-–—])$/.test(value)));

  if (source === "unknown" || (source === "screenshot" && !evidence)) return unknownField<T>(value);
  return {
    value,
    source,
    evidence: evidence || "AI推测，缺少可直接引用的截图原文。",
    confidence: truncated ? "low" : confidence,
    needsReview: truncated || source !== "screenshot" || confidence !== "high" || Boolean(input?.needsReview),
  };
}

const customerTypeAliases: Record<string, CustomerTypeCode> = {
  distributor: "distributor", dealer: "distributor", 经销商: "distributor", 分销商: "distributor",
  agent: "agent", representative: "agent", 代理商: "agent", 代理: "agent",
  end_user_factory: "end_user_factory", end_user: "end_user_factory", factory: "end_user_factory", enduser: "end_user_factory", 终端工厂: "end_user_factory", 终端用户: "end_user_factory", 工厂: "end_user_factory",
  system_integrator: "system_integrator", oem_integrator: "system_integrator", integrator: "system_integrator", engineering_company: "system_integrator", 系统集成商: "system_integrator", 工程公司: "system_integrator", 设备集成商: "system_integrator", 工程项目方: "system_integrator",
  service_provider: "service_provider", maintenance_provider: "service_provider", service: "service_provider", 服务商: "service_provider", 维修服务商: "service_provider",
  trader: "trader", trading_company: "trader", 贸易商: "trader",
  manufacturer_competitor: "manufacturer_competitor", manufacturer: "manufacturer_competitor", competitor: "manufacturer_competitor", 制造商: "manufacturer_competitor", 同行: "manufacturer_competitor", 竞争对手: "manufacturer_competitor",
  industry_contact: "industry_contact", 行业联系人: "industry_contact",
  unknown: "unknown", other: "unknown", unclear: "unknown", 无法判断: "unknown", 未知: "unknown", 其他: "unknown",
};

function normalizeCustomerTypeValue(value: unknown): CustomerTypeCode | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const key = value.trim().toLowerCase().replace(/[\s/-]+/g, "_");
  return customerTypeAliases[key] || customerTypeAliases[value.trim().toLowerCase()] || null;
}

function normalizeRawField(value: unknown, customerType = false) {
  if (customerType && typeof value === "string") return { value: normalizeCustomerTypeValue(value), source: "inference", confidence: "low", needsReview: true };
  if (typeof value === "string") return { value: value.trim() || null, source: "inference", evidence: "", confidence: "low", needsReview: true };
  if (value == null) return undefined;
  if (typeof value !== "object" || Array.isArray(value)) return value;
  const field = value as Record<string, unknown>;
  const sourceText = typeof field.source === "string" ? field.source.trim().toLowerCase() : undefined;
  const confidenceText = typeof field.confidence === "string" ? field.confidence.trim().toLowerCase() : undefined;
  return {
    ...field,
    value: customerType ? normalizeCustomerTypeValue(field.value) : field.value,
    source: sourceText && sources.includes(sourceText as typeof sources[number]) ? sourceText : undefined,
    evidence: typeof field.evidence === "string" ? field.evidence : "",
    confidence: confidenceText && confidenceLevels.includes(confidenceText as Confidence) ? confidenceText : undefined,
    needsReview: typeof field.needsReview === "boolean" ? field.needsReview : undefined,
  };
}

const rawFieldObjectSchema = z.object({
  value: z.string().nullable().optional(),
  source: z.enum(sources).optional(),
  evidence: z.string().optional(),
  confidence: z.enum(confidenceLevels).optional(),
  needsReview: z.boolean().optional(),
}).optional();

const rawFieldSchema = z.preprocess(value => normalizeRawField(value), rawFieldObjectSchema);
const rawCustomerTypeFieldSchema = z.preprocess(value => normalizeRawField(value, true), rawFieldObjectSchema);

const stringField = (detectTruncation = false) => rawFieldSchema.transform(value => normalizeStructuredField(value, { detectTruncation })).catch(unknownField());
const customerTypeField = rawCustomerTypeFieldSchema.transform(value => normalizeStructuredField<CustomerTypeCode>(value as Partial<StructuredField<CustomerTypeCode>> | undefined, { allowedValues: customerTypeCodes })).catch(unknownField<CustomerTypeCode>());
const influenceField = rawFieldSchema.transform(value => normalizeStructuredField<DecisionInfluence>(value as Partial<StructuredField<DecisionInfluence>> | undefined, { allowedValues: influenceLevels })).catch(unknownField<DecisionInfluence>());

const inferenceSchema = z.preprocess(value => typeof value === "string" ? { content: value, basis: "模型未提供推断依据，需人工核实。", confidence: "low" } : value, z.object({
  content: z.string().trim().min(1),
  basis: z.string().trim().min(1).default("模型未提供推断依据，需人工核实。").catch("模型未提供推断依据，需人工核实。"),
  confidence: z.enum(confidenceLevels).default("low").catch("low"),
}));

const safeStringArray = (maxItems: number, maxLength: number) => z.preprocess(value => {
  if (value == null) return [];
  if (typeof value === "string") return value.trim() ? [value.trim()] : [];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map(item => item.trim());
}, z.array(z.string().trim().min(1).max(maxLength)).max(maxItems).catch([]));

const safeInferenceArray = z.preprocess(value => value == null ? [] : Array.isArray(value) ? value : [value], z.array(inferenceSchema).max(30).catch([]));

export const customerAnalysisResponseSchema = z.object({
  customer: z.object({
    customerName: stringField(),
    jobTitle: stringField(true),
    companyName: stringField(true),
    countryOrRegion: stringField(),
    industry: stringField(),
    customerType: customerTypeField,
    otherImportantInformation: z.array(z.object({
      label: z.string().trim().min(1),
      field: stringField(true),
    })).default([]).catch([]),
  }).default({
    customerName: unknownField(),
    jobTitle: unknownField(),
    companyName: unknownField(),
    countryOrRegion: unknownField(),
    industry: unknownField(),
    customerType: unknownField<CustomerTypeCode>(),
    otherImportantInformation: [],
  }).catch({
    customerName: unknownField(), jobTitle: unknownField(), companyName: unknownField(), countryOrRegion: unknownField(), industry: unknownField(), customerType: unknownField<CustomerTypeCode>(), otherImportantInformation: [],
  }),
  companyBusiness: stringField(),
  decisionInfluence: influenceField,
  inferences: safeInferenceArray,
  recommendedApproach: safeStringArray(30, 1_000),
  completenessScore: z.number().finite().min(0).max(100).default(0).catch(0),
  conflicts: safeStringArray(30, 1_000),
  confirmedFacts: safeStringArray(30, 500),
  reasonableInferences: safeStringArray(20, 500),
  unknownInformation: safeStringArray(30, 500),
  outreach: z.object({
    subjectEn: z.string().trim().default("").catch(""),
    subjectZh: z.string().trim().default("").catch(""),
    bodyEn: z.string().trim().default("").catch(""),
    bodyZh: z.string().trim().default("").catch(""),
  }).default({ subjectEn: "", subjectZh: "", bodyEn: "", bodyZh: "" }).catch({ subjectEn: "", subjectZh: "", bodyEn: "", bodyZh: "" }),
});

export class ModelOutputError extends Error {
  constructor(
    public readonly code: "EMPTY_MODEL_OUTPUT" | "INVALID_MODEL_JSON" | "MODEL_SCHEMA_INVALID" | "MODEL_CORE_DATA_MISSING",
    public readonly diagnostic: ModelOutputDiagnostic = {},
  ) {
    super(code);
  }
}

function extractFirstJsonValue(content: string): { json: string; metadata: JsonExtractionMetadata } {
  const trimmed = content.trim();
  const hadCodeFence = /```(?:json)?/i.test(trimmed);
  const metadata: JsonExtractionMetadata = { hadCodeFence, hadSurroundingText: false, textLength: content.length, responseEmpty: trimmed.length === 0 };
  let start = -1;
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  for (let index = 0; index < trimmed.length; index += 1) {
    const character = trimmed[index];
    if (start < 0) {
      if (character === "{" || character === "[") { start = index; stack.push(character); }
      continue;
    }
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === "{" || character === "[") stack.push(character);
    else if (character === "}" || character === "]") {
      const expectedOpening = character === "}" ? "{" : "[";
      if (stack.at(-1) !== expectedOpening) throw new ModelOutputError("INVALID_MODEL_JSON", {
        extraction: { ...metadata, hadSurroundingText: true },
        jsonError: { category: "MISMATCHED_DELIMITER", position: index },
      });
      stack.pop();
      if (stack.length === 0) {
        const prefix = trimmed.slice(0, start).replace(/```(?:json)?/gi, "").trim();
        const suffix = trimmed.slice(index + 1).replace(/```/g, "").trim();
        return { json: trimmed.slice(start, index + 1), metadata: { ...metadata, hadSurroundingText: Boolean(prefix || suffix) } };
      }
    }
  }
  throw new ModelOutputError("INVALID_MODEL_JSON", {
    extraction: { ...metadata, hadSurroundingText: start > 0 },
    jsonError: { category: start < 0 ? "NO_JSON_START" : "UNTERMINATED_JSON", position: start < 0 ? undefined : start },
  });
}

function valueType(value: unknown) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function topLevelTypes(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { $root: valueType(value) };
  return Object.fromEntries(Object.entries(value).slice(0, 30).map(([key, item]) => [key, valueType(item)]));
}

export function parseModelOutput(content: string): CustomerAnalysisResponse {
  if (!content.trim()) throw new ModelOutputError("EMPTY_MODEL_OUTPUT", {
    extraction: { hadCodeFence: false, hadSurroundingText: false, textLength: content.length, responseEmpty: true },
  });
  let extraction: ReturnType<typeof extractFirstJsonValue>;
  try { extraction = extractFirstJsonValue(content); }
  catch (error) { if (error instanceof ModelOutputError) throw error; throw new ModelOutputError("INVALID_MODEL_JSON"); }
  let value: unknown;
  try {
    value = JSON.parse(extraction.json);
  } catch (error) {
    const match = error instanceof Error ? /position\s+(\d+)/i.exec(error.message) : null;
    throw new ModelOutputError("INVALID_MODEL_JSON", {
      extraction: extraction.metadata,
      jsonError: { category: "JSON_PARSE_ERROR", position: match ? Number(match[1]) : undefined },
    });
  }
  const parsed = customerAnalysisResponseSchema.safeParse(value);
  if (!parsed.success) throw new ModelOutputError("MODEL_SCHEMA_INVALID", {
    extraction: extraction.metadata,
    topLevel: topLevelTypes(value),
    issues: parsed.error.issues.slice(0, 20).map(issue => ({
      path: issue.path.length ? issue.path.join(".") : "$root",
      code: issue.code,
      expected: "expected" in issue && typeof issue.expected === "string" ? issue.expected : undefined,
    })),
  });
  const coreFields = [
    parsed.data.customer.customerName.value,
    parsed.data.customer.jobTitle.value,
    parsed.data.customer.companyName.value,
    parsed.data.customer.industry.value,
    parsed.data.companyBusiness.value,
  ];
  if (!coreFields.some(value => typeof value === "string" && value.trim())) {
    throw new ModelOutputError("MODEL_CORE_DATA_MISSING", { extraction: extraction.metadata, topLevel: topLevelTypes(value) });
  }
  return parsed.data;
}
