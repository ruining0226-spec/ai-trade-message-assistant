import { formatMessagesForFollowUpContext } from "@/lib/message/channel-messages";
import type {
  ConversationMessage,
  ConversationPlatform,
  ConversationRole,
  CustomerStage,
  FollowUpGeneration,
  FollowUpGenerationRequest,
  FollowUpTone,
  MessageContent,
  ReplyGoal,
  Task,
} from "@/types";

export const MAX_AI_CONVERSATION_MESSAGES = 20;
export const CUSTOMER_STAGES: CustomerStage[] = [
  "new", "invitation_sent", "connected", "replied", "needs_discovery",
  "quoting", "technical_discussion", "won", "paused", "invalid",
];
export const CONVERSATION_PLATFORMS: ConversationPlatform[] = ["linkedin", "whatsapp", "email", "facebook", "other"];
export const CONVERSATION_ROLES: ConversationRole[] = ["customer", "salesperson"];
export const REPLY_GOALS: ReplyGoal[] = ["了解需求", "回答问题", "推进报价", "邀请会议", "售后跟进", "自定义"];
export const FOLLOW_UP_TONES: FollowUpTone[] = ["简洁", "专业", "友好", "谨慎"];

export const STAGE_LABELS: Record<CustomerStage, string> = {
  new: "新客户",
  invitation_sent: "已发送邀请",
  connected: "已建立联系",
  replied: "已回复",
  needs_discovery: "需求确认",
  quoting: "报价中",
  technical_discussion: "技术沟通",
  won: "成交",
  paused: "暂停跟进",
  invalid: "无效客户",
};

export const PLATFORM_LABELS: Record<ConversationPlatform, string> = {
  linkedin: "LinkedIn",
  whatsapp: "WhatsApp",
  email: "Email",
  facebook: "Facebook",
  other: "Other",
};

export function normalizeFollowUpStage(stage: CustomerStage | undefined): CustomerStage {
  return stage && CUSTOMER_STAGES.includes(stage) ? stage : "new";
}

function normalizeMessage(message: ConversationMessage, taskId: string): ConversationMessage | null {
  if (!message || message.taskId !== taskId || !message.id || !message.content?.trim() || !message.createdAt) return null;
  const legacyRole = message.role as ConversationRole | "sales";
  const role: ConversationRole = legacyRole === "sales" ? "salesperson" : legacyRole;
  if (!CONVERSATION_ROLES.includes(role) || !CONVERSATION_PLATFORMS.includes(message.platform)) return null;
  return { ...message, role, content: message.content.trim() };
}

export function normalizeConversationMessages(messages: ConversationMessage[] | undefined, taskId: string): ConversationMessage[] {
  return Array.isArray(messages)
    ? messages.map(message => normalizeMessage(message, taskId)).filter((message): message is ConversationMessage => Boolean(message))
    : [];
}

function normalizeGeneration(generation: FollowUpGeneration, taskId: string): FollowUpGeneration | null {
  if (!generation || generation.taskId !== taskId || !generation.id || !generation.createdAt || !generation.updatedAt) return null;
  if (!REPLY_GOALS.includes(generation.replyGoal) || !FOLLOW_UP_TONES.includes(generation.tone)) return null;
  return {
    ...generation,
    sourceMessageIds: Array.isArray(generation.sourceMessageIds) ? generation.sourceMessageIds.filter(id => typeof id === "string") : [],
    customReplyGoal: typeof generation.customReplyGoal === "string" ? generation.customReplyGoal : "",
    businessFacts: typeof generation.businessFacts === "string" ? generation.businessFacts : "",
    missingInformation: Array.isArray(generation.missingInformation) ? generation.missingInformation.filter(item => typeof item === "string") : [],
    riskWarnings: Array.isArray(generation.riskWarnings) ? generation.riskWarnings.filter(item => typeof item === "string") : [],
  };
}

export function normalizeFollowUpGenerations(generations: FollowUpGeneration[] | undefined, taskId: string): FollowUpGeneration[] {
  return Array.isArray(generations)
    ? generations.map(generation => normalizeGeneration(generation, taskId)).filter((generation): generation is FollowUpGeneration => Boolean(generation))
    : [];
}

export function getLastContactAt(messages: ConversationMessage[]) {
  return messages.reduce((latest, message) => message.createdAt > latest ? message.createdAt : latest, "");
}

export function appendConversationMessage(task: Task, message: ConversationMessage): Task {
  if (message.taskId !== task.id) throw new Error("FOLLOW_UP_TASK_MISMATCH");
  const messages = normalizeConversationMessages(task.conversationMessages, task.id);
  if (messages.some(item => item.id === message.id)) return task;
  const nextMessages = [...messages, message];
  return { ...task, updatedAt: new Date().toISOString(), conversationMessages: nextMessages, lastContactAt: getLastContactAt(nextMessages) };
}

export function removeConversationMessage(task: Task, message: ConversationMessage): Task {
  if (message.taskId !== task.id) throw new Error("FOLLOW_UP_TASK_MISMATCH");
  const messages = normalizeConversationMessages(task.conversationMessages, task.id);
  if (!messages.some(item => item.id === message.id)) return task;
  const nextMessages = messages.filter(item => item.id !== message.id);
  return { ...task, updatedAt: new Date().toISOString(), conversationMessages: nextMessages, lastContactAt: getLastContactAt(nextMessages) };
}

export function appendFollowUpGeneration(task: Task, generation: FollowUpGeneration): Task {
  if (generation.taskId !== task.id) throw new Error("FOLLOW_UP_TASK_MISMATCH");
  const generations = normalizeFollowUpGenerations(task.followUpGenerations, task.id);
  if (generations.some(item => item.id === generation.id)) return task;
  return { ...task, updatedAt: new Date().toISOString(), followUpGenerations: [...generations, generation] };
}

export function updateFollowUpGeneration(task: Task, generation: FollowUpGeneration): Task {
  if (generation.taskId !== task.id) throw new Error("FOLLOW_UP_TASK_MISMATCH");
  const generations = normalizeFollowUpGenerations(task.followUpGenerations, task.id);
  return { ...task, updatedAt: new Date().toISOString(), followUpGenerations: generations.map(item => item.id === generation.id ? generation : item) };
}

function formatCurrentOutreach(content: MessageContent | undefined, task: Task) {
  return content ? formatMessagesForFollowUpContext(content, task.config.channel) : "No saved outreach copy.";
}

export function buildFollowUpGenerationRequest(task: Task, input: { replyGoal: ReplyGoal; customReplyGoal: string; tone: FollowUpTone; businessFacts: string; latestCustomerReply?: string }): FollowUpGenerationRequest {
  const allMessages = normalizeConversationMessages(task.conversationMessages, task.id);
  const messages = allMessages.slice(-MAX_AI_CONVERSATION_MESSAGES);
  const latestSavedCustomerReply = [...messages].reverse().find(message => message.role === "customer")?.content || "";
  return {
    taskId: task.id,
    customer: { ...task.customer },
    analysis: {
      mainBusiness: task.analysis.mainBusiness,
      decisionInfluence: task.analysis.decisionInfluence,
      potentialApplications: task.analysis.potentialApplications,
      recommendedAngle: task.analysis.recommendedAngle,
      uncertainties: task.analysis.uncertainties,
      conflicts: [...task.analysis.conflicts],
    },
    currentOutreach: formatCurrentOutreach(task.versions[0]?.content, task),
    followUpStage: normalizeFollowUpStage(task.followUpStage),
    replyGoal: input.replyGoal,
    customReplyGoal: input.customReplyGoal.trim(),
    tone: input.tone,
    businessFacts: input.businessFacts.trim(),
    messages,
    latestCustomerReply: input.latestCustomerReply?.trim() || latestSavedCustomerReply,
  };
}
