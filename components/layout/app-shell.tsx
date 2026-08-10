"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";

const nav = [
  ["工作台", "/", "⌂"], ["新建任务", "/tasks/new", "+"], ["历史任务", "/tasks", "◫"],
  ["客户管理", "/customers", "◎"], ["公司资料", "/company", "▣"], ["产品资料", "/products", "◇"], ["系统设置", "/settings", "⚙"],
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  return <div className="min-h-screen md:flex">
    {open && <button aria-label="关闭导航" className="fixed inset-0 z-30 bg-black/35 md:hidden" onClick={() => setOpen(false)} />}
    <aside className={cn("fixed inset-y-0 left-0 z-40 w-[248px] bg-[#10241e] text-white transition-transform md:sticky md:top-0 md:h-screen md:translate-x-0", open ? "translate-x-0" : "-translate-x-full")}>
      <div className="border-b border-white/10 px-5 py-6">
        <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#18a77e] text-lg font-black">AI</span><div><div className="font-bold">外贸开发信助手</div><div className="mt-1 text-xs text-white/55">AIR COMPRESSOR CRM</div></div></div>
      </div>
      <nav className="space-y-1 px-3 py-5">{nav.map(([label, href, icon]) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return <Link key={href} href={href} onClick={() => setOpen(false)} className={cn("flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold", active ? "bg-white/12 text-white" : "text-white/67 hover:bg-white/7 hover:text-white")}><span className="grid w-6 place-items-center text-base">{icon}</span>{label}</Link>;
      })}</nav>
      <div className="absolute bottom-5 left-4 right-4 rounded-xl border border-white/10 bg-white/5 p-3 text-xs leading-5 text-white/60"><strong className="text-[#74d7b9]">演示模式</strong><br />数据仅保存在当前浏览器</div>
    </aside>
    <div className="min-w-0 flex-1">
      <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-[#dce5e1] bg-white/95 px-4 backdrop-blur md:px-8">
        <div className="flex items-center gap-3"><button className="btn-secondary !min-h-9 !px-2.5 md:hidden" onClick={() => setOpen(true)} aria-label="打开导航">☰</button><div><div className="text-sm font-bold">AI 外贸开发信助手</div><div className="hidden text-xs text-[#71807a] sm:block">把客户资料转化为有依据的个性化沟通</div></div></div>
        <Link href="/tasks/new" className="btn-primary !min-h-9">＋ 新建分析</Link>
      </header>
      <main className="mx-auto max-w-[1480px] p-4 md:p-8">{children}</main>
    </div>
  </div>;
}
