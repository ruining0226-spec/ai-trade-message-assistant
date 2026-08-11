"use client";

import { PLATFORM_LABELS } from "@/lib/follow-up/context";
import type { ConversationMessage } from "@/types";

export function ConversationTimeline({ messages, onDelete }: { messages: ConversationMessage[]; onDelete(message: ConversationMessage): void }) {
  if (!messages.length) return <div className="rounded-xl border border-dashed border-[#ccd9d4] bg-[#fafcfc] p-6 text-center text-sm muted">还没有沟通记录。先保存客户最新消息或我方已发送内容。</div>;
  return <div className="space-y-3">{messages.map(message => {
    const isCustomer = message.role === "customer";
    return <article key={message.id} className={`min-w-0 rounded-2xl border p-4 ${isCustomer ? "border-[#d7e2de] bg-white" : "border-[#bcded1] bg-[#eff8f4]"}`}>
      <div className="flex flex-wrap items-start justify-between gap-2"><div className="flex flex-wrap items-center gap-2"><span className={`badge ${isCustomer ? "" : "bg-[#d4eee4] text-[#075f49]"}`}>{isCustomer ? "客户消息" : "我方消息"}</span><span className="text-xs font-bold text-[#53645e]">{PLATFORM_LABELS[message.platform]}</span><time className="text-xs muted" dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleString("zh-CN")}</time></div><button type="button" className="btn-quiet !min-h-8 !px-2 text-xs text-[#983d2c]" onClick={() => onDelete(message)}>删除</button></div>
      <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-[#243d35]">{message.content}</p>
    </article>;
  })}</div>;
}
