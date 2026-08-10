import type { ChannelMessage, Customer, CustomerAnalysis, CustomerTypeCode, GenerationConfig, MessageContent, MessageVersion, StructuredField } from "@/types";

const id = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const productEnglish: Record<string, string> = {
  "永磁变频螺杆空压机": "permanent-magnet variable-speed screw compressors",
  "两级压缩空压机": "two-stage screw compressors",
  "无油空压机": "oil-free air compressors",
  "整厂节能系统": "plant-wide compressed-air efficiency solutions",
};
const typeCodeFromLegacy: Record<Customer["customerType"], CustomerTypeCode> = {
  经销商: "distributor", 代理商: "agent", 终端工厂: "end_user_factory", 设备集成商: "oem_integrator",
  工程项目方: "oem_integrator", 服务商: "service_provider", 其他: "unknown", 无法判断: "unknown",
};

export const countEnglishWords = (value: string) => value.trim().match(/[A-Za-z]+(?:[-'][A-Za-z]+)*/g)?.length || 0;

function usableFact(field: StructuredField | undefined) {
  return Boolean(field?.value && field.source === "screenshot" && field.confidence !== "low" && !field.needsReview);
}

function safeValue(value: string, field: StructuredField | undefined, fallback: string) {
  return usableFact(field) ? value.trim() || fallback : fallback;
}

function safeGreeting(customer: Customer, analysis: CustomerAnalysis) {
  const name = safeValue(customer.name, analysis.structuredFields?.customerName, "");
  return name ? `Dear ${name.split(/\s+/)[0]},` : "Hello,";
}

function safeContext(customer: Customer, analysis: CustomerAnalysis) {
  const company = safeValue(customer.companyName, analysis.structuredFields?.companyName, "your company");
  const industry = safeValue(customer.industry, analysis.structuredFields?.industry, "industrial applications");
  const business = safeValue(analysis.mainBusiness, analysis.companyBusinessField, industry);
  const typeCode = analysis.structuredFields?.customerType.value || typeCodeFromLegacy[customer.customerType];
  return { company, industry, business, typeCode };
}

function angleFor(type: CustomerTypeCode) {
  switch (type) {
    case "distributor": case "agent": return "broader product coverage and practical channel cooperation";
    case "end_user_factory": return "energy efficiency, operating stability and maintenance priorities";
    case "oem_integrator": return "specification fit and compressed-air equipment integration for future projects";
    case "service_provider": return "equipment supply, spare-parts availability and service cooperation";
    default: return "industrial compressed-air equipment could be relevant to your work";
  }
}

function questionFor(type: CustomerTypeCode) {
  switch (type) {
    case "distributor": case "agent": return "May I ask whether air-compressor products or channel cooperation would be relevant to your current portfolio?";
    case "end_user_factory": return "May I ask whether improving compressed-air efficiency, stability or maintenance is relevant to any current operation?";
    case "oem_integrator": return "May I ask whether your projects ever require air-compressor specifications or supporting equipment to be matched?";
    case "service_provider": return "May I ask whether equipment supply, spare parts or service cooperation would be useful to your team?";
    default: return "May I ask whether you would be open to a short introduction to our industrial air-compressor range?";
  }
}

function angleZhFor(type: CustomerTypeCode) {
  switch (type) {
    case "distributor": case "agent": return "拓展产品覆盖和开展渠道合作";
    case "end_user_factory": return "节能、稳定运行和维护重点";
    case "oem_integrator": return "未来项目的规格适配和压缩空气设备配套";
    case "service_provider": return "设备供应、备件和服务合作";
    default: return "工业压缩空气设备是否可能与贵公司的工作相关";
  }
}

function localEmail(customer: Customer, analysis: CustomerAnalysis, product: string, productZh: string) {
  const { industry, typeCode } = safeContext(customer, analysis);
  const greeting = safeGreeting(customer, analysis);
  const angle = angleFor(typeCode);
  const question = questionFor(typeCode);
  const subject = typeCode === "unknown" ? "A brief compressed-air introduction" : "Exploring compressed-air cooperation";
  const english = `${greeting}\n\nI came across your profile and noticed your work in ${industry}. We manufacture ${product} for industrial applications. Based on the information available, I would like to explore whether ${angle} could be relevant to your business. We do not want to assume your current requirements. ${question} If this is relevant, I would be glad to share a concise product introduction and learn more about your priorities, preferred applications and next steps.\n\nBest regards,\n[Your Name]`;
  const chinese = `${greeting === "Hello," ? "您好！" : `${customer.name.split(/\s+/)[0]}，您好！`}\n\n我了解到您从事${industry}相关工作。我们生产面向工业应用的${productZh}。根据目前有限的信息，我想了解${angleZhFor(typeCode)}是否可能与贵公司的业务相关。我们不希望预设您当前的需求，因此想先请教这一方向是否值得进一步交流。如果相关，我很乐意发送一份简明的产品介绍，并进一步了解贵公司的重点、应用场景和后续安排。\n\n祝好！\n[您的姓名]`;
  return { subject, subjectZh: typeCode === "unknown" ? "压缩空气产品简要介绍" : "探讨压缩空气合作", english, chinese };
}

function safeModelOutreach(customer: Customer, analysis: CustomerAnalysis) {
  const outreach = analysis.generatedOutreach;
  if (!outreach || countEnglishWords(outreach.bodyEn) < 80 || countEnglishWords(outreach.bodyEn) > 120 || !outreach.bodyZh) return null;
  const unsafeValues = [analysis.structuredFields?.customerName, analysis.structuredFields?.companyName]
    .filter(field => field?.value && !usableFact(field))
    .map(field => field?.value?.toLowerCase());
  const body = outreach.bodyEn.toLowerCase();
  if (unsafeValues.some(value => value && body.includes(value))) return null;
  if (/i know you are looking for|i noticed you need|i understand you are purchasing/i.test(outreach.bodyEn)) return null;
  return outreach;
}

const message = (id: string, title: string, titleEn: string, english: string, chinese: string): ChannelMessage => ({ id, title, titleEn, english, chinese });

function createChannelMessages(customer: Customer, analysis: CustomerAnalysis, config: GenerationConfig): ChannelMessage[] {
  const product = productEnglish[config.product] || "industrial air compressors";
  const { company, industry, typeCode } = safeContext(customer, analysis);
  const greeting = safeGreeting(customer, analysis).replace(/^Dear /, "Hi ").replace(/,$/, "");
  const question = questionFor(typeCode);
  if (config.channel === "Email") {
    const fallback = localEmail(customer, analysis, product, config.product);
    const generated = safeModelOutreach(customer, analysis);
    const subject = generated?.subjectEn || fallback.subject;
    const body = generated?.bodyEn || fallback.english;
    const translation = generated?.bodyZh || fallback.chinese;
    return [
      message("email-subject", "Email 主题", "Email Subject", subject, generated?.subjectZh || fallback.subjectZh),
      message("email-body", "第一封开发邮件", "First Outreach Email", body, translation),
      message("email-follow-up", "建议的简短跟进邮件", "Suggested Short Follow-up Email",
        `Hello,\n\nI wanted to follow up briefly on my earlier note about compressed-air cooperation. Would this be relevant to any current or upcoming work at ${company}?\n\nBest regards,\n[Your Name]`,
        `您好！\n\n想简短跟进一下之前关于压缩空气合作的邮件。请问这一方向是否与贵公司当前或后续工作相关？\n\n祝好！\n[您的姓名]`),
    ];
  }
  if (config.channel === "Facebook") return [
    message("facebook-first-contact", "Facebook 首次联系消息", "Facebook First Contact Message", `${greeting}, I came across your work in ${industry}. I work with industrial compressed-air equipment and would be pleased to connect.`, `您好！我了解到您从事${industry}相关工作。我从事工业压缩空气设备，希望有机会与您认识。`),
    message("facebook-follow-up", "对方回应或建立联系后的跟进消息", "Facebook Follow-up Message", `Thanks for getting back to me. ${question}`, `感谢回复。我想先了解工业压缩空气设备或相关合作是否与贵公司的业务有关。`),
  ];
  if (config.channel === "WhatsApp") return [
    message("whatsapp-first-contact", "WhatsApp 首次联系消息", "WhatsApp First Contact Message", `${greeting}, I came across your work in ${industry}. I work with industrial air compressors. Would it be alright to ask one brief question?`, `您好！我了解到您从事${industry}相关工作。我从事工业空压机业务，方便请教一个简短问题吗？`),
    message("whatsapp-follow-up", "对方回复后的跟进消息", "WhatsApp Follow-up Message", `Thank you. ${question}`, `谢谢。想请教工业空压机或相关合作是否与贵公司的业务有关？`),
  ];
  return [
    message("linkedin-request", "LinkedIn 连接邀请", "LinkedIn Connection Request", `${greeting}, I came across your work in ${industry}. I work with industrial compressed-air solutions and would be pleased to connect and exchange practical industry perspectives.`, `您好！我了解到您从事${industry}相关工作。我从事工业压缩空气解决方案，希望与您建立联系并交流行业经验。`),
    message("linkedin-first-message", "连接通过后的第一封消息", "First Message After Connecting", `${greeting}, thank you for connecting. We manufacture ${product} for industrial applications. ${question}`, `您好，感谢通过好友申请。我们生产面向工业应用的${config.product}。想请教这一产品或相关合作是否与贵公司的业务有关？`),
  ];
}

export function createMessageContent(customer: Customer, analysis: CustomerAnalysis, config: GenerationConfig): MessageContent {
  const messages = createChannelMessages(customer, analysis, config);
  const { typeCode } = safeContext(customer, analysis);
  return {
    identityAnalysis: `${customer.name || "客户姓名待确认"}；${customer.title || "职位待确认"}；${customer.companyName || "公司名称待确认"}。`,
    businessConnection: analysis.inferences?.length ? analysis.inferences.map(item => `${item.content}（依据：${item.basis}）`).join("；") : "截图证据不足，暂不判断客户的压缩空气需求。",
    recommendedAngle: analysis.recommendedAngle || angleFor(typeCode),
    invitationEn: messages[0]?.english || "", firstMessageEn: messages[1]?.english || "",
    invitationZh: messages[0]?.chinese || "", firstMessageZh: messages[1]?.chinese || "",
    personalizationBasis: `客户类型：${typeCode}；仅使用通过置信度检查的截图事实；推广产品：${config.product}。`,
    uncertaintyNotice: analysis.uncertainties || "低置信度和推测信息不得作为确定事实写入开发信。",
    messages,
  };
}

export function createVersion(customer: Customer, analysis: CustomerAnalysis, config: GenerationConfig, reason = "初次生成"): MessageVersion {
  const now = new Date().toISOString();
  return { id: id(), label: `版本 ${new Date(now).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`, createdAt: now, reason, content: createMessageContent(customer, analysis, config) };
}
