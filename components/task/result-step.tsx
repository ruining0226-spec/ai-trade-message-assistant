"use client";

import { useState } from "react";
import { AnalysisDetails } from "@/components/task/analysis-details";
import { formatAllBilingual, formatAllEnglish, formatMessageBilingual, formatMessageEnglish, getChannelMessages, updateChannelMessage } from "@/lib/message/channel-messages";
import { QUICK_OPTIMIZATION_REQUIREMENTS, type QuickOptimizationLabel } from "@/lib/message/optimization";
import type { Customer, CustomerAnalysis, GenerationConfig, MessageContent } from "@/types";

interface ResultStepProps {
  draft: MessageContent;
  analysis: CustomerAnalysis;
  customer: Customer;
  setDraft(value: MessageContent): void;
  channel: GenerationConfig["channel"];
  copy(text: string, label: string): void;
  save(): void;
  rewrite(mode: "更简短" | "更加友好" | "更加专业" | "重新生成"): void;
  optimize(customRequirement: string, quickRequirement?: QuickOptimizationLabel): void;
  undo?: () => void;
  optimizing: boolean;
  back(): void;
  onFollowUp(): void;
}

export function ResultStep({ draft, analysis, customer, setDraft, channel, copy, save, rewrite, optimize, undo, optimizing, back, onFollowUp }: ResultStepProps) {
  const [optimizationRequirement, setOptimizationRequirement] = useState("");
  const [quickRequirement, setQuickRequirement] = useState<QuickOptimizationLabel | undefined>();
  const messages = getChannelMessages(draft, channel);
  const rowsFor = (messageId: string, text: string) => messageId === "email-subject" ? 2 : Math.min(9, Math.max(4, Math.ceil(text.length / 95) + 2));
  return <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_310px]"><section className="card min-w-0 p-5 md:p-7"><div className="flex flex-col justify-between gap-4 border-b border-[#e1e8e5] pb-5 sm:flex-row sm:items-start"><div><div className="flex flex-wrap items-center gap-2"><h2 className="section-title">生成结果</h2><span className="badge">已保存至本地</span></div><p className="mt-1 text-sm muted">所有内容都可直接编辑。手动编辑后点击“保存当前结果”。</p></div><button className="btn-secondary" onClick={back}>调整生成条件</button></div>
    <div className="mt-5 flex flex-wrap gap-2"><button className="btn-secondary" onClick={() => copy(formatAllEnglish(messages), "全部英文")}>复制全部英文</button><button className="btn-secondary" onClick={() => copy(formatAllBilingual(messages), "全部中英双语")}>复制全部中英双语</button></div>
    <AnalysisDetails draft={draft} analysis={analysis} disabled={optimizing} onChange={setDraft} />
    <div className="mt-6 space-y-5">{messages.map((message, index) => <section className="min-w-0 rounded-2xl border border-[#dce5e1] bg-[#fbfcfc] p-4 md:p-5" key={message.id}><div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><h3 className="font-black">{index + 4}. {message.title}</h3><div className="flex flex-wrap gap-2"><button className="btn-secondary !min-h-8 !px-3 text-xs" disabled={optimizing} onClick={() => copy(formatMessageEnglish(message), `${message.title}英文`)}>复制英文</button><button className="btn-secondary !min-h-8 !px-3 text-xs" disabled={optimizing} onClick={() => copy(formatMessageBilingual(message), `${message.title}中英双语`)}>复制中英双语</button></div></div><label className="block"><span className="mb-2 inline-flex rounded-full bg-[#e8efec] px-2.5 py-1 text-xs font-bold text-[#41564e]">英文</span><textarea className="field leading-6" rows={rowsFor(message.id, message.english)} value={message.english} disabled={optimizing} onChange={event => setDraft(updateChannelMessage(draft, channel, index, "english", event.target.value))} /></label><label className="mt-3 block"><span className="mb-2 inline-flex rounded-full bg-[#dfeee8] px-2.5 py-1 text-xs font-bold text-[#23614f]">中文翻译</span><textarea className="field !bg-[#f1f7f4] leading-6" rows={rowsFor(message.id, message.chinese)} value={message.chinese} disabled={optimizing} onChange={event => setDraft(updateChannelMessage(draft, channel, index, "chinese", event.target.value))} /></label></section>)}</div>
    <div className="mt-7 rounded-xl border border-[#d9e5e0] bg-[#fafcfc] p-4"><div className="font-black">AI 文案优化</div><p className="mt-1 text-xs leading-5 muted">只优化当前可发送文案及中文翻译，不会重新分析截图或修改客户事实。</p><textarea className="field mt-3" rows={3} placeholder="告诉AI你希望怎样修改当前文案……" value={optimizationRequirement} disabled={optimizing} onChange={event => setOptimizationRequirement(event.target.value)} /><div className="mt-3 flex flex-wrap gap-2">{(Object.keys(QUICK_OPTIMIZATION_REQUIREMENTS) as QuickOptimizationLabel[]).map(label => <button type="button" className={`btn-secondary !min-h-9 !px-3 text-xs ${quickRequirement === label ? "border-[#087a5b] bg-[#eff8f4] text-[#075f49]" : ""}`} key={label} disabled={optimizing} onClick={() => setQuickRequirement(current => current === label ? undefined : label)}>{label}</button>)}</div><div className="mt-4 flex flex-wrap items-center gap-2"><button className="btn-primary" disabled={optimizing || (!optimizationRequirement.trim() && !quickRequirement)} onClick={() => optimize(optimizationRequirement, quickRequirement)}>{optimizing ? "AI正在优化…" : "AI优化"}</button>{undo && <button className="btn-secondary" disabled={optimizing} onClick={undo}>撤销本次优化</button>}{optimizing && <span className="text-xs font-bold text-[#53645e]">正在调用豆包优化当前文案，请稍候…</span>}</div></div>
    <div className="sticky bottom-3 mt-4 flex flex-wrap gap-2 rounded-xl border border-[#d9e5e0] bg-white/95 p-3 shadow-lg backdrop-blur"><button className="btn-primary" disabled={optimizing} onClick={save}>保存当前结果</button><button className="btn-secondary" disabled={optimizing} onClick={() => rewrite("重新生成")}>重新生成</button><button className="btn-secondary sm:ml-auto" disabled={optimizing} onClick={onFollowUp}>继续跟进该客户</button></div>
  </section>
  <aside><div className="card p-5"><h3 className="font-black">写作护栏</h3><p className="mt-2 text-xs font-bold text-[#087a5b]">当前客户：{customer.name || "未命名客户"}</p><ul className="mt-3 space-y-2 text-xs leading-5 muted"><li>• 先谈客户业务，再连接用气场景</li><li>• 不把潜在需求写成已确认事实</li><li>• 不虚构参数、认证与合作关系</li><li>• 用自然问题开启下一步交流</li></ul></div></aside>
  </div>;
}
