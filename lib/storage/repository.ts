import { defaultCompanyProfile, defaultConfig, defaultProducts } from "@/lib/mock/defaults";
import { getChannelMessages } from "@/lib/message/channel-messages";
import type { Channel, CompanyProfile, MessageContent, Product, Task } from "@/types";

const KEYS = { tasks: "trade-assistant.tasks.v1", company: "trade-assistant.company.v1", products: "trade-assistant.products.v1" };

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try { const value = window.localStorage.getItem(key); return value ? JSON.parse(value) as T : fallback; }
  catch { return fallback; }
}

function write<T>(key: string, value: T) {
  if (typeof window !== "undefined") window.localStorage.setItem(key, JSON.stringify(value));
}

export const storageRepository = {
  getTasks: () => read<Task[]>(KEYS.tasks, []).map(normalizeTask),
  saveTasks: (tasks: Task[]) => write(KEYS.tasks, tasks),
  getCompany: () => read<CompanyProfile>(KEYS.company, defaultCompanyProfile),
  saveCompany: (profile: CompanyProfile) => write(KEYS.company, profile),
  getProducts: () => read<Product[]>(KEYS.products, defaultProducts),
  saveProducts: (products: Product[]) => write(KEYS.products, products),
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
  };
}
