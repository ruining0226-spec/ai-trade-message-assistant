"use client";

import { useState } from "react";
import { ConversationTimeline } from "@/components/task/conversation-timeline";
import { FollowUpGenerator } from "@/components/task/follow-up-generator";
import {
  appendConversationMessage,
  appendFollowUpGeneration,
  buildFollowUpGenerationRequest,
  CONVERSATION_PLATFORMS,
  CUSTOMER_STAGES,
  FOLLOW_UP_TONES,
  normalizeConversationMessages,
  normalizeFollowUpGenerations,
  PLATFORM_LABELS,
  removeConversationMessage,
  REPLY_GOALS,
  STAGE_LABELS,
  updateFollowUpGeneration,
} from "@/lib/follow-up/context";
import { createId } from "@/lib/utils";
import type { ConversationMessage, ConversationPlatform, ConversationRole, FollowUpGeneration, FollowUpGenerationResponse, FollowUpTone, ReplyGoal, Task } from "@/types";

function isGenerationResult(value: unknown): value is FollowUpGenerationResponse {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return ["replyEnglish", "replyChinese", "customerIntent", "nextAction", "safeTransitionReplyEnglish", "safeTransitionReplyChinese"].every(key => typeof item[key] === "string")
    && Array.isArray(item.missingInformation) && item.missingInformation.every(entry => typeof entry === "string")
    && Array.isArray(item.riskWarnings) && item.riskWarnings.every(entry => typeof entry === "string");
}

function generationToResult(generation: FollowUpGeneration): FollowUpGenerationResponse {
  return {
    replyEnglish: generation.englishReply,
    replyChinese: generation.chineseTranslation,
    customerIntent: generation.customerIntent,
    nextAction: generation.nextAction,
    missingInformation: generation.missingInformation,
    riskWarnings: generation.riskWarnings,
    safeTransitionReplyEnglish: generation.safeTransitionReplyEnglish,
    safeTransitionReplyChinese: generation.safeTransitionReplyChinese,
  };
}

export function CustomerFollowUp({ task, onUpdate, onBack }: { task: Task; onUpdate(task: Task): boolean; onBack(): void }) {
  const messages = normalizeConversationMessages(task.conversationMessages, task.id);
  const generations = normalizeFollowUpGenerations(task.followUpGenerations, task.id);
  const latestGeneration = generations.at(-1);
  const [role, setRole] = useState<ConversationRole>("customer");
  const [platform, setPlatform] = useState<ConversationPlatform>(task.config.channel.toLowerCase() as ConversationPlatform);
  const [content, setContent] = useState("");
  const [replyGoal, setReplyGoal] = useState<ReplyGoal>(latestGeneration?.replyGoal || "了解需求");
  const [customReplyGoal, setCustomReplyGoal] = useState(latestGeneration?.customReplyGoal || "");
  const [tone, setTone] = useState<FollowUpTone>(latestGeneration?.tone || "专业");
  const [businessFacts, setBusinessFacts] = useState(latestGeneration?.businessFacts || "");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [generating, setGenerating] = useState(false);
  const [savingMessage, setSavingMessage] = useState(false);
  const [savingGenerated, setSavingGenerated] = useState(false);
  const [activeGenerationId, setActiveGenerationId] = useState(latestGeneration?.id || "");
  const [generatedSaved, setGeneratedSaved] = useState(Boolean(latestGeneration && messages.some(message => message.followUpGenerationId === latestGeneration.id)));
  const [result, setResult] = useState<FollowUpGenerationResponse | null>(latestGeneration ? generationToResult(latestGeneration) : null);

  const notify = (message: string) => { setNotice(message); window.setTimeout(() => setNotice(""), 2200); };
  const persist = (nextTask: Task, successMessage?: string) => {
    if (!onUpdate(nextTask)) { setError("本地保存失败，浏览器存储空间可能已满。当前内容尚未可靠保存，请清理空间后重试。"); return false; }
    if (successMessage) notify(successMessage);
    return true;
  };

  const updateStage = (stage: Task["followUpStage"]) => {
    persist({ ...task, followUpStage: stage, updatedAt: new Date().toISOString() }, "跟进阶段已保存");
  };

  const saveMessage = () => {
    if (savingMessage || !content.trim()) { if (!content.trim()) setError("请输入要保存的沟通内容。"); return; }
    setSavingMessage(true); setError("");
    const message: ConversationMessage = { id: createId(), taskId: task.id, role, platform, content: content.trim(), createdAt: new Date().toISOString() };
    if (persist(appendConversationMessage(task, message), `消息已保存到 ${task.customer.name || "未确认客户"}`)) setContent("");
    setSavingMessage(false);
  };

  const deleteMessage = (message: ConversationMessage) => {
    if (message.taskId !== task.id || !window.confirm(`确认删除这条${message.role === "customer" ? "客户" : "我方"}消息吗？删除后无法恢复。`)) return;
    persist(removeConversationMessage(task, message), "错误记录已删除");
  };

  const generate = async () => {
    if (generating) return;
    if (replyGoal === "自定义" && !customReplyGoal.trim()) { setError("请填写自定义回复目标。"); return; }
    const unsavedCustomerReply = role === "customer" ? content.trim() : "";
    const latestCustomerReply = unsavedCustomerReply || [...messages].reverse().find(message => message.role === "customer")?.content || "";
    if (!latestCustomerReply) { setError("请先输入或保存该客户的最新回复，再生成建议回复。"); return; }
    const request = buildFollowUpGenerationRequest(task, { replyGoal, customReplyGoal, tone, businessFacts, latestCustomerReply });
    setGenerating(true); setError(""); setGeneratedSaved(false);
    try {
      const response = await fetch("/api/generate-follow-up-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(request),
      });
      const payload = await response.json() as { ok?: boolean; result?: unknown; error?: { message?: string } };
      if (!response.ok || !payload.ok || !isGenerationResult(payload.result)) throw new Error(payload.error?.message || "AI 未返回可用的结构化回复。");
      const now = new Date().toISOString();
      const generation: FollowUpGeneration = {
        id: createId(), taskId: task.id, sourceMessageIds: request.messages.map(message => message.id), replyGoal, customReplyGoal: customReplyGoal.trim(), tone, businessFacts: businessFacts.trim(),
        englishReply: payload.result.replyEnglish, chineseTranslation: payload.result.replyChinese, customerIntent: payload.result.customerIntent, nextAction: payload.result.nextAction,
        missingInformation: payload.result.missingInformation, riskWarnings: payload.result.riskWarnings, safeTransitionReplyEnglish: payload.result.safeTransitionReplyEnglish, safeTransitionReplyChinese: payload.result.safeTransitionReplyChinese,
        createdAt: now, updatedAt: now,
      };
      setResult(payload.result); setActiveGenerationId(generation.id);
      if (persist(appendFollowUpGeneration(task, generation), "AI 建议已保存到当前任务，请确认后再标记为已发送")) setGeneratedSaved(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "AI 生成失败，输入内容已保留。");
    } finally {
      setGenerating(false);
    }
  };

  const copyReply = async () => {
    if (!result) return;
    try { await navigator.clipboard.writeText(result.replyEnglish); notify("英文建议回复已复制"); }
    catch { setError("浏览器阻止了复制，请手动选择文本复制。"); }
  };

  const saveGeneratedReply = () => {
    if (!result || !activeGenerationId || generatedSaved || savingGenerated || !result.replyEnglish.trim()) return;
    const generation = normalizeFollowUpGenerations(task.followUpGenerations, task.id).find(item => item.id === activeGenerationId);
    if (!generation) { setError("没有找到对应的 AI 生成记录，请重新生成后再保存。"); return; }
    setSavingGenerated(true);
    const updatedGeneration: FollowUpGeneration = { ...generation, englishReply: result.replyEnglish.trim(), updatedAt: new Date().toISOString() };
    const taskWithEditedGeneration = updateFollowUpGeneration(task, updatedGeneration);
    const message: ConversationMessage = { id: createId(), taskId: task.id, role: "salesperson", platform, content: updatedGeneration.englishReply, createdAt: new Date().toISOString(), followUpGenerationId: generation.id };
    if (persist(appendConversationMessage(taskWithEditedGeneration, message), `已保存为 ${task.customer.name || "未确认客户"} 的我方已发送消息`)) setGeneratedSaved(true);
    setSavingGenerated(false);
  };

  const lastContactLabel = task.lastContactAt ? new Date(task.lastContactAt).toLocaleString("zh-CN") : "暂无沟通记录";
  return <div className="min-w-0 space-y-5">
    <section className="card sticky top-2 z-20 border-[#bcded1] p-4 shadow-md md:p-5"><div className="flex flex-col justify-between gap-3 md:flex-row md:items-start"><div className="min-w-0"><div className="text-xs font-black uppercase tracking-wider text-[#087a5b]">当前跟进客户</div><h2 className="mt-1 break-words text-xl font-black text-[#173d32]">{task.customer.name || "未确认"} · {task.customer.companyName || "未确认"}</h2><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#53645e]"><span>国家：{task.customer.country || "未确认"}</span><span>当前阶段：{STAGE_LABELS[task.followUpStage]}</span><span>最后沟通：{lastContactLabel}</span><span>Task ID：{task.id}</span></div></div><button className="btn-secondary" onClick={onBack}>返回生成结果</button></div></section>
    {error && <div className="rounded-xl border border-[#edc9c1] bg-[#fff5f2] px-4 py-3 text-sm font-semibold text-[#983d2c]">{error}</div>}
    {notice && <div className="rounded-xl border border-[#bcded1] bg-[#eff8f4] px-4 py-3 text-sm font-bold text-[#075f49]">✓ {notice}</div>}
    <section className="card p-5 md:p-7"><div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="section-title">客户沟通与持续跟进</h2><p className="mt-1 text-sm muted">所有记录仅保存到 {task.customer.name || "未确认"} · {task.customer.companyName || "未确认"}（Task ID：{task.id}）</p></div><span className="badge">{messages.length} 条记录</span></div><div className="mt-5"><ConversationTimeline messages={messages} onDelete={deleteMessage} /></div></section>
    <section className="card p-5 md:p-7"><h2 className="section-title">添加沟通记录并生成回复</h2><p className="mt-1 text-sm muted">当前操作对象：{task.customer.name || "未确认"} · {task.customer.companyName || "未确认"}。切换任务后临时输入和 AI 结果会随组件重新初始化。</p>
      <div className="mt-5 grid min-w-0 gap-4 md:grid-cols-2"><label><span className="label">当前跟进阶段</span><select className="field" value={task.followUpStage} onChange={event => updateStage(event.target.value as Task["followUpStage"])}>{CUSTOMER_STAGES.map(stage => <option key={stage} value={stage}>{STAGE_LABELS[stage]}</option>)}</select></label><label><span className="label">消息角色</span><select className="field" value={role} onChange={event => setRole(event.target.value as ConversationRole)}><option value="customer">客户消息</option><option value="salesperson">我方消息</option></select></label><label><span className="label">沟通平台</span><select className="field" value={platform} onChange={event => setPlatform(event.target.value as ConversationPlatform)}>{CONVERSATION_PLATFORMS.map(item => <option key={item} value={item}>{PLATFORM_LABELS[item]}</option>)}</select></label><label><span className="label">当前回复目标</span><select className="field" value={replyGoal} onChange={event => setReplyGoal(event.target.value as ReplyGoal)}>{REPLY_GOALS.map(item => <option key={item}>{item}</option>)}</select></label>{replyGoal === "自定义" && <label className="md:col-span-2"><span className="label">自定义回复目标</span><input className="field" value={customReplyGoal} placeholder="请明确本次希望推动的下一步" onChange={event => setCustomReplyGoal(event.target.value)} /></label>}<label><span className="label">回复语气</span><select className="field" value={tone} onChange={event => setTone(event.target.value as FollowUpTone)}>{FOLLOW_UP_TONES.map(item => <option key={item}>{item}</option>)}</select></label><label className="md:col-span-2"><span className="label">业务员补充的真实信息</span><textarea className="field" rows={3} value={businessFacts} placeholder="只填写已经确认的产品、项目或服务事实；不要粘贴其他客户信息。" onChange={event => setBusinessFacts(event.target.value)} /></label><label className="md:col-span-2"><span className="label">消息正文</span><textarea className="field min-h-32" rows={5} value={content} placeholder={role === "customer" ? "粘贴该客户的最新回复，保存或直接生成建议回复" : "记录我方已经实际发送的消息"} onChange={event => setContent(event.target.value)} /></label></div>
      <div className="mt-4 flex flex-wrap gap-2"><button className="btn-secondary" type="button" disabled={savingMessage || !content.trim()} onClick={saveMessage}>{savingMessage ? "正在保存…" : "保存沟通记录"}</button><button className="btn-primary" type="button" disabled={generating} onClick={generate}>{generating ? "AI 正在生成…" : "生成建议回复"}</button>{generating && <span className="self-center text-xs font-bold text-[#53645e]">正在为 {task.customer.name || "当前客户"} 生成安全回复，请稍候…</span>}</div>
      {result && <FollowUpGenerator result={result} saved={generatedSaved} saving={savingGenerated} generating={generating} onEnglishChange={value => setResult({ ...result, replyEnglish: value })} onCopy={copyReply} onSave={saveGeneratedReply} onRegenerate={generate} />}
    </section>
  </div>;
}
