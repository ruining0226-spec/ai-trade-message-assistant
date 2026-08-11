"use client";

import { useId, useState } from "react";
import type { CustomerAnalysis, MessageContent } from "@/types";

const sections: Array<[keyof MessageContent, string, number]> = [
  ["identityAnalysis", "1. 客户身份与业务分析", 3],
  ["businessConnection", "2. 客户与空压机业务的潜在联系", 3],
  ["recommendedAngle", "3. 推荐沟通切入点", 3],
  ["personalizationBasis", "7. 本次开发信的个性化依据", 3],
  ["uncertaintyNotice", "8. AI 不确定信息提示", 3],
];
export const ANALYSIS_DETAILS_DEFAULT_OPEN = false;

function splitVerificationItems(value: string) {
  return value.split(/\r?\n|；|;/).map(item => item.trim()).filter(item => item && !/^(无|暂无|没有|none|n\/a)/i.test(item));
}

export function countAnalysisVerificationItems(analysis: CustomerAnalysis, draft: MessageContent) {
  const items = new Set<string>();
  const fields = analysis.structuredFields;
  if (fields) {
    [fields.customerName, fields.jobTitle, fields.companyName, fields.countryOrRegion, fields.industry, fields.customerType]
      .filter(field => field.needsReview)
      .forEach(field => items.add(field.evidence || String(field.value || "待确认字段")));
    fields.otherImportantInformation.filter(item => item.field.needsReview).forEach(item => items.add(`${item.label}:${item.field.evidence || item.field.value || "待确认"}`));
  }
  analysis.conflicts.forEach(item => items.add(item));
  splitVerificationItems(draft.uncertaintyNotice).forEach(item => items.add(item));
  return items.size;
}

export function AnalysisDetails({ draft, analysis, disabled, onChange }: { draft: MessageContent; analysis: CustomerAnalysis; disabled: boolean; onChange(value: MessageContent): void }) {
  const [open, setOpen] = useState(ANALYSIS_DETAILS_DEFAULT_OPEN);
  const contentId = useId();
  const verificationCount = countAnalysisVerificationItems(analysis, draft);
  return <section className="mt-6 overflow-hidden rounded-2xl border border-[#d9e5e0] bg-[#fafcfc]">
    <button
      type="button"
      className="flex w-full flex-col items-start justify-between gap-2 px-4 py-4 text-left sm:flex-row sm:items-center md:px-5"
      aria-expanded={open}
      aria-controls={contentId}
      onClick={() => setOpen(current => !current)}
    >
      <span className="flex min-w-0 items-center gap-2 font-black text-[#173d32]"><span aria-hidden>{open ? "−" : "+"}</span>{open ? "收起 AI 客户分析与生成依据" : "查看 AI 客户分析与生成依据"}</span>
      {verificationCount > 0 && <span className="badge badge-warn shrink-0">有 {verificationCount} 项信息需要核实</span>}
    </button>
    {open && <div id={contentId} className="space-y-5 border-t border-[#d9e5e0] bg-white p-4 md:p-5">{sections.map(([key, label, rows]) => <label key={key} className="block"><span className="label">{label}</span><textarea className="field leading-6" rows={rows} value={draft[key] as string} disabled={disabled} onChange={event => onChange({ ...draft, [key]: event.target.value })} /></label>)}</div>}
  </section>;
}
