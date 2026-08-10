"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useAppData } from "@/components/providers/app-data-provider";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { formatDateTime } from "@/lib/utils";

export default function CustomersPage() {
  const { tasks, hydrated } = useAppData(); const [query, setQuery] = useState("");
  const customers = useMemo(() => {
    const map = new Map<string, { task: typeof tasks[number]; count: number }>();
    [...tasks].sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt)).forEach(task => { const key = `${task.customer.name.trim().toLowerCase()}|${task.customer.companyName.trim().toLowerCase()}`; const old = map.get(key); map.set(key, old ? { ...old, count: old.count + 1 } : { task, count: 1 }); });
    return [...map.values()].filter(x => !query || `${x.task.customer.name} ${x.task.customer.companyName}`.toLowerCase().includes(query.toLowerCase()));
  }, [tasks, query]);
  return <><PageHeader eyebrow="Customer directory" title="客户管理" description="客户由历史任务自动汇总，按“客户姓名 + 公司名称”去重。" action={<Link href="/tasks/new" className="btn-primary">添加客户任务</Link>} /><div className="card mb-5 p-4"><input className="field max-w-lg" placeholder="搜索客户或公司" value={query} onChange={e => setQuery(e.target.value)} /></div>{!hydrated ? <div className="card p-8 text-sm muted">正在汇总客户…</div> : customers.length === 0 ? <EmptyState title="暂无客户档案" description="完成新建任务流程后，客户会自动出现在这里。" /> : <div className="card table-wrap"><table><thead><tr><th>客户姓名</th><th>公司 / 职位</th><th>国家</th><th>客户类型</th><th>任务数量</th><th>最近联系</th><th>当前状态</th></tr></thead><tbody>{customers.map(({ task, count }) => <tr key={task.id}><td><Link href={`/tasks/new?id=${task.id}`} className="font-black hover:text-[#087a5b]">{task.customer.name}</Link></td><td><div className="font-semibold">{task.customer.companyName}</div><div className="mt-1 text-xs muted">{task.customer.title}</div></td><td>{task.customer.country}</td><td>{task.customer.customerType}</td><td>{count}</td><td>{formatDateTime(task.updatedAt)}</td><td><span className="badge">{task.status}</span></td></tr>)}</tbody></table></div>}</>;
}
