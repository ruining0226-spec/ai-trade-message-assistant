import type { CompanyProfile, Customer, CustomerAnalysis, GenerationConfig, Product } from "@/types";

export const demoCustomer: Customer = {
  id: "demo-roger",
  name: "Roger Davis",
  title: "Managing Director",
  companyName: "Laser Industrial Ltd",
  country: "United Kingdom",
  industry: "激光切割与工业工程",
  customerType: "设备集成商",
};

export const demoAnalysis: CustomerAnalysis = {
  mainBusiness: "提供激光切割设备、工业工程与项目配套解决方案",
  decisionInfluence: "高",
  potentialApplications: "激光切割配套压缩空气、稳定供气、节能系统",
  recommendedAngle: "从激光切割项目中的压缩空气配套和节能需求切入",
  completeness: 86,
  uncertainties: "官网截图未明确显示其当前空压机品牌、用气参数及采购计划，沟通时需要以提问确认。",
  conflicts: [],
  evidence: [
    { field: "客户姓名", sourceImage: 1, evidence: "演示数据：示例个人资料显示 Roger Davis。" },
    { field: "公司名称", sourceImage: 1, evidence: "演示数据：示例资料显示 Laser Industrial Ltd。" },
  ],
};

export const defaultConfig: GenerationConfig = {
  channel: "LinkedIn",
  purpose: "初次认识",
  customerType: "设备集成商",
  tone: "友好简短",
  length: "标准",
  language: "中英对照",
  product: "永磁变频螺杆空压机",
  notes: "",
};

export const defaultCompanyProfile: CompanyProfile = {
  companyName: "示例空压机制造企业",
  introduction: "专注于工业压缩空气设备与节能系统，为制造业客户提供设备选型和系统方案支持。",
  strengths: "制造经验、系统化选型、节能方案支持、响应及时",
  serviceScope: "空压机设备、后处理设备、压缩空气系统规划与节能改造建议",
  mainMarkets: "东南亚、中东、欧洲、拉丁美洲",
  email: "sales@example.com",
  whatsapp: "+86 138 0000 0000",
  website: "https://example.com",
  bannedClaims: "全球第一、零故障、绝对最低能耗",
  unavailablePromises: "未确认前不得承诺本地安装、24小时到场或无限期质保",
  unverifiedQualifications: "未录入系统的认证、客户案例、性能参数和合作关系",
};

export const defaultProducts: Product[] = [
  { id: "pm-vsd", name: "永磁变频螺杆空压机", introduction: "根据用气波动调节输出的工业压缩空气设备。", industries: "通用制造、钣金、电子、汽车零部件", applications: "连续供气、生产线配套、激光切割辅助用气", strengths: "适合变负荷工况、运行稳定、便于系统化节能规划", bannedClaims: "不得虚构具体节能比例、寿命或客户案例" },
  { id: "two-stage", name: "两级压缩空压机", introduction: "面向较高用气量和连续运行场景的两级压缩方案。", industries: "钢铁、化工、玻璃、重型制造", applications: "集中供气、连续生产、高负荷工况", strengths: "适合大型系统规划、兼顾效率与稳定运行", bannedClaims: "不得虚构能效等级、排气量或回收期" },
  { id: "oil-free", name: "无油空压机", introduction: "用于对压缩空气品质要求较高的生产场景。", industries: "食品饮料、医药、电子、精密制造", applications: "洁净工艺用气、仪表用气、产品接触用气", strengths: "帮助用户规划高品质压缩空气系统", bannedClaims: "不得在未确认型号时宣称特定认证或空气等级" },
  { id: "plant-efficiency", name: "整厂节能系统", introduction: "从气源、管网、控制和用气端整体评估压缩空气系统。", industries: "多产线制造工厂、工业园区", applications: "站房优化、群控、余热利用、泄漏与压力管理", strengths: "从单机设备延伸到系统运行视角", bannedClaims: "不得承诺固定节能率、收益或回本周期" },
];
