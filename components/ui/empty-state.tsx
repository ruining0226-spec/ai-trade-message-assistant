export function EmptyState({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return <div className="card px-6 py-14 text-center"><div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-[#eaf4f0] text-xl text-[#087a5b]">＋</div><h3 className="font-bold">{title}</h3><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#65736e]">{description}</p>{action && <div className="mt-5">{action}</div>}</div>;
}
