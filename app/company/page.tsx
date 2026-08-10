"use client";

import { useEffect, useState } from "react";
import { useAppData } from "@/components/providers/app-data-provider";
import { PageHeader } from "@/components/ui/page-header";
import type { CompanyProfile } from "@/types";

const fields: Array<[keyof CompanyProfile, string, number]> = [
  ["companyName", "公司名称", 1], ["introduction", "公司简介", 4], ["strengths", "核心优势", 3], ["serviceScope", "服务范围", 3], ["mainMarkets", "主要市场", 2], ["email", "邮箱", 1], ["whatsapp", "WhatsApp", 1], ["website", "官网", 1], ["bannedClaims", "禁止 AI 使用的说法", 3], ["unavailablePromises", "不能承诺的服务", 3], ["unverifiedQualifications", "未确认的资质与参数", 3],
];

export default function CompanyPage() {
  const { company, hydrated, saveCompany } = useAppData(); const [draft, setDraft] = useState(company); const [saved, setSaved] = useState(false);
  useEffect(() => {
    // Synchronize the editable draft after localStorage hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (hydrated) setDraft(company);
  }, [hydrated, company]);
  const save = () => { saveCompany(draft); setSaved(true); window.setTimeout(() => setSaved(false), 2000); };
  return <><PageHeader eyebrow="Knowledge base" title="公司资料" description="这些资料将作为后续真实 AI 生成时的事实边界。演示阶段同样保存在浏览器本地。" /><section className="card p-5 md:p-7"><div className="mb-6 rounded-xl border border-[#dbe8e3] bg-[#f1f8f5] p-4 text-sm leading-6 text-[#36594d]">请只填写已经确认的事实。禁止说法、不能承诺的服务和未确认资质会作为生成护栏。</div><div className="grid gap-5 md:grid-cols-2">{fields.map(([key, label, rows]) => <label key={key} className={rows > 1 ? "md:col-span-2" : ""}><span className="label">{label}</span>{rows === 1 ? <input className="field" value={draft[key]} onChange={e => setDraft({ ...draft, [key]: e.target.value })} /> : <textarea className="field" rows={rows} value={draft[key]} onChange={e => setDraft({ ...draft, [key]: e.target.value })} />}</label>)}</div><div className="mt-7 flex items-center justify-end gap-3">{saved && <span className="text-sm font-bold text-[#087a5b]">✓ 已保存到本地</span>}<button className="btn-primary" onClick={save}>保存公司资料</button></div></section></>;
}
