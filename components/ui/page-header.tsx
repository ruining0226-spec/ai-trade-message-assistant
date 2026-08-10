export function PageHeader({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description: string; action?: React.ReactNode }) {
  return <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div>{eyebrow && <div className="mb-2 text-xs font-bold uppercase tracking-[.16em] text-[#087a5b]">{eyebrow}</div>}<h1 className="text-2xl font-black tracking-tight md:text-[28px]">{title}</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-[#65736e]">{description}</p></div>{action}</div>;
}
