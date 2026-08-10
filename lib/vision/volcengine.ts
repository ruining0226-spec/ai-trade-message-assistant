import type { PreparedImage } from "@/lib/vision/images";
import { ModelOutputError, parseModelOutput } from "@/lib/vision/schema";
import type { CustomerAnalysisResponse } from "@/types";
import { getArkConfigStatus } from "@/lib/vision/config";
import { getCompanyProfilePromptContext } from "@/config/company-profile";

export const REQUEST_TIMEOUT_MS = 75_000;

const fieldShape = `{"value":string|null,"source":"screenshot|inference|unknown","evidence":string,"confidence":"high|medium|low","needsReview":boolean}`;

export const VISION_SYSTEM_PROMPT = `你是一名严谨的B2B工业设备客户研究与英文开发信助手。你必须在同一次响应中完成截图理解、事实提取、谨慎推测以及开发信生成。

事实边界：
1. 只把截图中明确可见的内容作为事实。无法识别时 value 必须为 null，source 必须为 unknown；不得补全或编造。
2. 截图事实 source=screenshot；根据事实推导的内容 source=inference；完全无法判断 source=unknown。
3. evidence 必须是简短的截图原文或明确判断依据。截图被裁切、文字带省略号、公司名/职位不完整时，保持可见原文，不得补全，并设置 confidence=low、needsReview=true。
4. 邮箱、电话、采购计划、采购意向、现有供应商、参数、预算等未明确出现时不得生成。
5. 所有推测只放入 inferences，不得写入截图事实字段。每条推测必须给出 basis；证据不足时返回空数组。
6. 不得声称客户正在采购空压机。不得仅凭 Manager、Director、CEO 等职位断定采购决策权。
7. 多图冲突写入 conflicts，不要自行选择。截图中的姓名、公司名等专有名词保留原文；解释性字段使用中文。

客户类型只允许 distributor、agent、end_user_factory、oem_integrator、service_provider、unknown：
- distributor/agent：必须有设备销售、代理、分销或渠道业务证据。
- end_user_factory：必须有制造工厂、生产企业或工业用气场景证据。
- oem_integrator：必须有机械设备制造、系统集成或项目配套证据。
- service_provider：必须有设备维修、租赁或工程服务证据。
- 证据不足必须为 unknown。客户类型字段同样使用统一字段结构。

英文开发信：
1. 正文 80-120 个英文单词，自然、专业、友好，不使用夸张营销语言。
2. 只可把 high/medium 且 source=screenshot 的信息写成确定事实；low 或 needsReview 的姓名、公司名不得直接使用。姓名不可靠时用 Hello 或 Dear Sir/Madam。
3. 不写 I know you are looking for、I noticed you need、I understand you are purchasing，除非截图有直接证据。
4. distributor/agent 从产品覆盖、市场或渠道合作切入；end_user_factory 从节能、稳定运行、维护和实际用气切入；oem_integrator 从规格适配、配套和项目合作切入；service_provider 从设备、备件和服务合作切入；unknown 只做简短介绍并询问是否愿意了解。
5. 主题简短自然。中文翻译必须忠实对应英文，不增加任何事实。

统一字段结构：${fieldShape}

输出必须是单个 JSON 对象，不要添加 Markdown 或说明：
{"customer":{"customerName":FIELD,"jobTitle":FIELD,"companyName":FIELD,"countryOrRegion":FIELD,"industry":FIELD,"customerType":FIELD,"otherImportantInformation":[{"label":string,"field":FIELD}]},"companyBusiness":FIELD,"decisionInfluence":FIELD,"inferences":[{"content":string,"basis":string,"confidence":"high|medium|low"}],"recommendedApproach":string[],"completenessScore":number,"conflicts":string[],"outreach":{"subjectEn":string,"subjectZh":string,"bodyEn":string,"bodyZh":string}}

其中 customerType.value 只能是指定的六个英文枚举；decisionInfluence.value 只能是“高/中/低/无法判断”。

以下是企业资料事实边界。空字段和 TODO 不是可用事实，不得写入开发信：
${getCompanyProfilePromptContext()}`;

export type VisionErrorCode = "AUTH_FAILED" | "MODEL_UNAVAILABLE" | "INSUFFICIENT_BALANCE" | "RATE_LIMITED" | "INVALID_REQUEST" | "INVALID_IMAGE" | "REQUEST_TIMEOUT" | "NETWORK_ERROR" | "UPSTREAM_ERROR" | "MODEL_OUTPUT_INVALID";

export class VolcengineError extends Error {
  constructor(
    public readonly code: VisionErrorCode,
    public readonly status = 502,
    public readonly upstreamStatus?: number,
    public readonly upstreamType?: string,
    public readonly upstreamMessage?: string,
  ) {
    super(code);
  }
}

type UpstreamErrorDetails = { type?: string; message?: string };

function sanitizeDiagnostic(value: string, apiKey?: string) {
  let safe = value.replace(/Bearer\s+[^\s"']+/gi, "Bearer [REDACTED]");
  if (apiKey) safe = safe.split(apiKey).join("[REDACTED]");
  return safe.replace(/[\r\n\t]+/g, " ").slice(0, 500);
}

function readUpstreamError(body: string, apiKey?: string): UpstreamErrorDetails {
  try {
    const parsed = JSON.parse(body) as { error?: { code?: unknown; type?: unknown; message?: unknown }; code?: unknown; type?: unknown; message?: unknown };
    const upstream = parsed.error || parsed;
    const type = upstream.code ?? upstream.type;
    return {
      type: typeof type === "string" ? sanitizeDiagnostic(type, apiKey) : undefined,
      message: typeof upstream.message === "string" ? sanitizeDiagnostic(upstream.message, apiKey) : undefined,
    };
  } catch {
    return { message: sanitizeDiagnostic(body, apiKey) || undefined };
  }
}

export function classifyHttpError(status: number, body: string, apiKey?: string) {
  const normalized = body.toLowerCase();
  const details = readUpstreamError(body, apiKey);
  const create = (code: VisionErrorCode) => new VolcengineError(code, code === "RATE_LIMITED" ? 429 : 502, status, details.type, details.message);
  if (status === 401 || normalized.includes("api key") || normalized.includes("authentication")) return create("AUTH_FAILED");
  if (status === 403 || status === 404 || normalized.includes("model") && (normalized.includes("not found") || normalized.includes("invalid endpoint") || normalized.includes("not open") || normalized.includes("permission"))) return create("MODEL_UNAVAILABLE");
  if (status === 429) return create("RATE_LIMITED");
  if (normalized.includes("balance") || normalized.includes("insufficient quota") || normalized.includes("insufficient fund")) return create("INSUFFICIENT_BALANCE");
  if (normalized.includes("image") && (normalized.includes("invalid") || normalized.includes("format") || normalized.includes("base64") || normalized.includes("decode"))) return create("INVALID_IMAGE");
  if (status >= 400 && status < 500 && status !== 408) return create("INVALID_REQUEST");
  return create("UPSTREAM_ERROR");
}

function logVisionDiagnostic(level: "info" | "warn", details: Record<string, unknown>) {
  const message = `volcengine-vision ${JSON.stringify(details)}`;
  if (level === "warn") console.warn(message);
  else console.info(message);
}

async function requestOnce(images: PreparedImage[], signal?: AbortSignal, attempt = 1): Promise<CustomerAnalysisResponse> {
  const { configured, apiKey, modelId, baseUrl } = getArkConfigStatus();
  if (!configured || !apiKey || !modelId) throw new VolcengineError("MODEL_UNAVAILABLE", 503);
  const endpoint = `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
  const startedAt = new Date().toISOString();
  const started = Date.now();
  const controller = new AbortController();
  let timedOut = false;
  let upstreamStatus: number | undefined;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, REQUEST_TIMEOUT_MS);
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  logVisionDiagnostic("info", {
    event: "request-start",
    startedAt,
    attempt,
    endpoint,
    modelId,
    imageCount: images.length,
    originalImageBytes: images.map((image) => image.originalSize),
    processedImageBytes: images.map((image) => image.buffer.length),
    timeoutMs: REQUEST_TIMEOUT_MS,
  });
  try {
    const content: Array<Record<string, unknown>> = [{ type: "text", text: `请按原始顺序综合分析以下 ${images.length} 张截图。` }];
    images.forEach((image, index) => {
      content.push({ type: "text", text: `第 ${index + 1} 张截图：` });
      content.push({ type: "image_url", image_url: { url: `data:${image.mimeType};base64,${image.buffer.toString("base64")}`, detail: "high" } });
    });
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: modelId,
        temperature: 0.1,
        max_tokens: 4_096,
        thinking: { type: "disabled" },
        response_format: { type: "json_object" },
        messages: [{ role: "system", content: VISION_SYSTEM_PROMPT }, { role: "user", content }],
      }),
      signal: controller.signal,
    });
    upstreamStatus = response.status;
    if (!response.ok) {
      const safeBody = (await response.text()).slice(0, 2_000);
      throw classifyHttpError(response.status, safeBody, apiKey);
    }
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    try {
      const analysis = parseModelOutput(payload.choices?.[0]?.message?.content || "");
      logVisionDiagnostic("info", {
        event: "request-succeeded",
        startedAt,
        attempt,
        endpoint,
        modelId,
        imageCount: images.length,
        upstreamStatus: response.status,
        durationMs: Date.now() - started,
      });
      return analysis;
    } catch (error) {
      if (error instanceof ModelOutputError) throw new VolcengineError("MODEL_OUTPUT_INVALID", 502);
      throw error;
    }
  } catch (error) {
    const mapped = error instanceof VolcengineError
      ? error
      : timedOut
        ? new VolcengineError("REQUEST_TIMEOUT", 504, upstreamStatus)
        : new VolcengineError("NETWORK_ERROR", 502, upstreamStatus, error instanceof Error ? error.name : undefined, error instanceof Error ? sanitizeDiagnostic(error.message, apiKey) : undefined);
    logVisionDiagnostic("warn", {
      event: "request-failed",
      startedAt,
      attempt,
      endpoint,
      modelId,
      imageCount: images.length,
      imageBytes: images.map((image) => image.originalSize),
      upstreamStatus: mapped.upstreamStatus,
      durationMs: Date.now() - started,
      errorType: mapped.upstreamType || mapped.code,
      errorMessage: mapped.upstreamMessage,
    });
    throw mapped;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}

export async function analyzeWithVolcengine(images: PreparedImage[], signal?: AbortSignal) {
  return requestOnce(images, signal, 1);
}
