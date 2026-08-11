import { defaultCompanyProfile, defaultConfig, defaultProducts } from "@/lib/mock/defaults";
import { getChannelMessages } from "@/lib/message/channel-messages";
import { getLastContactAt, normalizeConversationMessages, normalizeFollowUpGenerations, normalizeFollowUpStage } from "@/lib/follow-up/context";
import type { Channel, CompanyProfile, MessageContent, Product, Task } from "@/types";

const KEYS = { tasks: "trade-assistant.tasks.v1", company: "trade-assistant.company.v1", products: "trade-assistant.products.v1" };
let storageError = "";

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try { const value = window.localStorage.getItem(key); return value ? JSON.parse(value) as T : fallback; }
  catch {
    storageError = "本地数据读取失败，可能是浏览器存储数据已损坏。系统已使用安全默认值，请不要继续覆盖数据，建议先导出或备份浏览器数据。";
    return fallback;
  }
}

function write<T>(key: string, value: T) {
  if (typeof window === "undefined") return true;
  try { window.localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch {
    storageError = "本地保存失败，浏览器存储空间可能已满或当前页面无存储权限。请清理空间后重试，刚才的内容尚未可靠保存。";
    return false;
  }
}

export const storageRepository = {
  getTasks: () => read<Task[]>(KEYS.tasks, []).map(normalizeTask),
  saveTasks: (tasks: Task[]) => write(KEYS.tasks, tasks),
  getCompany: () => read<CompanyProfile>(KEYS.company, defaultCompanyProfile),
  saveCompany: (profile: CompanyProfile) => write(KEYS.company, profile),
  getProducts: () => read<Product[]>(KEYS.products, defaultProducts),
  saveProducts: (products: Product[]) => write(KEYS.products, products),
  consumeStorageError: () => { const error = storageError; storageError = ""; return error; },
};

const channels: Channel[] = ["LinkedIn", "Facebook", "Email", "WhatsApp"];
const emptyContent: MessageContent = {
  identityAnalysis: "", businessConnection: "", recommendedAngle: "", invitationEn: "", firstMessageEn: "",
  invitationZh: "", firstMessageZh: "", personalizationBasis: "", uncertaintyNotice: "",
};

export function normalizeTask(task: Task): Task {
  const channel = channels.includes(task.config?.channel) ? task.config.channel : "LinkedIn";
  const normalizedResults = (task.versions || []).map(version => {
    const content = { ...emptyContent, ...version.content };
    return { ...version, content: { ...content, messages: getChannelMessages(content, channel) } };
  });
  const currentResult = normalizedResults.find(result => result.id === task.selectedVersionId) || normalizedResults.at(-1);
  const legacyContext = (task as Task & { followUpContext?: { stage?: Task["followUpStage"]; messages?: Task["conversationMessages"] } }).followUpContext;
  const conversationMessages = normalizeConversationMessages(task.conversationMessages || legacyContext?.messages, task.id);
  return {
    ...task,
    analysisSource: task.analysisSource || "legacy",
    analysis: {
      ...task.analysis,
      decisionInfluence: (["高", "中", "低", "无法判断"] as const).find(value => value === task.analysis?.decisionInfluence)
        || "无法判断",
      conflicts: task.analysis?.conflicts || [],
      evidence: task.analysis?.evidence || [],
    },
    config: { ...defaultConfig, ...task.config, channel },
    images: task.images || [],
    versions: currentResult ? [currentResult] : [],
    selectedVersionId: currentResult?.id || "",
    followUpDate: task.followUpDate || "",
    notes: task.notes || "",
    followUps: task.followUps || [],
    conversationMessages,
    followUpGenerations: normalizeFollowUpGenerations(task.followUpGenerations, task.id),
    followUpStage: normalizeFollowUpStage(task.followUpStage || legacyContext?.stage),
    lastContactAt: task.lastContactAt || getLastContactAt(conversationMessages),
  };
}
