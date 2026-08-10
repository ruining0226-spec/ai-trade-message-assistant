import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { ImageValidationError, MAX_IMAGE_COUNT, validateAndPrepareImage } from "@/lib/vision/images";
import { analyzeWithVolcengine, VolcengineError } from "@/lib/vision/volcengine";
import { getArkConfigStatus, REQUIRED_ARK_VARIABLES } from "@/lib/vision/config";

export const runtime = "nodejs";
export const maxDuration = 120;

const activeRequests = new Set<string>();
const recentRequests = new Map<string, number>();

const messages: Record<string, string> = {
  CONFIG_MISSING: "尚未配置豆包/火山引擎API，当前使用演示分析。",
  TOO_MANY_IMAGES: "最多只能上传 5 张图片。",
  NO_IMAGES: "请至少上传一张图片。",
  EMPTY_FILE: "上传的图片为空，请重新选择。",
  UNSUPPORTED_IMAGE: "图片格式无效，仅支持真实的 JPEG、PNG 或 WebP 文件。",
  IMAGE_TOO_LARGE: "单张图片不能超过 10MB。",
  INVALID_IMAGE: "图片已损坏或尺寸无效，请重新导出后上传。",
  AUTH_FAILED: "火山方舟 API 密钥无效，请检查服务端配置。",
  MODEL_UNAVAILABLE: "视觉模型无权限、未开通或不存在，请检查模型 ID。",
  INSUFFICIENT_BALANCE: "火山方舟账户余额或额度不足，请充值或检查资源额度。",
  RATE_LIMITED: "火山方舟请求过多或当前额度受限，请稍后重试。",
  INVALID_REQUEST: "火山方舟拒绝了当前请求，请检查模型配置或图片后重试。",
  REQUEST_TIMEOUT: "图片分析超时，请稍后重试。",
  NETWORK_ERROR: "服务器无法连接火山方舟，请检查网络后重试。",
  UPSTREAM_ERROR: "火山方舟服务暂时不可用，请稍后重试。",
  MODEL_OUTPUT_INVALID: "模型未返回可用的结构化客户资料，请重试或使用演示结果继续。",
  DUPLICATE_REQUEST: "相同分析请求正在处理或刚刚完成，请勿重复提交。",
  INTERNAL_ERROR: "服务器处理图片时发生错误，请稍后重试。",
};

function errorResponse(code: string, status: number, requestId: string) {
  return NextResponse.json({ ok: false, error: { code, message: messages[code] || messages.INTERNAL_ERROR }, requestId }, { status });
}

export function GET() {
  try {
    const { configured, missingVariables } = getArkConfigStatus();
    return NextResponse.json(
      {
        mode: configured ? "volcengine" : "mock",
        configured,
        missingVariables,
        message: configured ? "已配置火山方舟视觉 AI。" : messages.CONFIG_MISSING,
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch {
    return NextResponse.json(
      { mode: "mock", configured: false, missingVariables: [...REQUIRED_ARK_VARIABLES], message: "无法读取视觉 AI 服务端配置，当前使用演示分析。" },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }
}

export async function POST(request: Request) {
  const requestId = request.headers.get("x-analysis-request-id")?.slice(0, 100) || randomUUID();
  const start = Date.now();
  const startedAt = new Date(start).toISOString();
  const arkConfig = getArkConfigStatus();
  for (const [id, expiresAt] of recentRequests) if (expiresAt < Date.now()) recentRequests.delete(id);
  if (activeRequests.has(requestId) || recentRequests.has(requestId)) return errorResponse("DUPLICATE_REQUEST", 409, requestId);
  if (!arkConfig.configured) return errorResponse("CONFIG_MISSING", 503, requestId);
  activeRequests.add(requestId);
  let imageCount = 0;
  let totalBytes = 0;
  let imageSizes: number[] = [];
  let status = 500;
  let errorType = "INTERNAL_ERROR";
  let upstreamStatus: number | undefined;
  let upstreamErrorType: string | undefined;
  let upstreamErrorMessage: string | undefined;
  try {
    const formData = await request.formData();
    const files = formData.getAll("images").filter((item): item is File => item instanceof File);
    imageCount = files.length;
    imageSizes = files.map((file) => file.size);
    totalBytes = files.reduce((sum, file) => sum + file.size, 0);
    if (!files.length) { status = 400; errorType = "NO_IMAGES"; return errorResponse(errorType, status, requestId); }
    if (files.length > MAX_IMAGE_COUNT) { status = 400; errorType = "TOO_MANY_IMAGES"; return errorResponse(errorType, status, requestId); }
    const prepared = [];
    for (const file of files) prepared.push(await validateAndPrepareImage(file));
    const analysis = await analyzeWithVolcengine(prepared, request.signal);
    status = 200; errorType = "";
    recentRequests.set(requestId, Date.now() + 60_000);
    return NextResponse.json({ ok: true, analysis, analysisSource: "volcengine", requestId });
  } catch (error) {
    if (error instanceof ImageValidationError) { status = 400; errorType = error.code; return errorResponse(errorType, status, requestId); }
    if (error instanceof VolcengineError) {
      status = error.status;
      errorType = error.code;
      upstreamStatus = error.upstreamStatus;
      upstreamErrorType = error.upstreamType;
      upstreamErrorMessage = error.upstreamMessage;
      return errorResponse(errorType, status, requestId);
    }
    return errorResponse(errorType, status, requestId);
  } finally {
    activeRequests.delete(requestId);
    console.info(`customer-analysis ${JSON.stringify({
      requestId,
      startedAt,
      modelId: arkConfig.modelId,
      imageCount,
      imageSizes,
      totalBytes,
      upstreamStatus,
      durationMs: Date.now() - start,
      status,
      errorType: errorType || undefined,
      upstreamErrorType,
      upstreamErrorMessage,
    })}`);
  }
}
