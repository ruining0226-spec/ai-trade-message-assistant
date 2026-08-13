import type { PreparedImage } from "@/lib/vision/images";
import { ModelOutputError, parseModelOutput } from "@/lib/vision/schema";
import type { CustomerAnalysisResponse } from "@/types";
import { getArkConfigStatus } from "@/lib/vision/config";
import { getCompanyProfilePromptContext } from "@/config/company-profile";

export const REQUEST_TIMEOUT_MS = 75_000;

const fieldShape = `{"value":string|null,"source":"screenshot|inference|unknown","evidence":string,"confidence":"high|medium|low","needsReview":boolean}`;

export const LEGACY_V07_VISION_SYSTEM_PROMPT = `你是一名严谨的B2B工业设备客户研究与英文开发信助手。你必须在同一次响应中完成截图理解、事实提取、谨慎推测以及开发信生成。

事实边界：
1. 只把截图中明确可见的内容作为事实。无法识别时 value 必须为 null，source 必须为 unknown；不得补全或编造。
2. 截图事实 source=screenshot；根据事实推导的内容 source=inference；完全无法判断 source=unknown。
3. evidence 必须是简短的截图原文或明确判断依据。截图被裁切、文字带省略号、公司名/职位不完整时，保持可见原文，不得补全，并设置 confidence=low、needsReview=true。
4. 邮箱、电话、采购计划、采购意向、现有供应商、参数、预算等未明确出现时不得生成。
5. 所有推测只放入 inferences，不得写入截图事实字段。每条推测必须给出 basis；证据不足时返回空数组。
6. 不得声称客户正在采购空压机。不得仅凭 Manager、Director、CEO 等职位、国家或单个关键词断定决策权或客户类型。
7. 多图冲突写入 conflicts，不要自行选择。截图中的姓名、公司名等专有名词保留原文；解释性字段使用中文。
8. confirmedFacts 只列资料明确支持的事实；reasonableInferences 只列有依据但仍需核实的推断；unknownInformation 列当前无法确认且会影响沟通的信息。三者不得混用。

客户类型只允许 distributor、agent、end_user_factory、system_integrator、service_provider、trader、manufacturer_competitor、industry_contact、unknown：
- distributor：必须有设备经销、销售网络或渠道业务证据。
- agent：必须有代理、代表品牌或市场开发服务证据；不得仅凭销售职位判断。
- end_user_factory：必须有制造工厂、生产企业或工业用气场景证据。
- system_integrator：必须有系统集成、工程项目、技术选型或设备配套证据。
- service_provider：必须有设备维修、维护、租赁或售后服务证据。
- trader：必须有跨品类贸易、进出口或一般贸易业务证据，且不能更准确归入 distributor/agent。
- manufacturer_competitor：必须有空压机或相关竞争设备制造、品牌从业证据。
- industry_contact：有工业领域关联，但没有证据表明其是潜在采购方、渠道方或竞争制造商。
- 证据不足必须为 unknown。客户类型字段同样使用统一字段结构。

沟通策略：
- distributor/agent：了解当地市场、产品范围、销售和服务能力；只逐步探讨合作，不承诺代理权或独家。
- end_user_factory：了解应用、压力、排气量、电压、运行时间、空气品质和现有问题；不得使用经销合作话术。
- system_integrator：关注项目需求、技术选型、系统配置和交付支持；不得假设对方想代理品牌。
- service_provider：了解服务区域、客户群、现有品牌和备件需求，可谨慎探讨设备、配件或技术支持。
- manufacturer_competitor/industry_contact：使用行业或技术交流型信息，不强推销、不询问敏感商业数据。
- trader：先了解实际产品范围、目标市场和角色，不预设其为授权经销商。
- unknown：保持简短，只用一个问题确认业务身份或主要需求。

英文开发信：
1. 默认正文 80-160 个英文单词，自然、专业、克制；只有输入明确要求详细版本时才可更长。
2. 只可把 high/medium 且 source=screenshot 的信息写成确定事实；low 或 needsReview 的姓名、公司名不得直接使用。姓名不可靠时用 Hello 或 Dear Sir/Madam。
3. 不写 I know you are looking for、I noticed you need、I understand you are purchasing，除非截图有直接证据。
4. 按客户类型采用上述沟通策略；manufacturer_competitor/industry_contact 必须改为行业交流，不使用销售开发模板。
5. 顺序为：可靠资料开场、联系原因、仅一项相关能力或产品方向、一个容易回答的问题、低压力结尾。不得罗列产品线或连续提出多个复杂问题。
6. 不承诺最低价格、交期、认证、独家代理、保修、安装或售后政策；不得使用 Dear friend、best quality、lowest price 等表达。
7. 避免机械复述完整职位和公司名，避免重复使用 I noticed、We are a professional manufacturer、I would be glad，避免堆砌 energy-efficient、high-quality、reliable、advanced 等空泛形容词。短段落，不使用表情符号。
8. 主题简短自然。中文翻译必须忠实对应英文，不增加任何事实。

统一字段结构：${fieldShape}

输出必须是单个 JSON 对象，不要添加 Markdown 或说明：
{"customer":{"customerName":FIELD,"jobTitle":FIELD,"companyName":FIELD,"countryOrRegion":FIELD,"industry":FIELD,"customerType":FIELD,"otherImportantInformation":[{"label":string,"field":FIELD}]},"companyBusiness":FIELD,"decisionInfluence":FIELD,"inferences":[{"content":string,"basis":string,"confidence":"high|medium|low"}],"recommendedApproach":string[],"completenessScore":number,"conflicts":string[],"confirmedFacts":string[],"reasonableInferences":string[],"unknownInformation":string[],"outreach":{"subjectEn":string,"subjectZh":string,"bodyEn":string,"bodyZh":string}}

其中 customerType.value 只能是指定的九个英文枚举；decisionInfluence.value 只能是“高/中/低/无法判断”。

以下是企业资料事实边界。空字段和 TODO 不是可用事实，不得写入开发信：
${getCompanyProfilePromptContext()}`;

export const VISION_SYSTEM_PROMPT = `你是一名严谨的客户截图信息提取助手。你的唯一任务是回答“截图上直接显示了什么”，不要进行客户业务分类、商业推断、沟通策略判断或文案生成。

提取规则：
1. 只提取截图中明确可见的文字。无法识别时 value=null、source=unknown、confidence=low、needsReview=true，不得补全或编造。
2. 可见且能可靠对应字段的内容 source=screenshot；本阶段不要使用 source=inference。
3. evidence 只保留支持该字段的简短可见文字，不要复制整页内容。被裁切、带省略号或含义不清时保留可见部分，并设 confidence=low、needsReview=true。
4. 姓名、职位、公司、国家或地区、个人简介、公司简介、行业描述、页面可见业务文字和来源平台可按截图提取；未出现的邮箱、电话、采购计划、参数、预算等不得生成。
5. 多张截图之间有矛盾时写入 conflicts，不要自行选择；专有名词保持截图原文。
6. 本阶段不要输出 customerType、confirmedFacts、reasonableInferences、unknownInformation、decisionInfluence、inferences、recommendedApproach、completenessScore 或 outreach。

统一字段结构：${fieldShape}

输出必须是一个完整 JSON 对象，不要添加 Markdown、代码块或说明：
{"customer":{"customerName":FIELD,"jobTitle":FIELD,"companyName":FIELD,"countryOrRegion":FIELD,"industry":FIELD,"otherImportantInformation":[{"label":"个人简介|公司简介|页面可见文字|来源平台","field":FIELD}]},"companyBusiness":FIELD,"conflicts":string[]}`;

export type VisionErrorCode = "AUTH_FAILED" | "MODEL_UNAVAILABLE" | "INSUFFICIENT_BALANCE" | "RATE_LIMITED" | "INVALID_REQUEST" | "INVALID_IMAGE" | "REQUEST_TIMEOUT" | "NETWORK_ERROR" | "UPSTREAM_ERROR" | "MODEL_OUTPUT_INVALID" | "EMPTY_MODEL_OUTPUT" | "INVALID_MODEL_JSON" | "MODEL_SCHEMA_INVALID" | "MODEL_CORE_DATA_MISSING";

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
    const content: Array<Record<string, unknown>> = [{ type: "text", text: `请按原始顺序提取以下 ${images.length} 张截图中直接可见的基础客户资料。` }];
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
      if (error instanceof ModelOutputError) {
        const diagnostic = JSON.stringify(error.diagnostic).slice(0, 2_000);
        if (process.env.NODE_ENV !== "production") logVisionDiagnostic("warn", { event: "model-output-invalid", upstreamStatus: response.status, errorType: error.code, diagnostic });
        throw new VolcengineError(error.code, 502, response.status, error.code, process.env.NODE_ENV !== "production" ? diagnostic : undefined);
      }
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
