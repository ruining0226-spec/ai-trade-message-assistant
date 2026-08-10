import { NextResponse } from "next/server";
import { messageOptimizationRequestSchema, MessageOptimizationError, optimizeMessagesWithVolcengine } from "@/lib/message/volcengine";

export const runtime = "nodejs";
export const maxDuration = 90;

const messages: Record<MessageOptimizationError["code"], string> = {
  CONFIG_MISSING: "尚未配置豆包/火山方舟 API，无法优化文案。",
  AUTH_FAILED: "火山方舟 API 鉴权失败，请检查服务端配置。",
  MODEL_UNAVAILABLE: "当前豆包模型不可用或没有访问权限。",
  INSUFFICIENT_BALANCE: "火山方舟账户余额或额度不足，原文案已保留。",
  RATE_LIMITED: "AI 优化请求过多，请稍后重试。",
  INVALID_REQUEST: "火山方舟拒绝了当前优化请求，原文案已保留。",
  REQUEST_TIMEOUT: "AI 优化超时，原文案已保留。",
  NETWORK_ERROR: "服务器无法连接火山方舟，原文案已保留。",
  UPSTREAM_ERROR: "火山方舟服务暂时不可用，原文案已保留。",
  MODEL_OUTPUT_INVALID: "AI 未返回可用的优化结果，原文案已保留。",
};

export async function POST(request: Request) {
  try {
    const parsed = messageOptimizationRequestSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ ok: false, error: { code: "INVALID_REQUEST", message: "AI 优化请求内容无效。" } }, { status: 400 });
    const result = await optimizeMessagesWithVolcengine(parsed.data, request.signal);
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    if (error instanceof MessageOptimizationError) {
      return NextResponse.json({ ok: false, error: { code: error.code, message: messages[error.code] } }, { status: error.status });
    }
    return NextResponse.json({ ok: false, error: { code: "INTERNAL_ERROR", message: "AI 优化失败，原文案已保留。" } }, { status: 500 });
  }
}
