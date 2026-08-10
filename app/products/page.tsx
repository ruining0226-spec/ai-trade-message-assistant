"use client";

import { useEffect, useState } from "react";
import { useAppData } from "@/components/providers/app-data-provider";
import { PageHeader } from "@/components/ui/page-header";
import { createId } from "@/lib/utils";
import type { Product } from "@/types";

const productFields: Array<[keyof Product, string]> = [["name", "产品名称"], ["introduction", "简短介绍"], ["industries", "适用行业"], ["applications", "典型应用"], ["strengths", "核心优势"], ["bannedClaims", "禁止虚构的信息"]];

export default function ProductsPage() {
  const { products, hydrated, saveProducts } = useAppData(); const [draft, setDraft] = useState(products); const [active, setActive] = useState(0); const [saved, setSaved] = useState(false);
  useEffect(() => {
    // Synchronize the editable draft after localStorage hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (hydrated) setDraft(products);
  }, [hydrated, products]);
  const update = (key: keyof Product, value: string) => setDraft(items => items.map((x, i) => i === active ? { ...x, [key]: value } : x));
  const add = () => { setDraft(items => [...items, { id: createId(), name: "新产品", introduction: "", industries: "", applications: "", strengths: "", bannedClaims: "" }]); setActive(draft.length); };
  const save = () => { saveProducts(draft); setSaved(true); window.setTimeout(() => setSaved(false), 2000); };
  const product = draft[active];
  return <><PageHeader eyebrow="Product knowledge" title="产品资料" description="维护推广产品的适用场景与事实边界，避免开发信出现未经确认的参数和承诺。" action={<button className="btn-secondary" onClick={add}>＋ 添加产品</button>} /><div className="grid gap-6 lg:grid-cols-[290px_1fr]"><aside className="card h-fit p-3"><div className="px-2 pb-3 pt-1 text-xs font-black uppercase tracking-wider text-[#71807a]">产品列表 · {draft.length}</div><div className="space-y-2">{draft.map((item, index) => <button key={item.id} className={`w-full rounded-xl border px-3 py-3 text-left text-sm font-bold ${active === index ? "border-[#087a5b] bg-[#eef7f3] text-[#075f49]" : "border-transparent hover:bg-[#f3f6f5]"}`} onClick={() => setActive(index)}>{item.name}</button>)}</div></aside>{product && <section className="card p-5 md:p-7"><div className="mb-5 flex items-start justify-between gap-4"><div><h2 className="section-title">编辑产品资料</h2><p className="mt-1 text-sm muted">产品 ID：{product.id}</p></div>{draft.length > 1 && <button className="btn-danger !min-h-9" onClick={() => { if (window.confirm(`确认删除产品“${product.name}”吗？`)) { setDraft(items => items.filter((_, i) => i !== active)); setActive(Math.max(0, active - 1)); } }}>删除产品</button>}</div><div className="space-y-5">{productFields.map(([key, label], index) => <label key={key}><span className="label">{label}</span>{index === 0 ? <input className="field" value={product[key]} onChange={e => update(key, e.target.value)} /> : <textarea rows={3} className="field" value={product[key]} onChange={e => update(key, e.target.value)} />}</label>)}</div><div className="mt-7 flex items-center justify-end gap-3">{saved && <span className="text-sm font-bold text-[#087a5b]">✓ 产品资料已保存</span>}<button className="btn-primary" onClick={save}>保存全部产品</button></div></section>}</div></>;
}
