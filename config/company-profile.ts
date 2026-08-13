import type { CustomerTypeCode } from "@/types";

/**
 * Server-side factual boundary for AI analysis and outreach.
 * Empty values are intentional: the repository currently contains demo company
 * details only, so they must not be presented to the model as verified facts.
 */
export const companyProfileConfig = {
  englishName: "",
  shortEnglishIntroduction: "",
  productCategories: [
    "permanent-magnet variable-speed screw air compressors",
    "two-stage screw air compressors",
    "oil-free air compressors",
    "compressed-air system energy-efficiency solutions",
  ],
  confirmedStrengths: [] as string[],
  targetCustomerTypes: [
    "distributor",
    "agent",
    "end_user_factory",
    "system_integrator",
    "service_provider",
    "trader",
    "manufacturer_competitor",
    "industry_contact",
  ] as CustomerTypeCode[],
  outreachAngles: {
    distributor: ["product coverage", "market cooperation", "channel cooperation"],
    agent: ["product coverage", "market cooperation", "channel cooperation"],
    end_user_factory: ["energy efficiency", "operating stability", "maintenance and actual air demand"],
    system_integrator: ["specification fit", "equipment integration", "project cooperation"],
    service_provider: ["equipment supply", "spare parts", "service cooperation"],
    trader: ["product scope", "target market", "business role"],
    manufacturer_competitor: ["technical exchange", "industry developments"],
    industry_contact: ["industry exchange", "shared technical topics"],
    unknown: ["a brief introduction", "whether learning more would be relevant"],
  } satisfies Record<CustomerTypeCode, string[]>,
  prohibitedClaims: [
    "Do not claim that the customer is buying or currently needs an air compressor without explicit screenshot evidence.",
    "Do not invent certifications, export markets, production capacity, customer cases, price advantages, technical parameters or partnerships.",
    "Do not promise local installation, on-site response times, warranties, savings percentages, service coverage or commercial terms that are not confirmed.",
  ],
  writingRules: [
    "Write natural, professional and friendly B2B English.",
    "Keep first outreach between 80 and 160 English words unless a detailed version is explicitly requested.",
    "Use only high- or medium-confidence screenshot facts as definite statements.",
    "Treat every inference as a possibility and ask a natural verification question.",
    "Keep the subject concise and avoid exaggerated or spam-like wording.",
    "Make the Chinese translation faithful to the English and add no new facts.",
  ],
  contact: {
    email: "",
    whatsapp: "",
    website: "",
  },
  todo: [
    "TODO: add the verified English company name and introduction.",
    "TODO: add verified company strengths and usable contact details.",
    "TODO: review product categories against approved product literature.",
  ],
} as const;

export function getCompanyProfilePromptContext() {
  return JSON.stringify(companyProfileConfig, null, 2);
}
