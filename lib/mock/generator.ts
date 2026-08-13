import type { ChannelMessage, Customer, CustomerAnalysis, CustomerTypeCode, GenerationConfig, MessageContent, MessageVersion, StructuredField } from "@/types";

const id = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const productEnglish: Record<string, string> = {
  "永磁变频螺杆空压机": "permanent-magnet variable-speed screw compressors",
  "两级压缩空压机": "two-stage screw compressors",
  "无油空压机": "oil-free air compressors",
  "整厂节能系统": "plant-wide compressed-air efficiency solutions",
};
const typeCodeFromLegacy: Record<Customer["customerType"], CustomerTypeCode> = {
  经销商: "distributor", 代理商: "agent", 终端工厂: "end_user_factory", 设备集成商: "system_integrator",
  工程项目方: "system_integrator", "系统集成商/工程公司": "system_integrator", 服务商: "service_provider",
  贸易商: "trader", "制造商/同行": "manufacturer_competitor", 行业联系人: "industry_contact",
  其他: "unknown", 无法判断: "unknown",
};

export const countEnglishWords = (value: string) => value.trim().match(/[A-Za-z]+(?:[-'][A-Za-z]+)*/g)?.length || 0;
export const countEnglishCharacters = (value: string) => [...value].length;

function usableFact(field: StructuredField | undefined) {
  return Boolean(field?.value && (field.source === "screenshot" || field.source === "user_confirmed") && field.confidence !== "low" && !field.needsReview);
}

function safeValue(value: string, field: StructuredField | undefined, fallback: string) {
  return usableFact(field) ? value.trim() || fallback : fallback;
}

function safeGreeting(customer: Customer, analysis: CustomerAnalysis, style: "letter" | "social" = "letter") {
  const name = safeValue(customer.name, analysis.structuredFields?.customerName, "");
  if (!name) return "Hello";
  return `${style === "letter" ? "Dear" : "Hi"} ${name.split(/\s+/)[0]}`;
}

function safeContext(customer: Customer, analysis: CustomerAnalysis) {
  const company = safeValue(customer.companyName, analysis.structuredFields?.companyName, "your company");
  const industry = safeValue(customer.industry, analysis.structuredFields?.industry, "");
  const business = safeValue(analysis.mainBusiness, analysis.companyBusinessField, industry);
  const rawStructuredType = usableFact(analysis.structuredFields?.customerType) ? analysis.structuredFields?.customerType.value as string | null : null;
  const structuredType = rawStructuredType === "oem_integrator" ? "system_integrator" : rawStructuredType as CustomerTypeCode | null;
  const typeCode = structuredType || typeCodeFromLegacy[customer.customerType] || "unknown";
  return { company, industry, business, typeCode };
}

function angleFor(type: CustomerTypeCode) {
  switch (type) {
    case "distributor": case "agent": return "先了解当地市场、产品范围及销售服务能力，再逐步探讨合作，不涉及代理权或区域独家承诺";
    case "end_user_factory": return "围绕应用、压力、排气量、电压、运行时间、空气品质和现有问题确认实际用气需求";
    case "system_integrator": return "围绕项目需求、技术选型、系统配置和交付支持交流，不预设品牌代理意向";
    case "service_provider": return "了解服务区域、客户群、现有品牌和备件需求，再判断设备、配件或技术支持机会";
    case "trader": return "先确认实际产品范围、目标市场和业务角色，不预设其为授权经销商";
    case "manufacturer_competitor": case "industry_contact": return "以行业和技术交流为主，不使用强推销话术，也不询问敏感商业数据";
    default: return "先用一个简短问题确认对方业务身份或主要需求";
  }
}

function invitationReason(type: CustomerTypeCode) {
  switch (type) {
    case "distributor": case "agent": return "exchange perspectives on industrial compressed-air markets";
    case "end_user_factory": return "exchange practical ideas on compressed-air applications";
    case "system_integrator": return "exchange views on compressed-air system integration";
    case "service_provider": return "exchange practical equipment and service perspectives";
    case "manufacturer_competitor": case "industry_contact": return "exchange technical and industry perspectives";
    case "trader": return "learn more about each other's industrial equipment focus";
    default: return "connect for a brief exchange on industrial compressed air";
  }
}

function createLinkedInInvitation(customer: Customer, analysis: CustomerAnalysis) {
  const { industry, typeCode } = safeContext(customer, analysis);
  const greeting = safeGreeting(customer, analysis, "social");
  const groundedOpening = industry ? `Your work in ${industry} caught my attention.` : "We both work around industrial markets.";
  const english = `${greeting}, ${groundedOpening} I work with compressed-air equipment and would value the chance to ${invitationReason(typeCode)}. Open to connecting?`;
  const chinese = industry
    ? `${greeting.replace(/^Hi /, "")}，您好！您在${industry}领域的工作引起了我的关注。我从事压缩空气设备，希望就相关行业话题做简短交流。方便建立联系吗？`
    : `${greeting.replace(/^Hi /, "")}，您好！我们都关注工业市场。我从事压缩空气设备，希望就相关行业话题做简短交流。方便建立联系吗？`;
  return { english: english.slice(0, 300), chinese };
}

function firstOutreach(customer: Customer, analysis: CustomerAnalysis, product: string, productZh: string) {
  const { industry, typeCode } = safeContext(customer, analysis);
  const greeting = `${safeGreeting(customer, analysis)},`;
  const groundedOpening = industry ? `Your work in ${industry} is the reason I am reaching out.` : "I am reaching out to understand whether compressed-air topics are relevant to your work.";
  const intro = `My team works with ${product} for industrial applications.`;
  const introZh = `我们团队提供面向工业应用的${productZh}。`;
  switch (typeCode) {
    case "distributor": case "agent": return {
      subject: "A practical compressed-air market conversation", subjectZh: "压缩空气市场交流",
      english: `${greeting}\n\n${groundedOpening} ${intro} I would first like to understand your local market focus, current product scope, and whether your team supports customers after delivery. If there is a sensible fit, we can explore cooperation step by step without making assumptions about representation or exclusivity. Which compressed-air customer segment is most relevant to your business today?\n\nBest regards,\n[Your Name]`,
      chinese: `${greeting === "Hello," ? "您好！" : `${customer.name.split(/\s+/)[0]}，您好！`}\n\n${industry ? `您在${industry}领域的工作是我联系您的原因。` : "我想了解压缩空气业务是否与您的工作相关。"}${introZh}我希望先了解贵公司的当地市场重点、现有产品范围，以及团队是否提供交付后的客户支持。如果方向合适，我们可以逐步探讨合作，但不会预设代理或独家安排。请问目前哪类压缩空气客户与贵公司的业务最相关？\n\n祝好！\n[您的姓名]`,
    };
    case "end_user_factory": return {
      subject: "A question about your compressed-air application", subjectZh: "关于压缩空气应用的简短问题",
      english: `${greeting}\n\n${groundedOpening} ${intro} Rather than assume there is a purchase plan, I would like to understand the application first. Pressure, required flow, voltage, operating hours, air-quality requirements, and any current reliability or maintenance issue would determine whether this direction is relevant. Is there one compressed-air challenge your team is currently evaluating, or would a short application checklist be useful?\n\nBest regards,\n[Your Name]`,
      chinese: `${greeting === "Hello," ? "您好！" : `${customer.name.split(/\s+/)[0]}，您好！`}\n\n${industry ? `您在${industry}领域的工作是我联系您的原因。` : "我想了解压缩空气业务是否与您的工作相关。"}${introZh}我不想预设贵公司已有采购计划，因此希望先了解应用。压力、排气量、电压、运行时间、空气品质要求，以及现有的可靠性或维护问题，都会影响这一方向是否合适。请问团队目前是否正在评估某一个压缩空气问题，或者一份简短的应用信息清单是否有帮助？\n\n祝好！\n[您的姓名]`,
    };
    case "system_integrator": return {
      subject: "Compressed-air support for engineering projects", subjectZh: "工程项目中的压缩空气支持",
      english: `${greeting}\n\n${groundedOpening} ${intro} For engineering work, our useful role is usually to support specification matching, system configuration, and technical clarification rather than assume a distribution relationship. We can review a defined requirement and identify what still needs engineering confirmation before any recommendation. Do your current or upcoming projects include compressed-air equipment that requires technical selection or integration support?\n\nBest regards,\n[Your Name]`,
      chinese: `${greeting === "Hello," ? "您好！" : `${customer.name.split(/\s+/)[0]}，您好！`}\n\n${industry ? `您在${industry}领域的工作是我联系您的原因。` : "我想了解压缩空气业务是否与您的工作相关。"}${introZh}对于工程项目，我们更适合提供规格匹配、系统配置和技术澄清支持，而不会预设经销合作关系。我们可以根据明确需求进行审阅，并在推荐前指出仍需工程确认的信息。请问贵公司当前或后续项目是否包含需要技术选型或集成支持的压缩空气设备？\n\n祝好！\n[您的姓名]`,
    };
    case "service_provider": return {
      subject: "Equipment and service support discussion", subjectZh: "设备与服务支持交流",
      english: `${greeting}\n\n${groundedOpening} ${intro} I would like to understand the service side before suggesting anything: the area you cover, the customer groups you support, the brands commonly encountered, and whether equipment, spare parts, or technical support is the more relevant topic. We would confirm availability and terms separately rather than promise them in an initial message. Which of those areas is closest to your current work?\n\nBest regards,\n[Your Name]`,
      chinese: `${greeting === "Hello," ? "您好！" : `${customer.name.split(/\s+/)[0]}，您好！`}\n\n${industry ? `您在${industry}领域的工作是我联系您的原因。` : "我想了解压缩空气业务是否与您的工作相关。"}${introZh}在提出建议前，我希望先了解服务情况，包括覆盖区域、服务的客户群、常见品牌，以及设备、备件或技术支持中哪一项更相关。供货情况和条款需要另行确认，不会在首次沟通中承诺。请问其中哪一项最接近贵公司目前的工作？\n\n祝好！\n[您的姓名]`,
    };
    case "manufacturer_competitor": case "industry_contact": return {
      subject: "An industry exchange on compressed air", subjectZh: "压缩空气行业交流",
      english: `${greeting}\n\n${groundedOpening} I work in the compressed-air equipment field and am reaching out for an industry exchange, not a standard sales pitch. It could be useful to compare general perspectives on applications, system design, and the technical questions customers are raising, while avoiding confidential commercial information. Would you be open to a brief conversation about one technical or market topic that is relevant to your work?\n\nBest regards,\n[Your Name]`,
      chinese: `${greeting === "Hello," ? "您好！" : `${customer.name.split(/\s+/)[0]}，您好！`}\n\n${industry ? `您在${industry}领域的工作是我联系您的原因。` : "我想与您就压缩空气行业进行交流。"}我从事压缩空气设备领域，这次联系是希望进行行业交流，而不是发送常规销售推介。我们可以讨论应用、系统设计及客户关注的技术问题，同时避免涉及机密商业信息。请问您是否愿意就与工作相关的一个技术或市场话题做简短交流？\n\n祝好！\n[您的姓名]`,
    };
    case "trader": return {
      subject: "Understanding your industrial equipment focus", subjectZh: "了解贵公司的工业设备方向",
      english: `${greeting}\n\n${groundedOpening} ${intro} Before discussing products, I would like to understand your actual role, the equipment categories you handle, and the markets you serve. That will help avoid treating a general trading business as an authorized distributor or assuming a need that has not been confirmed. Is compressed-air equipment part of your current product scope, or is another industrial category more central to your work?\n\nBest regards,\n[Your Name]`,
      chinese: `${greeting === "Hello," ? "您好！" : `${customer.name.split(/\s+/)[0]}，您好！`}\n\n${industry ? `您在${industry}领域的工作是我联系您的原因。` : "我想了解贵公司的工业设备业务方向。"}${introZh}在讨论产品前，我希望先了解贵公司的实际角色、经营的设备类别和服务市场，避免把一般贸易业务擅自称为授权经销商，也避免预设尚未确认的需求。请问压缩空气设备是否属于贵公司现有产品范围，还是其他工业品类更核心？\n\n祝好！\n[您的姓名]`,
    };
    default: return {
      subject: "A brief compressed-air introduction", subjectZh: "压缩空气业务简要介绍",
      english: `${greeting}\n\nI am reaching out because we both work around industrial markets, although the available information does not clearly show your business role or current needs. My team works with compressed-air equipment for industrial applications. I do not want to assume that you are a buyer, distributor, or project partner. A short answer will help me keep any future information relevant and avoid an unnecessary sales message. Would you be open to sharing whether your work is closer to equipment sales, factory use, engineering projects, service, or another area?\n\nBest regards,\n[Your Name]`,
      chinese: `${greeting === "Hello," ? "您好！" : `${customer.name.split(/\s+/)[0]}，您好！`}\n\n我联系您是因为我们都关注工业市场，但现有资料无法明确显示您的业务身份或当前需求。我们团队从事工业压缩空气设备。我不希望擅自把您视为采购方、经销商或项目合作伙伴。简单回复即可帮助我确保后续信息相关，并避免不必要的销售消息。方便说明您的工作更接近设备销售、工厂应用、工程项目、服务，还是其他领域吗？\n\n祝好！\n[您的姓名]`,
    };
  }
}

function safeModelOutreach(customer: Customer, analysis: CustomerAnalysis) {
  const outreach = analysis.generatedOutreach;
  if (!outreach || countEnglishWords(outreach.bodyEn) < 80 || countEnglishWords(outreach.bodyEn) > 160 || !outreach.bodyZh) return null;
  const unsafeValues = [analysis.structuredFields?.customerName, analysis.structuredFields?.companyName]
    .filter(field => field?.value && !usableFact(field)).map(field => field?.value?.toLowerCase());
  const body = outreach.bodyEn.toLowerCase();
  if (unsafeValues.some(value => value && body.includes(value))) return null;
  if (/i know you are looking for|i noticed you need|i understand you are purchasing|lowest price|exclusive (?:agency|rights)|guaranteed delivery/i.test(outreach.bodyEn)) return null;
  return outreach;
}

const message = (idValue: string, title: string, titleEn: string, english: string, chinese: string): ChannelMessage => ({ id: idValue, title, titleEn, english, chinese });

function createChannelMessages(customer: Customer, analysis: CustomerAnalysis, config: GenerationConfig): ChannelMessage[] {
  const product = productEnglish[config.product] || "industrial air compressors";
  const local = firstOutreach(customer, analysis, product, config.product);
  if (config.channel === "Email") {
    const generated = safeModelOutreach(customer, analysis);
    return [
      message("email-subject", "Email 主题", "Email Subject", generated?.subjectEn || local.subject, generated?.subjectZh || local.subjectZh),
      message("email-body", "第一封开发邮件", "First Outreach Email", generated?.bodyEn || local.english, generated?.bodyZh || local.chinese),
      message("email-follow-up", "建议的简短跟进邮件", "Suggested Short Follow-up Email", "Hello,\n\nI am following up briefly on my earlier message. If compressed-air equipment is not relevant now, no action is needed. If it is worth discussing, which single application or business area should we focus on first?\n\nBest regards,\n[Your Name]", "您好！\n\n想简短跟进之前的消息。如果压缩空气设备目前不相关，无需处理；如果值得交流，请问我们最适合先关注哪一个应用或业务方向？\n\n祝好！\n[您的姓名]"),
    ];
  }
  if (config.channel === "Facebook") return [
    message("facebook-first-contact", "Facebook 首次联系消息", "Facebook First Contact Message", local.english, local.chinese),
    message("facebook-follow-up", "对方回应或建立联系后的跟进消息", "Facebook Follow-up Message", "Thank you for replying. Which part of compressed-air equipment or applications would be most useful to discuss first?", "感谢回复。请问压缩空气设备或应用中，哪一方面最值得先交流？"),
  ];
  if (config.channel === "WhatsApp") return [
    message("whatsapp-first-contact", "WhatsApp 首次联系消息", "WhatsApp First Contact Message", local.english, local.chinese),
    message("whatsapp-follow-up", "对方回复后的跟进消息", "WhatsApp Follow-up Message", "Thank you. Which one compressed-air topic would be most relevant to your work?", "谢谢。请问哪一个压缩空气话题与您的工作最相关？"),
  ];
  const invitation = createLinkedInInvitation(customer, analysis);
  return [
    message("linkedin-request", "LinkedIn 连接邀请", "LinkedIn Connection Request", invitation.english, invitation.chinese),
    message("linkedin-first-message", "连接通过后的第一封消息", "First Message After Connecting", local.english, local.chinese),
  ];
}

export function createMessageContent(customer: Customer, analysis: CustomerAnalysis, config: GenerationConfig): MessageContent {
  const messages = createChannelMessages(customer, analysis, config);
  const { typeCode } = safeContext(customer, analysis);
  const confirmedFacts = analysis.confirmedFacts?.length ? analysis.confirmedFacts : ["当前仅使用人工确认或高/中置信度截图事实。"];
  const reasonableInferences = analysis.reasonableInferences?.length ? analysis.reasonableInferences : analysis.inferences?.map(item => `${item.content}（依据：${item.basis}）`) || [];
  const unknownInformation = analysis.unknownInformation?.length ? analysis.unknownInformation : [analysis.uncertainties || "客户的具体需求与采购计划尚未确认。"];
  return {
    identityAnalysis: `客户类型：${typeCode}\n已确认事实：${confirmedFacts.join("；")}\n合理推断：${reasonableInferences.join("；") || "无"}\n未知信息：${unknownInformation.join("；")}`,
    businessConnection: reasonableInferences.length ? reasonableInferences.join("；") : "现有资料不足以确认客户的压缩空气需求。",
    recommendedAngle: analysis.recommendedAngle || angleFor(typeCode),
    invitationEn: messages[0]?.english || "", firstMessageEn: messages[1]?.english || "",
    invitationZh: messages[0]?.chinese || "", firstMessageZh: messages[1]?.chinese || "",
    personalizationBasis: `客户类型：${typeCode}；仅使用通过置信度检查的当前客户事实；推广方向：${config.product}。`,
    uncertaintyNotice: unknownInformation.join("；"),
    messages,
  };
}

export function createVersion(customer: Customer, analysis: CustomerAnalysis, config: GenerationConfig, reason = "初次生成"): MessageVersion {
  const now = new Date().toISOString();
  return { id: id(), label: `版本 ${new Date(now).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`, createdAt: now, reason, content: createMessageContent(customer, analysis, config) };
}
