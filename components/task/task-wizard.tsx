"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useAppData } from "@/components/providers/app-data-provider";
import { CustomerFollowUp } from "@/components/task/customer-follow-up";
import { ResultStep } from "@/components/task/result-step";
import { PageHeader } from "@/components/ui/page-header";
import { createVersion } from "@/lib/mock/generator";
import { applyOptimizationResult, buildOptimizationRequest, createOptimizationSnapshot, restoreOptimizationSnapshot, toSingleResultStorage } from "@/lib/message/optimization";
import { getLastContactAt, normalizeConversationMessages, normalizeFollowUpGenerations, normalizeFollowUpStage } from "@/lib/follow-up/context";
import { applyManualConfirmation, CONFIRMATION_NEXT_STEP, CUSTOMER_DETAILS_DEFAULT_OPEN, getConfirmationRisks, getConfirmationStatus, getCustomerSummary, setConfirmationUnknown, type ConfirmationFieldKey } from "@/lib/customer/confirmation";
import { assertPreparedUpload, ClientImageError, postPreparedImages, prepareClientImages, toPersistedImageMetadata } from "@/lib/vision/client-images";
import { MAX_IMAGE_COUNT, MAX_PREPARED_IMAGE_BYTES, MAX_PREPARED_TOTAL_BYTES } from "@/lib/vision/limits";
import { defaultConfig, demoAnalysis, demoCustomer } from "@/lib/mock/defaults";
import { createId } from "@/lib/utils";
import type { AnalysisSource, Confidence, Customer, CustomerAnalysis, CustomerAnalysisResponse, CustomerType, CustomerTypeCode, FieldSource, GenerationConfig, MessageContent, MessageOptimizationResponse, MessageVersion, StructuredField, Task, TaskImage } from "@/types";
import type { QuickOptimizationLabel } from "@/lib/message/optimization";

const steps = ["上传截图", "确认客户资料", "配置开发信", "生成与编辑"];
const fieldClass = "field";
type AnalysisMode = "checking" | "volcengine" | "mock";
const CONFIG_CHECK_TIMEOUT_MS = 8_000;
const customerTypeLabels: Record<CustomerTypeCode, CustomerType> = {
  distributor: "经销商", agent: "代理商", end_user_factory: "终端工厂", oem_integrator: "设备集成商",
  service_provider: "服务商", unknown: "无法判断",
};
const confidenceLabels: Record<Confidence, string> = { high: "高置信度", medium: "中等置信度", low: "低置信度" };
const sourceLabels: Record<FieldSource, string> = { screenshot: "截图事实", inference: "AI推测", unknown: "无法确认" };

export function TaskWizard({ taskId, initialFollowUp = false }: { taskId?: string; initialFollowUp?: boolean }) {
  const router = useRouter();
  const { tasks, hydrated, storageError, clearStorageError, upsertTask } = useAppData();
  const [step, setStep] = useState(1);
  const [images, setImages] = useState<TaskImage[]>([]);
  const [customer, setCustomer] = useState<Customer>({ ...demoCustomer, id: createId() });
  const [analysis, setAnalysis] = useState<CustomerAnalysis>({ ...demoAnalysis });
  const [analysisSource, setAnalysisSource] = useState<AnalysisSource>("mock");
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>("checking");
  const [modeMessage, setModeMessage] = useState("正在检查视觉 AI 配置…");
  const [configChecking, setConfigChecking] = useState(true);
  const [configCheckFailed, setConfigCheckFailed] = useState(false);
  const [analysisStage, setAnalysisStage] = useState("");
  const [analysisFailed, setAnalysisFailed] = useState(false);
  const [config, setConfig] = useState<GenerationConfig>({ ...defaultConfig });
  const [currentVersion, setCurrentVersion] = useState<MessageVersion | null>(null);
  const [draft, setDraft] = useState<MessageContent | null>(null);
  const [optimizationUndo, setOptimizationUndo] = useState<MessageContent | null>(null);
  const [optimizing, setOptimizing] = useState(false);
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [activeTaskId, setActiveTaskId] = useState(taskId || "");
  const [createdAt, setCreatedAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [preparingImages, setPreparingImages] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const loaded = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const configCheckAbortRef = useRef<AbortController | null>(null);
  const configCheckRunRef = useRef(0);

  const checkVisionConfig = useCallback(async () => {
    const runId = ++configCheckRunRef.current;
    configCheckAbortRef.current?.abort();
    const controller = new AbortController();
    configCheckAbortRef.current = controller;
    setConfigChecking(true);
    setConfigCheckFailed(false);
    setAnalysisMode("checking");
    setModeMessage("正在检查视觉 AI 配置…");
    const timeout = window.setTimeout(() => controller.abort(), CONFIG_CHECK_TIMEOUT_MS);

    try {
      const response = await fetch("/api/analyze-customer", {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`配置接口返回 ${response.status}`);
      const result: unknown = await response.json();
      if (!result || typeof result !== "object" || !("mode" in result) || (result.mode !== "volcengine" && result.mode !== "mock")) {
        throw new Error("配置接口返回格式无效");
      }
      if (configCheckRunRef.current !== runId) return;
      setAnalysisMode(result.mode);
      setModeMessage(
        "message" in result && typeof result.message === "string"
          ? result.message
          : result.mode === "volcengine"
            ? "已配置火山方舟视觉 AI。"
            : "尚未配置豆包/火山引擎API，当前使用演示分析。",
      );
    } catch (caught) {
      if (configCheckRunRef.current !== runId) return;
      const timedOut = controller.signal.aborted;
      setAnalysisMode("mock");
      setConfigCheckFailed(true);
      setModeMessage(timedOut
        ? "视觉 AI 配置检查超时，当前已切换为演示模式。请确认使用 localhost:3000 访问或稍后重新检查。"
        : "无法读取视觉 AI 配置，当前已切换为演示模式。可继续使用模拟分析或重新检查。");
      if (!(caught instanceof DOMException && caught.name === "AbortError")) console.warn("Vision configuration check failed.");
    } finally {
      window.clearTimeout(timeout);
      if (configCheckRunRef.current === runId) {
        configCheckAbortRef.current = null;
        setConfigChecking(false);
      }
    }
  }, []);

  useEffect(() => {
    const startTimer = window.setTimeout(() => { void checkVisionConfig(); }, 0);
    return () => {
      window.clearTimeout(startTimer);
      configCheckRunRef.current += 1;
      configCheckAbortRef.current?.abort();
      abortRef.current?.abort();
    };
  }, [checkVisionConfig]);

  useEffect(() => {
    if (!hydrated || loaded.current) return;
    loaded.current = true;
    if (!taskId) return;
    const task = tasks.find(item => item.id === taskId);
    if (!task) {
      // Load the requested task only after the storage provider has hydrated.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError("没有找到该历史任务，已为你打开新任务。"); return;
    }
    setActiveTaskId(task.id); setCreatedAt(task.createdAt); setCustomer(task.customer); setAnalysis(task.analysis); setAnalysisSource(task.analysisSource || "legacy"); setConfig(task.config); setImages(task.images);
    const version = task.versions[0]; setCurrentVersion(version || null);
    setDraft(version?.content || null); setStep(version ? 4 : 2); setFollowUpOpen(Boolean(version && initialFollowUp));
  }, [hydrated, initialFollowUp, taskId, tasks]);
  const notify = (text: string) => { setToast(text); window.setTimeout(() => setToast(""), 2200); };

  const acceptFiles = async (files: FileList | File[]) => {
    if (preparingImages) return;
    setError(""); setPreparingImages(true);
    try {
      const prepared = await prepareClientImages(Array.from(files), {
        existingCount: images.length,
        existingBytes: images.reduce((sum, image) => sum + image.size, 0),
      });
      const valid: TaskImage[] = prepared.map(file => ({ id: createId(), name: file.name, type: file.type, size: file.size, previewUrl: URL.createObjectURL(file), file }));
      setImages(current => [...current, ...valid]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "图片处理失败，请重新选择。");
    } finally {
      setPreparingImages(false);
    }
  };

  const applyAnalysis = (result: CustomerAnalysisResponse, source: AnalysisSource) => {
    const fields = result.customer;
    const screenshotEvidence = [
      ["客户姓名", fields.customerName], ["职位", fields.jobTitle], ["公司名称", fields.companyName],
      ["国家或地区", fields.countryOrRegion], ["行业", fields.industry], ["公司业务", result.companyBusiness],
    ] as const;
    const reviewItems = screenshotEvidence.filter(([, field]) => field.needsReview).map(([label, field]) => `${label}：${field.evidence}`);
    setCustomer(current => ({
      ...current,
      name: fields.customerName.value || "",
      title: fields.jobTitle.value || "",
      companyName: fields.companyName.value || "",
      country: fields.countryOrRegion.value || "",
      industry: fields.industry.value || "",
      customerType: fields.customerType.value ? customerTypeLabels[fields.customerType.value] : "无法判断",
    }));
    setAnalysis({
      mainBusiness: result.companyBusiness.value || "",
      decisionInfluence: result.decisionInfluence.value || "无法判断",
      potentialApplications: result.inferences.map(item => item.content).join("；"),
      recommendedAngle: result.recommendedApproach.join("；"),
      completeness: result.completenessScore,
      uncertainties: reviewItems.join("\n"),
      conflicts: result.conflicts,
      evidence: [],
      structuredFields: fields,
      companyBusinessField: result.companyBusiness,
      decisionInfluenceField: result.decisionInfluence,
      inferences: result.inferences,
      generatedOutreach: result.outreach,
    });
    setAnalysisSource(source); setAnalysisStage("分析完成"); setAnalysisFailed(false); setStep(2);
  };

  const runDemoAnalysis = () => {
    setBusy(true); setError(""); setAnalysisStage("正在整理演示资料");
    window.setTimeout(() => {
      setCustomer(current => ({ ...demoCustomer, id: current.id })); setAnalysis({ ...demoAnalysis, conflicts: [...demoAnalysis.conflicts], evidence: [...demoAnalysis.evidence] });
      setAnalysisSource("mock"); setAnalysisStage("分析完成"); setAnalysisFailed(false); setBusy(false); setStep(2);
    }, 500);
  };

  const analyze = async () => {
    if (!images.length) { setError("请至少上传一张客户或公司截图。演示时可上传任意合规图片。"); return; }
    if (configChecking || analysisMode === "checking") { setError("正在检查视觉 AI 配置，请稍候。 "); return; }
    if (analysisMode === "mock") { runDemoAnalysis(); return; }
    const files = images.map(image => image.file).filter((file): file is File => Boolean(file));
    if (files.length !== images.length) { setError("历史任务只保存图片元数据，请重新上传原图后再分析。"); return; }
    try { assertPreparedUpload(files); }
    catch (caught) { setError(caught instanceof ClientImageError ? caught.message : "图片无法提交，请重新选择。"); return; }
    setBusy(true); setError("");
    setAnalysisFailed(false); setAnalysisStage("正在上传截图");
    const controller = new AbortController(); abortRef.current = controller;
    const requestId = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : createId();
    const stageTimers = [
      window.setTimeout(() => setAnalysisStage("正在识别图片文字"), 700),
      window.setTimeout(() => setAnalysisStage("正在分析客户与公司"), 2200),
      window.setTimeout(() => setAnalysisStage("正在整理结构化资料"), 5000),
    ];
    try {
      const response = await postPreparedImages(files, requestId, controller.signal);
      const payload = await response.json() as { ok?: boolean; analysis?: CustomerAnalysisResponse; error?: { message?: string } };
      if (!response.ok || !payload.ok || !payload.analysis) throw new Error(payload.error?.message || "客户截图分析失败，请稍后重试。");
      applyAnalysis(payload.analysis, "volcengine");
    } catch (caught) {
      const cancelled = caught instanceof DOMException && caught.name === "AbortError";
      setAnalysisStage("分析失败"); setAnalysisFailed(!cancelled); setError(cancelled ? "已取消本次分析，已上传图片仍然保留。" : caught instanceof Error ? caught.message : "客户截图分析失败，请稍后重试。");
    } finally {
      stageTimers.forEach(window.clearTimeout); abortRef.current = null; setBusy(false);
    }
  };

  const confirmCustomer = () => {
    const status = getConfirmationStatus(customer, getConfirmationRisks(customer, analysis));
    if (!status.canContinue) { setError("请至少补充客户姓名、职位、公司名称或行业中的一项，再继续生成开发信。"); return; }
    setConfig(c => ({ ...c, customerType: customer.customerType })); setError(""); setStep(CONFIRMATION_NEXT_STEP);
  };

  const makeTask = (result: MessageVersion | null): Task => {
    const now = new Date().toISOString();
    const id = activeTaskId || createId();
    const existing = tasks.find(item => item.id === id);
    const conversationMessages = normalizeConversationMessages(existing?.conversationMessages, id);
    return { id, customer, analysis, analysisSource, images: toPersistedImageMetadata(images), config, ...toSingleResultStorage(result), createdAt: createdAt || now, updatedAt: now, status: existing?.status || "已生成", followUpDate: existing?.followUpDate || "", notes: existing?.notes || "", followUps: existing?.followUps || [], conversationMessages, followUpGenerations: normalizeFollowUpGenerations(existing?.followUpGenerations, id), followUpStage: normalizeFollowUpStage(existing?.followUpStage), lastContactAt: existing?.lastContactAt || getLastContactAt(conversationMessages) };
  };

  // Single-result persistence boundary. Future AI optimization can replace the result here without introducing history state.
  const persistCurrentResult = (result: MessageVersion, nextConfig = config) => {
    setCurrentVersion(result); setDraft(result.content); setConfig(nextConfig);
    const task = { ...makeTask(result), config: nextConfig };
    setActiveTaskId(task.id); setCreatedAt(task.createdAt);
    if (!upsertTask(task)) setError("本地保存失败，当前结果尚未可靠写入浏览器，请检查存储空间后重试。");
    return task;
  };

  const generate = () => {
    setBusy(true);
    setOptimizationUndo(null);
    window.setTimeout(() => { const result = createVersion(customer, analysis, config, currentVersion ? "重新生成" : "初次生成"); persistCurrentResult(result); setBusy(false); setStep(4); notify("开发信已生成并保存"); }, 700);
  };

  const simulatedRewrite = (mode: "更简短" | "更加友好" | "更加专业" | "重新生成") => {
    setOptimizationUndo(null);
    const nextConfig: GenerationConfig = { ...config, length: mode === "更简短" ? "极简" : config.length, tone: mode === "更加友好" ? "友好简短" : mode === "更加专业" ? "专业正式" : config.tone };
    const result = createVersion(customer, analysis, nextConfig, mode); persistCurrentResult(result, nextConfig); notify(`${mode}结果已更新`);
  };

  const saveDraft = () => {
    if (!draft) return;
    const now = new Date().toISOString();
    const result: MessageVersion = { id: currentVersion?.id || createId(), label: "当前结果", createdAt: currentVersion?.createdAt || now, reason: "手动编辑保存", content: { ...draft } };
    persistCurrentResult(result); notify("当前编辑已保存");
  };

  const optimizeCurrent = async (customRequirement: string, quickRequirement?: QuickOptimizationLabel) => {
    if (!draft || optimizing) return;
    const request = buildOptimizationRequest(draft, config.channel, customer, analysis, customRequirement, quickRequirement);
    if (!request.requirement) { setError("请输入修改要求，或选择一个快捷要求。"); return; }
    const before = createOptimizationSnapshot(draft);
    setOptimizing(true); setError("");
    try {
      const response = await fetch("/api/optimize-message", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(request),
      });
      const payload = await response.json() as { ok?: boolean; result?: MessageOptimizationResponse; error?: { message?: string } };
      if (!response.ok || !payload.ok || !payload.result) throw new Error(payload.error?.message || "AI 优化失败，原文案已保留。");
      const content = applyOptimizationResult(draft, config.channel, payload.result);
      const now = new Date().toISOString();
      const result: MessageVersion = { id: currentVersion?.id || createId(), label: "当前结果", createdAt: currentVersion?.createdAt || now, reason: "AI优化", content };
      setOptimizationUndo(before); persistCurrentResult(result); notify("AI 优化完成，当前结果已更新");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "AI 优化失败，原文案已保留。");
    } finally {
      setOptimizing(false);
    }
  };

  const undoOptimization = () => {
    if (!optimizationUndo) return;
    const now = new Date().toISOString();
    const content = restoreOptimizationSnapshot(optimizationUndo);
    const result: MessageVersion = { id: currentVersion?.id || createId(), label: "当前结果", createdAt: currentVersion?.createdAt || now, reason: "撤销AI优化", content };
    persistCurrentResult(result); setOptimizationUndo(null); notify("已撤销本次 AI 优化");
  };

  const copy = async (text: string, label: string) => {
    try { await navigator.clipboard.writeText(text); notify(`${label}已复制`); }
    catch { setError("浏览器阻止了复制，请选中文本后手动复制。"); }
  };

  const openFollowUp = () => {
    if (!activeTaskId) { setError("请先保存当前结果，再进入客户持续跟进。"); return; }
    setFollowUpOpen(true);
    router.replace(`/tasks/new?id=${activeTaskId}&followUp=1`);
  };

  const closeFollowUp = () => {
    setFollowUpOpen(false);
    router.replace(`/tasks/new?id=${activeTaskId}`);
  };

  const activeTask = tasks.find(item => item.id === activeTaskId);
  if (followUpOpen && activeTask) return <>
    <PageHeader eyebrow="Customer follow-up" title={`持续跟进：${activeTask.customer.name || "未命名客户"}`} description="记录单一客户的沟通时间线，并基于当前任务上下文生成安全的后续回复。" action={<button className="btn-secondary" onClick={() => router.push("/tasks")}>返回历史任务</button>} />
    {storageError && <div className="mb-5 flex flex-col justify-between gap-2 rounded-xl border border-[#edc9c1] bg-[#fff5f2] px-4 py-3 text-sm font-semibold text-[#983d2c] sm:flex-row sm:items-center"><span>{storageError}</span><button className="btn-quiet !min-h-8 !px-2" onClick={clearStorageError}>关闭</button></div>}
    <CustomerFollowUp key={activeTask.id} task={activeTask} onUpdate={upsertTask} onBack={closeFollowUp} />
  </>;

  return <>
    <PageHeader eyebrow={taskId ? "Continue task" : "New analysis"} title={taskId ? `继续编辑：${customer.name}` : "新建客户分析"} description="上传截图后先校对客户资料，再生成有业务依据、不过度承诺的开发信。" action={taskId ? <button className="btn-secondary" onClick={() => router.push("/tasks")}>返回历史任务</button> : undefined} />
    <div className="card mb-6 overflow-hidden"><div className="grid grid-cols-4">{steps.map((label, index) => { const number = index + 1; return <div key={label} className={`border-r border-[#e1e8e5] px-2 py-4 text-center last:border-r-0 ${step === number ? "bg-[#edf6f2]" : ""}`}><div className={`mx-auto mb-2 grid h-7 w-7 place-items-center rounded-full text-xs font-black ${step >= number ? "bg-[#087a5b] text-white" : "bg-[#e7ecea] text-[#788680]"}`}>{number}</div><div className={`text-xs font-bold sm:text-sm ${step === number ? "text-[#075f49]" : "text-[#68766f]"}`}>{label}</div></div>; })}</div></div>
    {error && <div className="mb-5 rounded-xl border border-[#edc9c1] bg-[#fff5f2] px-4 py-3 text-sm font-semibold text-[#983d2c]">{error}</div>}
    {storageError && <div className="mb-5 flex flex-col justify-between gap-2 rounded-xl border border-[#edc9c1] bg-[#fff5f2] px-4 py-3 text-sm font-semibold text-[#983d2c] sm:flex-row sm:items-center"><span>{storageError}</span><button className="btn-quiet !min-h-8 !px-2" onClick={clearStorageError}>关闭</button></div>}
    {toast && <div className="fixed right-5 top-20 z-50 rounded-xl bg-[#12372d] px-4 py-3 text-sm font-bold text-white shadow-xl">✓ {toast}</div>}

    {step === 1 && <UploadStep images={images} busy={busy} preparingImages={preparingImages} dragging={dragging} setDragging={setDragging} acceptFiles={acceptFiles} remove={id => setImages(items => items.filter(x => x.id !== id))} analyze={analyze} cancel={() => abortRef.current?.abort()} mode={analysisMode} modeMessage={modeMessage} configChecking={configChecking} configCheckFailed={configCheckFailed} retryConfigCheck={checkVisionConfig} stage={analysisStage} analysisFailed={analysisFailed} useDemo={runDemoAnalysis} />}
    {step === 2 && <ConfirmStep customer={customer} analysis={analysis} analysisSource={analysisSource} setCustomer={setCustomer} setAnalysis={setAnalysis} back={() => setStep(1)} next={confirmCustomer} />}
    {step === 3 && <ConfigStep config={config} setConfig={setConfig} busy={busy} back={() => setStep(2)} generate={generate} />}
    {step === 4 && draft && <ResultStep draft={draft} analysis={analysis} customer={customer} setDraft={setDraft} channel={config.channel} copy={copy} save={saveDraft} rewrite={simulatedRewrite} optimize={optimizeCurrent} undo={optimizationUndo ? undoOptimization : undefined} optimizing={optimizing} back={() => setStep(3)} onFollowUp={openFollowUp} />}
  </>;
}

function UploadStep({ images, busy, preparingImages, dragging, setDragging, acceptFiles, remove, analyze, cancel, mode, modeMessage, configChecking, configCheckFailed, retryConfigCheck, stage, analysisFailed, useDemo }: { images: TaskImage[]; busy: boolean; preparingImages: boolean; dragging: boolean; setDragging(v: boolean): void; acceptFiles(files: FileList | File[]): Promise<void>; remove(id: string): void; analyze(): void; cancel(): void; mode: AnalysisMode; modeMessage: string; configChecking: boolean; configCheckFailed: boolean; retryConfigCheck(): void; stage: string; analysisFailed: boolean; useDemo(): void }) {
  return <section className="card p-5 md:p-7"><div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><h2 className="section-title">上传客户资料截图</h2><p className="mt-1 text-sm muted">支持 LinkedIn、Facebook、公司官网、Google 搜索及企业/业务介绍截图，最多 5 张。</p></div><span className={`badge ${mode !== "volcengine" ? "badge-warn" : ""}`}>{mode === "volcengine" ? "真实 AI 模式" : mode === "mock" ? "演示模式" : "正在检查模式"}</span></div>
    <div className={`mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${mode === "volcengine" ? "border-[#cfe4dc] bg-[#f1f8f5] text-[#36594d]" : "border-[#eadbb7] bg-[#fff9eb] text-[#765c20]"}`}><span>{modeMessage}</span>{configCheckFailed && !configChecking && <button className="btn-secondary !min-h-8 !px-3 text-xs" onClick={retryConfigCheck}>重新检查</button>}</div>
    <div className="mb-4 rounded-xl border border-[#dce5e1] bg-[#fafcfc] px-4 py-3 text-xs leading-5 text-[#53645e]">请仅上传工作所需的公开客户资料截图，避免上传身份证、银行卡、私人聊天记录等敏感信息。图片将在浏览器中压缩后发送至已配置的AI服务，本项目不长期保存原图。</div>
    <label onDragEnter={e => { e.preventDefault(); setDragging(true); }} onDragOver={e => e.preventDefault()} onDragLeave={() => setDragging(false)} onDrop={e => { e.preventDefault(); setDragging(false); void acceptFiles(e.dataTransfer.files); }} className={`block cursor-pointer rounded-2xl border-2 border-dashed px-5 py-12 text-center ${dragging ? "border-[#087a5b] bg-[#eff8f4]" : "border-[#cbd8d3] bg-[#fafcfb] hover:border-[#78a99a]"}`}>
      <input className="sr-only" type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={e => { if (e.target.files) void acceptFiles(e.target.files); e.target.value = ""; }} />
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[#e7f3ef] text-xl text-[#087a5b]">⇧</div><div className="mt-4 font-bold">{preparingImages ? "正在压缩图片…" : "点击选择，或将截图拖拽到这里"}</div><div className="mt-2 text-xs muted">最多 {MAX_IMAGE_COUNT} 张；原图单张不超过 10MB；压缩后单张不超过 {(MAX_PREPARED_IMAGE_BYTES / 1024 / 1024).toFixed(1)}MB、总计不超过 {MAX_PREPARED_TOTAL_BYTES / 1024 / 1024}MB</div>
    </label>
    {images.length > 0 && <><div className="mt-5 text-xs font-bold text-[#53645e]">当前压缩后总大小：{(images.reduce((sum, image) => sum + image.size, 0) / 1024 / 1024).toFixed(2)} MB / {MAX_PREPARED_TOTAL_BYTES / 1024 / 1024} MB</div><div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{images.map(image => <div key={image.id} className="overflow-hidden rounded-xl border border-[#dbe4e0] bg-white"><div className="relative grid h-36 place-items-center bg-[#eef3f1]">{image.previewUrl ? <Image alt={image.name} src={image.previewUrl} fill unoptimized sizes="(max-width: 640px) 100vw, 25vw" className="object-cover" /> : <span className="text-xs muted">历史截图元数据</span>}</div><div className="flex items-center justify-between gap-2 p-3"><div className="min-w-0"><div className="truncate text-xs font-bold">{image.name}</div><div className="mt-1 text-[11px] muted">压缩后 {(image.size / 1024 / 1024).toFixed(2)} MB</div></div><button className="btn-quiet !min-h-8 !px-2 text-xs" onClick={() => remove(image.id)}>删除</button></div></div>)}</div></>}
    {stage && <div className={`mt-5 rounded-xl px-4 py-3 text-sm font-bold ${stage === "分析失败" ? "bg-[#fff5f2] text-[#983d2c]" : "bg-[#eef7f3] text-[#075f49]"}`}>{stage}</div>}
    <div className="mt-6 flex flex-wrap justify-end gap-2">{analysisFailed && mode === "volcengine" && <button className="btn-secondary" disabled={busy || preparingImages} onClick={useDemo}>使用演示结果继续</button>}{busy && <button className="btn-secondary" onClick={cancel}>取消分析</button>}<button className="btn-primary min-w-32" disabled={busy || preparingImages || !images.length || configChecking} onClick={analyze}>{preparingImages ? "正在压缩…" : busy ? stage || "正在分析…" : "开始分析"}</button></div>
  </section>;
}

function FieldStatus({ field }: { field?: StructuredField<string> | StructuredField<CustomerTypeCode> }) {
  if (!field) return <div className="mt-2 text-xs muted">旧任务字段 · 请人工确认</div>;
  return <div className="mt-2 rounded-lg bg-[#f5f8f7] p-2.5 text-xs leading-5">
    <div className="flex flex-wrap gap-2">
      <span className="badge">{sourceLabels[field.source]}</span>
      <span className="badge">{confidenceLabels[field.confidence]}</span>
      {field.needsReview && <span className="badge badge-warn">需要确认</span>}
    </div>
    <div className="mt-1 text-[#60706a]">依据：{field.evidence || "无可核对依据"}</div>
  </div>;
}

function ConfirmStep({ customer, analysis, analysisSource, setCustomer, setAnalysis, back, next }: { customer: Customer; analysis: CustomerAnalysis; analysisSource: AnalysisSource; setCustomer(v: Customer): void; setAnalysis(v: CustomerAnalysis): void; back(): void; next(): void }) {
  const [resolvedFields, setResolvedFields] = useState<Set<"name" | "title" | "companyName" | "country" | "industry" | "customerType">>(new Set());
  const [manualField, setManualField] = useState<"name" | "title" | "companyName" | "country" | "industry" | "customerType" | null>(null);
  const [manualValue, setManualValue] = useState("");
  const customerFields: Array<[keyof Customer, keyof NonNullable<CustomerAnalysis["structuredFields"]>, string, boolean]> = [
    ["name", "customerName", "客户姓名", true], ["title", "jobTitle", "职位", true], ["companyName", "companyName", "公司名称", true],
    ["country", "countryOrRegion", "国家或地区", false], ["industry", "industry", "所属行业", false],
  ];
  const risks = getConfirmationRisks(customer, analysis, resolvedFields);
  const status = getConfirmationStatus(customer, risks);
  const summary = getCustomerSummary(customer, analysis);
  const resolve = (key: typeof manualField) => { if (!key) return; setResolvedFields(current => new Set(current).add(key)); setManualField(null); setManualValue(""); };
  const setUnknown = (key: Exclude<typeof manualField, null>) => { const nextState = setConfirmationUnknown(customer, analysis, key); setCustomer(nextState.customer); setAnalysis(nextState.analysis); resolve(key); };
  const saveManual = (key: Exclude<typeof manualField, null>) => { const nextState = applyManualConfirmation(customer, analysis, key, manualValue); setCustomer(nextState.customer); setAnalysis(nextState.analysis); resolve(key); };
  return <section className="card p-5 md:p-7"><div className="mb-5 flex flex-wrap items-start justify-between gap-3"><div><h2 className="section-title">确认客户资料</h2><p className="mt-1 text-sm muted">快速确认会影响称呼和沟通方向的信息，其余详情可按需展开。</p></div><span className={`badge ${analysisSource !== "volcengine" ? "badge-warn" : ""}`}>{analysisSource === "volcengine" ? "来源：火山方舟" : analysisSource === "legacy" ? "来源：旧任务" : "来源：演示数据"}</span></div>
    <div className="rounded-2xl border border-[#dce5e1] bg-[#fafcfc] p-5"><div className="text-xl font-black text-[#173d32]">{summary.name}</div><div className="mt-1 font-bold text-[#3f554d]">{summary.role}</div><div className="mt-1 text-sm text-[#60706a]">{summary.companyAndRegion}</div><div className="mt-4 grid gap-2 text-sm md:grid-cols-2"><div><span className="font-bold">客户类型：</span>{summary.customerType}</div><div><span className="font-bold">建议方向：</span>{summary.direction}</div></div><div className={`mt-4 text-sm font-bold ${status.canContinue && !risks.length ? "text-[#087a5b]" : "text-[#9a6530]"}`}>{status.label}</div></div>
    <div className="mt-5 rounded-xl border border-[#dce5e1] p-4"><h3 className="font-black">需要确认</h3>{risks.length ? <div className="mt-3 space-y-3">{risks.map(risk => <div className="rounded-xl bg-[#fafcfc] p-3" key={risk.key}><div className="flex flex-wrap items-start justify-between gap-2"><div><div className="text-sm font-bold">{risk.label}：{risk.value}</div><div className="mt-1 text-xs leading-5 text-[#60706a]">{risk.reason}</div></div><div className="flex flex-wrap gap-2"><button className="btn-secondary !min-h-8 !px-3 text-xs" onClick={() => resolve(risk.key)}>保留当前内容</button><button className="btn-secondary !min-h-8 !px-3 text-xs" onClick={() => setUnknown(risk.key)}>设为未知</button><button className="btn-secondary !min-h-8 !px-3 text-xs" onClick={() => { setManualField(risk.key); setManualValue(customer[risk.key]); }}>手动修改</button></div></div>{manualField === risk.key && <div className="mt-3 flex flex-col gap-2 sm:flex-row">{risk.key === "customerType" ? <select className={fieldClass} value={manualValue} onChange={event => setManualValue(event.target.value)}>{["经销商", "代理商", "终端工厂", "设备集成商", "工程项目方", "服务商", "其他", "无法判断"].map(value => <option key={value}>{value}</option>)}</select> : <input className={fieldClass} value={manualValue} placeholder={`请输入${risk.label}`} onChange={event => setManualValue(event.target.value)} />}<button className="btn-primary whitespace-nowrap" onClick={() => saveManual(risk.key)}>确认修改</button></div>}</div>)}</div> : <p className="mt-2 text-sm text-[#53645e]">未发现需要特别确认的信息，可以直接生成开发信。</p>}</div>
    <details open={CUSTOMER_DETAILS_DEFAULT_OPEN} className="mt-5 rounded-xl border border-[#dce5e1] bg-[#fafcfc] p-4"><summary className="cursor-pointer font-black">查看全部识别与分析详情</summary><div className="mt-5 grid gap-5 md:grid-cols-2">{customerFields.map(([key, metadataKey, label, important]) => <label key={key}><span className="label">{label} {important && <em className="not-italic text-[#b45432]">· 重点信息</em>}</span><input className={fieldClass} placeholder="AI未能从截图中确认，请手动填写" value={customer[key]} onChange={event => { const next = applyManualConfirmation(customer, analysis, key as ConfirmationFieldKey, event.target.value); setCustomer(next.customer); setAnalysis(next.analysis); }} /><FieldStatus field={analysis.structuredFields?.[metadataKey] as StructuredField<string> | undefined} /></label>)}
      <label><span className="label">客户类型</span><select className={fieldClass} value={customer.customerType} onChange={event => { const next = applyManualConfirmation(customer, analysis, "customerType", event.target.value); setCustomer(next.customer); setAnalysis(next.analysis); }}>{["经销商", "代理商", "终端工厂", "设备集成商", "工程项目方", "服务商", "其他", "无法判断"].map(value => <option key={value}>{value}</option>)}</select><FieldStatus field={analysis.structuredFields?.customerType} /></label>
      <label><span className="label">决策影响力</span><select className={fieldClass} value={analysis.decisionInfluence} onChange={event => setAnalysis({ ...analysis, decisionInfluence: event.target.value as CustomerAnalysis["decisionInfluence"], generatedOutreach: undefined })}>{["高", "中", "低", "无法判断"].map(value => <option key={value}>{value}</option>)}</select><FieldStatus field={analysis.decisionInfluenceField as StructuredField<string> | undefined} /></label>
      <label className="md:col-span-2"><span className="label">公司主要业务</span><textarea rows={3} className={fieldClass} placeholder="AI未能从截图中确认，请手动填写" value={analysis.mainBusiness} onChange={event => setAnalysis({ ...analysis, mainBusiness: event.target.value, generatedOutreach: undefined })} /><FieldStatus field={analysis.companyBusinessField} /></label>
      <label className="md:col-span-2"><span className="label">潜在压缩空气应用</span><textarea rows={3} className={fieldClass} value={analysis.potentialApplications} onChange={event => setAnalysis({ ...analysis, potentialApplications: event.target.value, generatedOutreach: undefined })} /></label>
      <label className="md:col-span-2"><span className="label">推荐沟通切入点</span><textarea rows={3} className={fieldClass} value={analysis.recommendedAngle} onChange={event => setAnalysis({ ...analysis, recommendedAngle: event.target.value, generatedOutreach: undefined })} /></label>
      <label className="md:col-span-2"><span className="label">需要人工确认的信息</span><textarea rows={3} className={fieldClass} value={analysis.uncertainties} onChange={event => setAnalysis({ ...analysis, uncertainties: event.target.value, generatedOutreach: undefined })} /></label>
      {analysis.structuredFields?.otherImportantInformation.length ? <div className="md:col-span-2 rounded-xl border border-[#dce5e1] p-4"><div className="font-bold">其他可识别信息</div><div className="mt-3 space-y-3">{analysis.structuredFields.otherImportantInformation.map((item, index) => <div key={`${item.label}-${index}`}><div className="text-sm font-bold">{item.label}：{item.field.value || "无法确认"}</div><FieldStatus field={item.field} /></div>)}</div></div> : null}
      <div className="md:col-span-2 rounded-xl border border-[#dce5e1] bg-white p-4"><div className="font-bold">AI 推测（{analysis.inferences?.length || 0} 条）</div>{analysis.inferences?.length ? <div className="mt-3 space-y-3">{analysis.inferences.map((item, index) => <div className="rounded-lg bg-[#fafcfc] p-3 text-sm" key={`${item.content}-${index}`}><div className="font-bold">AI推测 · {confidenceLabels[item.confidence]}</div><div className="mt-1">{item.content}</div><div className="mt-1 text-[#60706a]">判断依据：{item.basis}</div></div>)}</div> : <p className="mt-2 text-sm muted">证据不足，未生成推测。</p>}</div>
      <div className="md:col-span-2 rounded-xl bg-white p-3 text-sm font-bold">资料状态：{status.label}</div>
      {analysis.conflicts.length > 0 && <div className="md:col-span-2 rounded-xl border border-[#edc9c1] bg-[#fff5f2] p-4"><div className="font-bold text-[#983d2c]">截图信息冲突</div><ul className="mt-2 space-y-1 text-sm text-[#76443a]">{analysis.conflicts.map((item, index) => <li key={`${item}-${index}`}>• {item}</li>)}</ul></div>}
      {!analysis.structuredFields && <div className="md:col-span-2 rounded-xl border border-[#dce5e1] bg-white p-4"><div className="font-bold">旧任务识别依据（{analysis.evidence.length} 条）</div>{analysis.evidence.length ? <div className="mt-3 space-y-3">{analysis.evidence.map((item, index) => <div className="rounded-lg bg-[#fafcfc] p-3 text-sm" key={`${item.field}-${index}`}><div className="font-bold">{item.field} · 截图 {item.sourceImage}</div><div className="mt-1 text-[#60706a]">{item.evidence}</div></div>)}</div> : <p className="mt-3 text-sm muted">旧任务没有结构化依据，请人工确认关键字段。</p>}</div>}
    </div></details><div className="mt-7 flex justify-between"><button className="btn-secondary" onClick={back}>上一步</button><button className="btn-primary" disabled={!status.canContinue} onClick={next}>确认并生成开发信</button></div>
  </section>;
}

function ConfigStep({ config, setConfig, busy, back, generate }: { config: GenerationConfig; setConfig(v: GenerationConfig): void; busy: boolean; back(): void; generate(): void }) {
  const selects: Array<[keyof GenerationConfig, string, string[]]> = [
    ["channel", "联系渠道", ["LinkedIn", "Facebook", "Email", "WhatsApp"]], ["purpose", "开发目的", ["初次认识", "寻找经销商", "推荐产品", "项目合作", "二次跟进"]], ["customerType", "客户类型", ["经销商", "代理商", "终端工厂", "设备集成商", "工程项目方", "服务商", "其他", "无法判断"]], ["tone", "语气", ["友好简短", "专业正式", "顾问式"]], ["length", "长度", ["极简", "标准", "详细"]], ["language", "输出语言", ["英文", "中英对照"]], ["product", "推广产品", ["永磁变频螺杆空压机", "两级压缩空压机", "无油空压机", "整厂节能系统"]],
  ];
  return <section className="card p-5 md:p-7"><div className="mb-6"><h2 className="section-title">配置开发信</h2><p className="mt-1 text-sm muted">这些条件会记录到任务中，并影响模拟生成结果。</p></div><div className="grid gap-5 md:grid-cols-2">{selects.map(([key, label, options]) => <label key={key}><span className="label">{label}</span><select className={fieldClass} value={config[key]} onChange={e => setConfig({ ...config, [key]: e.target.value })}>{options.map(x => <option key={x}>{x}</option>)}</select></label>)}<label className="md:col-span-2"><span className="label">补充说明</span><textarea rows={4} className={fieldClass} placeholder="例如：避免谈价格，先了解对方是否负责项目配套…" value={config.notes} onChange={e => setConfig({ ...config, notes: e.target.value })} /></label></div><div className="mt-7 flex justify-between"><button className="btn-secondary" onClick={back}>上一步</button><button className="btn-primary min-w-36" disabled={busy} onClick={generate}>{busy ? "正在生成…" : "生成开发信"}</button></div></section>;
}
