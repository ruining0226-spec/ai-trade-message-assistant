export type TaskStatus =
  | "待分析" | "待确认" | "已生成" | "待发送" | "已发送" | "已回复"
  | "待跟进" | "有效线索" | "无效客户" | "已成交" | "已归档";

export type Channel = "LinkedIn" | "Facebook" | "Email" | "WhatsApp";
export type CustomerType = "经销商" | "代理商" | "终端工厂" | "设备集成商" | "工程项目方" | "服务商" | "其他" | "无法判断";
export type DecisionInfluence = "高" | "中" | "低" | "无法判断";
export type AnalysisSource = "volcengine" | "mock" | "legacy";
export type FieldSource = "screenshot" | "inference" | "unknown";
export type Confidence = "high" | "medium" | "low";
export type CustomerTypeCode = "distributor" | "agent" | "end_user_factory" | "oem_integrator" | "service_provider" | "unknown";

export interface StructuredField<T = string> {
  value: T | null;
  source: FieldSource;
  evidence: string;
  confidence: Confidence;
  needsReview: boolean;
}

export interface ImportantInformation {
  label: string;
  field: StructuredField;
}

export interface CustomerStructuredFields {
  customerName: StructuredField;
  jobTitle: StructuredField;
  companyName: StructuredField;
  countryOrRegion: StructuredField;
  industry: StructuredField;
  customerType: StructuredField<CustomerTypeCode>;
  otherImportantInformation: ImportantInformation[];
}

export interface AnalysisInference {
  content: string;
  basis: string;
  confidence: Confidence;
}

export interface GeneratedOutreach {
  subjectEn: string;
  subjectZh: string;
  bodyEn: string;
  bodyZh: string;
}

export interface EvidenceItem {
  field: string;
  sourceImage: number;
  evidence: string;
}

export interface CustomerAnalysisResponse {
  customer: CustomerStructuredFields;
  companyBusiness: StructuredField;
  decisionInfluence: StructuredField<DecisionInfluence>;
  inferences: AnalysisInference[];
  recommendedApproach: string[];
  completenessScore: number;
  conflicts: string[];
  outreach: GeneratedOutreach;
}

export interface Customer {
  id: string;
  name: string;
  title: string;
  companyName: string;
  country: string;
  industry: string;
  customerType: CustomerType;
}

export interface CustomerAnalysis {
  mainBusiness: string;
  decisionInfluence: DecisionInfluence;
  potentialApplications: string;
  recommendedAngle: string;
  completeness: number;
  uncertainties: string;
  conflicts: string[];
  evidence: EvidenceItem[];
  structuredFields?: CustomerStructuredFields;
  companyBusinessField?: StructuredField;
  decisionInfluenceField?: StructuredField<DecisionInfluence>;
  inferences?: AnalysisInference[];
  generatedOutreach?: GeneratedOutreach;
}

export interface TaskImage {
  id: string;
  name: string;
  type: string;
  size: number;
  previewUrl?: string;
  /** 仅存在于当前浏览器会话，持久化任务时会被移除。 */
  file?: File;
}

export interface GenerationConfig {
  channel: Channel;
  purpose: "初次认识" | "寻找经销商" | "推荐产品" | "项目合作" | "二次跟进";
  customerType: CustomerType;
  tone: "友好简短" | "专业正式" | "顾问式";
  length: "极简" | "标准" | "详细";
  language: "英文" | "中英对照";
  product: string;
  notes: string;
}

export interface MessageContent {
  identityAnalysis: string;
  businessConnection: string;
  recommendedAngle: string;
  invitationEn: string;
  firstMessageEn: string;
  invitationZh: string;
  firstMessageZh: string;
  personalizationBasis: string;
  uncertaintyNotice: string;
  /** 新版渠道消息结构；旧版本缺少该字段时由兼容层从固定字段转换。 */
  messages?: ChannelMessage[];
}

export interface ChannelMessage {
  id: string;
  title: string;
  titleEn: string;
  english: string;
  chinese: string;
}

export interface OptimizableMessage {
  id: string;
  english: string;
  chinese: string;
}

export interface MessageOptimizationRequest {
  channel: Channel;
  messages: OptimizableMessage[];
  customerSummary: string;
  requirement: string;
}

export interface MessageOptimizationResponse {
  messages: OptimizableMessage[];
}

export interface MessageVersion {
  id: string;
  label: string;
  createdAt: string;
  reason: string;
  content: MessageContent;
}

export interface FollowUp {
  date: string;
  note: string;
  completed: boolean;
}

export interface Task {
  id: string;
  customer: Customer;
  analysis: CustomerAnalysis;
  analysisSource: AnalysisSource;
  images: TaskImage[];
  config: GenerationConfig;
  versions: MessageVersion[];
  selectedVersionId: string;
  createdAt: string;
  updatedAt: string;
  status: TaskStatus;
  followUpDate: string;
  notes: string;
  followUps: FollowUp[];
}

export interface CompanyProfile {
  companyName: string;
  introduction: string;
  strengths: string;
  serviceScope: string;
  mainMarkets: string;
  email: string;
  whatsapp: string;
  website: string;
  bannedClaims: string;
  unavailablePromises: string;
  unverifiedQualifications: string;
}

export interface Product {
  id: string;
  name: string;
  introduction: string;
  industries: string;
  applications: string;
  strengths: string;
  bannedClaims: string;
}
