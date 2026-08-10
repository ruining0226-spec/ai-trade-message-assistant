"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useAppData } from "@/components/providers/app-data-provider";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { formatAllEnglish, getChannelMessages } from "@/lib/message/channel-messages";
import { formatDateTime } from "@/lib/utils";
import type { Task, TaskStatus } from "@/types";

const statuses: TaskStatus[] = ["待分析", "待确认", "已生成", "待发送", "已发送", "已回复", "待跟进", "有效线索", "无效客户", "已成交", "已归档"];

export default function TasksPage() {
  const { tasks, hydrated, upsertTask, deleteTask } = useAppData();
  const [query, setQuery] = useState(""); const [status, setStatus] = useState(""); const [type, setType] = useState(""); const [channel, setChannel] = useState(""); const [openId, setOpenId] = useState(""); const [toast, setToast] = useState("");
  const filtered = useMemo(() => tasks.filter(t => (!query || `${t.customer.name} ${t.customer.companyName}`.toLowerCase().includes(query.toLowerCase())) && (!status || t.status === status) && (!type || t.customer.customerType === type) && (!channel || t.config.channel === channel)), [tasks, query, status, type, channel]);
  const update = (task: Task, changes: Partial<Task>) => upsertTask({ ...task, ...changes, updatedAt: new Date().toISOString() });
  const copy = async (task: Task) => { const v = task.versions.find(x => x.id === task.selectedVersionId) || task.versions.at(-1); if (!v) return; await navigator.clipboard.writeText(formatAllEnglish(getChannelMessages(v.content, task.config.channel))); setToast(`${task.config.channel} 开发信英文已复制`); window.setTimeout(() => setToast(""), 2000); };
  const remove = (task: Task) => { if (window.confirm(`确认删除 ${task.customer.name} / ${task.customer.companyName} 的任务吗？删除后无法恢复。`)) deleteTask(task.id); };
  return <>
    <PageHeader eyebrow="Task history" title="历史任务" description="搜索、筛选、更新跟进状态，并从任意历史版本继续编辑。" action={<Link href="/tasks/new" className="btn-primary">新建任务</Link>} />
    {toast && <div className="fixed right-5 top-20 z-50 rounded-xl bg-[#12372d] px-4 py-3 text-sm font-bold text-white shadow-xl">✓ {toast}</div>}
    <div className="card mb-5 grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-[2fr_repeat(3,1fr)]"><input className="field" placeholder="搜索客户姓名或公司" value={query} onChange={e => setQuery(e.target.value)} /><Filter label="全部状态" value={status} set={setStatus} values={statuses} /><Filter label="全部客户类型" value={type} set={setType} values={["经销商", "代理商", "终端工厂", "设备集成商", "工程项目方"]} /><Filter label="全部渠道" value={channel} set={setChannel} values={["LinkedIn", "Facebook", "Email", "WhatsApp"]} /></div>
    {!hydrated ? <div className="card p-8 text-sm muted">正在读取本地任务…</div> : tasks.length === 0 ? <EmptyState title="暂无历史任务" description="完成一次截图分析和开发信生成后，任务会自动保存在这里。" action={<Link href="/tasks/new" className="btn-primary inline-flex">新建客户分析</Link>} /> : filtered.length === 0 ? <EmptyState title="没有匹配的任务" description="尝试清除关键词或调整筛选条件。" /> : <div className="space-y-3">{filtered.map(task => <article className="card overflow-hidden" key={task.id}><div className="grid items-center gap-4 p-4 md:grid-cols-[1.2fr_1.4fr_.8fr_.8fr_auto]"><div><div className="font-black">{task.customer.name}</div><div className="mt-1 text-xs muted">{task.customer.title}</div></div><div><div className="text-sm font-semibold">{task.customer.companyName}</div><div className="mt-1 text-xs muted">{task.customer.country} · {task.customer.industry}</div></div><div><span className="badge">{task.status}</span><div className="mt-1 text-xs muted">{task.config.channel}</div></div><div className="text-xs muted"><div>{task.config.product}</div><div className="mt-1">更新 {formatDateTime(task.updatedAt)}</div></div><div className="flex flex-wrap gap-1"><button className="btn-quiet !min-h-8 !px-2" onClick={() => setOpenId(openId === task.id ? "" : task.id)}>{openId === task.id ? "收起" : "详情"}</button><Link className="btn-secondary !min-h-8 !px-2" href={`/tasks/new?id=${task.id}`}>继续编辑</Link><button className="btn-secondary !min-h-8 !px-2" onClick={() => copy(task)}>复制</button></div></div>
      {openId === task.id && <div className="border-t border-[#e1e8e5] bg-[#fbfcfc] p-4 md:p-5"><div className="grid gap-5 lg:grid-cols-4"><label><span className="label">任务状态</span><select className="field" value={task.status} onChange={e => update(task, { status: e.target.value as TaskStatus })}>{statuses.map(x => <option key={x}>{x}</option>)}</select></label><label><span className="label">跟进日期</span><input type="date" className="field" value={task.followUpDate} onChange={e => update(task, { followUpDate: e.target.value, status: e.target.value ? "待跟进" : task.status })} /></label><div><span className="label">联系渠道</span><div className="field flex items-center"><span className="badge">{task.config.channel}</span></div></div><label><span className="label">备注</span><textarea className="field" rows={2} placeholder="记录发送反馈、客户偏好或下一步…" value={task.notes} onChange={e => update(task, { notes: e.target.value })} /></label></div><div className="mt-4 rounded-xl border border-[#e0e7e4] bg-white p-4"><div className="text-xs font-black uppercase tracking-wider text-[#087a5b]">客户分析</div><p className="mt-2 text-sm leading-6">{task.analysis.mainBusiness}</p><p className="mt-2 text-sm leading-6 muted">切入点：{task.analysis.recommendedAngle}</p></div><div className="mt-4 flex flex-wrap justify-end gap-2"><button className="btn-secondary" onClick={() => update(task, { status: "已归档" })}>归档任务</button><button className="btn-danger" onClick={() => remove(task)}>删除任务</button></div></div>}
    </article>)}</div>}
  </>;
}

function Filter({ label, value, set, values }: { label: string; value: string; set(v: string): void; values: readonly string[] }) { return <select className="field" aria-label={label} value={value} onChange={e => set(e.target.value)}><option value="">{label}</option>{values.map(x => <option key={x}>{x}</option>)}</select>; }
