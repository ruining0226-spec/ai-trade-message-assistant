"use client";

import type { FollowUpGenerationResponse } from "@/types";

interface FollowUpGeneratorProps {
  result: FollowUpGenerationResponse;
  saved: boolean;
  saving: boolean;
  generating: boolean;
  onEnglishChange(value: string): void;
  onCopy(): void;
  onSave(): void;
  onRegenerate(): void;
}

function AlertList({ title, items, tone }: { title: string; items: string[]; tone: "warn" | "risk" }) {
  if (!items.length) return null;
  return <div className={`rounded-xl border p-3 ${tone === "risk" ? "border-[#edc9c1] bg-[#fff5f2] text-[#76443a]" : "border-[#ead9b8] bg-[#fffaf0] text-[#76572d]"}`}><div className="text-sm font-black">{title}</div><ul className="mt-2 space-y-1 text-xs leading-5">{items.map((item, index) => <li key={`${item}-${index}`}>• {item}</li>)}</ul></div>;
}

export function FollowUpGenerator({ result, saved, saving, generating, onEnglishChange, onCopy, onSave, onRegenerate }: FollowUpGeneratorProps) {
  return <section className="mt-5 rounded-2xl border border-[#bcded1] bg-[#f6fbf9] p-4 md:p-5"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-black text-[#173d32]">AI 建议回复</h3><span className="badge">未经确认不会写入时间线</span></div>
    <div className="mt-4 grid gap-4 lg:grid-cols-2"><label><span className="label">英文建议回复</span><textarea className="field min-h-40 leading-6" value={result.replyEnglish} onChange={event => onEnglishChange(event.target.value)} /></label><div><div className="label">中文翻译</div><div className="min-h-40 whitespace-pre-wrap break-words rounded-xl border border-[#dce5e1] bg-white p-3 text-sm leading-6">{result.replyChinese}</div></div></div>
    <div className="mt-4 grid gap-3 md:grid-cols-2"><div className="rounded-xl bg-white p-3"><div className="text-xs font-black uppercase tracking-wide text-[#087a5b]">客户意图</div><p className="mt-2 text-sm leading-6">{result.customerIntent}</p></div><div className="rounded-xl bg-white p-3"><div className="text-xs font-black uppercase tracking-wide text-[#087a5b]">下一步建议</div><p className="mt-2 text-sm leading-6">{result.nextAction}</p></div></div>
    <div className="mt-3 grid gap-3 md:grid-cols-2"><AlertList title="待确认信息" items={result.missingInformation} tone="warn" /><AlertList title="风险提示" items={result.riskWarnings} tone="risk" /></div>
    {(result.missingInformation.length > 0 || result.riskWarnings.length > 0) && <details className="mt-3 rounded-xl border border-[#dce5e1] bg-white p-3"><summary className="cursor-pointer text-sm font-black">查看安全过渡回复</summary><div className="mt-3 grid gap-3 md:grid-cols-2"><div className="whitespace-pre-wrap break-words text-sm leading-6">{result.safeTransitionReplyEnglish}</div><div className="whitespace-pre-wrap break-words text-sm leading-6 muted">{result.safeTransitionReplyChinese}</div></div></details>}
    <div className="mt-4 flex flex-wrap gap-2"><button type="button" className="btn-secondary" onClick={onCopy}>复制英文回复</button><button type="button" className="btn-secondary" disabled={generating} onClick={onRegenerate}>{generating ? "AI 正在重新生成…" : "重新生成"}</button><button type="button" className="btn-primary" disabled={saved || saving || !result.replyEnglish.trim()} onClick={onSave}>{saved ? "已保存为我方已发送消息" : saving ? "正在保存…" : "保存为我方已发送消息"}</button></div>
  </section>;
}
