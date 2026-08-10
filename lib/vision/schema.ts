import { z } from "zod";
import type { Confidence, CustomerAnalysisResponse, CustomerTypeCode, DecisionInfluence, FieldSource, StructuredField } from "@/types";

const sources = ["screenshot", "inference", "unknown"] as const;
const confidenceLevels = ["high", "medium", "low"] as const;
const customerTypeCodes = ["distributor", "agent", "end_user_factory", "oem_integrator", "service_provider", "unknown"] as const;
const influenceLevels = ["高", "中", "低", "无法判断"] as const;

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

  const source: FieldSource = sources.includes(input?.source as FieldSource) ? input?.source as FieldSource : "unknown";
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

const rawFieldSchema = z.object({
  value: z.string().nullable().optional(),
  source: z.enum(sources).optional(),
  evidence: z.string().optional(),
  confidence: z.enum(confidenceLevels).optional(),
  needsReview: z.boolean().optional(),
}).optional();

const stringField = (detectTruncation = false) => rawFieldSchema.transform(value => normalizeStructuredField(value, { detectTruncation }));
const customerTypeField = rawFieldSchema.transform(value => normalizeStructuredField<CustomerTypeCode>(value as Partial<StructuredField<CustomerTypeCode>> | undefined, { allowedValues: customerTypeCodes }));
const influenceField = rawFieldSchema.transform(value => normalizeStructuredField<DecisionInfluence>(value as Partial<StructuredField<DecisionInfluence>> | undefined, { allowedValues: influenceLevels }));

const inferenceSchema = z.object({
  content: z.string().trim().min(1),
  basis: z.string().trim().min(1),
  confidence: z.enum(confidenceLevels).default("low").catch("low"),
});

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
  }),
  companyBusiness: stringField(),
  decisionInfluence: influenceField,
  inferences: z.array(inferenceSchema).default([]).catch([]),
  recommendedApproach: z.array(z.string().trim().min(1)).default([]).catch([]),
  completenessScore: z.number().finite().min(0).max(100).default(0).catch(0),
  conflicts: z.array(z.string().trim().min(1)).default([]).catch([]),
  outreach: z.object({
    subjectEn: z.string().trim().default("").catch(""),
    subjectZh: z.string().trim().default("").catch(""),
    bodyEn: z.string().trim().default("").catch(""),
    bodyZh: z.string().trim().default("").catch(""),
  }).default({ subjectEn: "", subjectZh: "", bodyEn: "", bodyZh: "" }),
});

export class ModelOutputError extends Error {
  constructor(public readonly code: "EMPTY_MODEL_OUTPUT" | "INVALID_MODEL_JSON" | "MODEL_SCHEMA_INVALID") {
    super(code);
  }
}

function removeMarkdownFence(value: string) {
  const trimmed = value.trim();
  if (!trimmed.startsWith("```") || !trimmed.endsWith("```")) return trimmed;
  const firstLineEnd = trimmed.indexOf("\n");
  if (firstLineEnd < 0) return trimmed;
  return trimmed.slice(firstLineEnd + 1, -3).trim();
}

export function parseModelOutput(content: string): CustomerAnalysisResponse {
  if (!content.trim()) throw new ModelOutputError("EMPTY_MODEL_OUTPUT");
  let value: unknown;
  try {
    value = JSON.parse(removeMarkdownFence(content));
  } catch {
    throw new ModelOutputError("INVALID_MODEL_JSON");
  }
  const parsed = customerAnalysisResponseSchema.safeParse(value);
  if (!parsed.success) throw new ModelOutputError("MODEL_SCHEMA_INVALID");
  return parsed.data;
}
