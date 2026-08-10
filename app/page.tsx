"use client";

import Link from "next/link";
import { useState } from "react";
import { useAppData } from "@/components/providers/app-data-provider";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { formatDateTime } from "@/lib/utils";

export default function DashboardPage() {
  const { tasks, hydrated } = useAppData();
  const [now] = useState(() => Date.now());
  const today = new Date(now).toDateString();
  const weekAgo = now - 7 * 86400000;
  const stats = [
    ["今日分析客户", tasks.filter(t => new Date(t.createdAt).toDateString() === today).length, "份客户资料", "01"],
    ["本周生成开发信", tasks.filter(t => +new Date(t.updatedAt) >= weekAgo && t.versions.length).length, "封个性化消息", "02"],
    ["待发送任务", tasks.filter(t => t.status === "待发送" || t.status === "已生成").length, "项需要处理", "03"],
    ["待跟进客户", tasks.filter(t => t.status === "待跟进" || (t.followUpDate && +new Date(t.followUpDate) <= now)).length, "位需要关注", "04"],
  ];
  return <>
    <PageHeader eyebrow="Sales workspace" title="工作台" description="集中查看客户分析、开发信进度和下一步跟进安排。" action={<Link href="/tasks/new" className="btn-primary">新建客户分析</Link>} />
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{stats.map(([label, value, suffix, index]) => <div className="card p-5" key={label}><div className="flex items-center justify-between"><span className="text-sm font-bold text-[#53645e]">{label}</span><span className="text-xs font-black text-[#93a29c]">{index}</span></div><div className="mt-6 flex items-end gap-2"><strong className="text-3xl font-black">{hydrated ? value : "—"}</strong><span className="mb-1 text-xs text-[#74827d]">{suffix}</span></div><div className="mt-4 h-1 rounded-full bg-[#edf2f0]"><div className="h-full w-2/5 rounded-full bg-[#15936f]" /></div></div>)}</div>
    <div className="mt-6 grid gap-6 xl:grid-cols-[1.6fr_.8fr]">
      <section className="card overflow-hidden"><div className="flex items-center justify-between border-b border-[#e2e9e6] px-5 py-4"><div><h2 className="section-title">最近任务</h2><p className="mt-1 text-xs muted">最近更新的客户开发工作</p></div><Link href="/tasks" className="text-sm font-bold text-[#087a5b]">查看全部 →</Link></div>
        {!hydrated ? <div className="p-8 text-sm muted">正在读取本地数据…</div> : tasks.length === 0 ? <div className="p-5"><EmptyState title="还没有历史任务" description="从客户截图开始，几分钟内完成一份可编辑的个性化开发信。" action={<Link href="/tasks/new" className="btn-primary inline-flex">开始第一次分析</Link>} /></div> : <div className="table-wrap"><table><thead><tr><th>客户</th><th>公司 / 职位</th><th>渠道</th><th>状态</th><th>更新时间</th></tr></thead><tbody>{tasks.slice(0, 6).map(task => <tr key={task.id}><td><Link className="font-bold hover:text-[#087a5b]" href={`/tasks/new?id=${task.id}`}>{task.customer.name}</Link></td><td><div>{task.customer.companyName}</div><div className="mt-1 text-xs muted">{task.customer.title}</div></td><td>{task.config.channel}</td><td><span className="badge">{task.status}</span></td><td>{formatDateTime(task.updatedAt)}</td></tr>)}</tbody></table></div>}
      </section>
      <aside className="card p-5"><div className="text-xs font-black uppercase tracking-[.14em] text-[#087a5b]">Recommended flow</div><h2 className="mt-3 text-xl font-black">从截图到开发信</h2><p className="mt-2 text-sm leading-6 muted">每一步都保留人工确认，避免把推测写成客户事实。</p><ol className="mt-6 space-y-5">{["上传客户与公司截图", "确认结构化识别结果", "选择渠道、目的和产品", "编辑、复制并保存版本"].map((text, i) => <li className="flex gap-3" key={text}><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#e7f3ef] text-xs font-black text-[#087a5b]">{i + 1}</span><span className="pt-1 text-sm font-semibold">{text}</span></li>)}</ol></aside>
    </div>
  </>;
}
