import { NextResponse } from "next/server";
import { FollowUpGenerationError, followUpGenerationRequestSchema, generateFollowUpWithVolcengine } from "@/lib/follow-up/volcengine";

export const runtime = "nodejs";
export const maxDuration = 90;

const messages: Record<FollowUpGenerationError["code"], string> = {
  CONFIG_MISSING: "尚未配置火山方舟 API，无法生成后续回复。",
  AUTH_FAILED: "火山方舟 API 鉴权失败，请检查服务端配置。",
  MODEL_UNAVAILABLE: "当前豆包模型不可用或没有访问权限。",
  INSUFFICIENT_BALANCE: "火山方舟账户余额或额度不足，输入内容已保留。",
  RATE_LIMITED: "后续回复请求过多，请稍后重试。",
  INVALID_REQUEST: "当前客户的跟进信息不完整或任务绑定无效。",
  REQUEST_TIMEOUT: "AI 生成后续回复超时，输入内容已保留。",
  NETWORK_ERROR: "服务器无法连接火山方舟，输入内容已保留。",
  UPSTREAM_ERROR: "火山方舟服务暂时不可用，输入内容已保留。",
  MODEL_OUTPUT_INVALID: "AI 未返回可用的结构化回复，请重试。",
};

export async function POST(request: Request) {
  try {
    const parsed = followUpGenerationRequestSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ ok: false, error: { code: "INVALID_REQUEST", message: messages.INVALID_REQUEST } }, { status: 400 });
    const result = await generateFollowUpWithVolcengine(parsed.data, request.signal);
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    if (error instanceof FollowUpGenerationError) {
      return NextResponse.json({ ok: false, error: { code: error.code, message: messages[error.code] } }, { status: error.status });
    }
    return NextResponse.json({ ok: false, error: { code: "UPSTREAM_ERROR", message: messages.UPSTREAM_ERROR } }, { status: 500 });
  }
}
