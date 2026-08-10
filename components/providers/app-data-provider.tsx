"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { defaultCompanyProfile, defaultProducts } from "@/lib/mock/defaults";
import { storageRepository } from "@/lib/storage/repository";
import type { CompanyProfile, Product, Task } from "@/types";

interface AppDataValue {
  hydrated: boolean;
  tasks: Task[];
  company: CompanyProfile;
  products: Product[];
  upsertTask(task: Task): void;
  deleteTask(id: string): void;
  saveCompany(profile: CompanyProfile): void;
  saveProducts(products: Product[]): void;
}

const AppDataContext = createContext<AppDataValue | null>(null);

export function AppDataProvider({ children }: { children: React.ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [company, setCompanyState] = useState(defaultCompanyProfile);
  const [products, setProductsState] = useState(defaultProducts);

  useEffect(() => {
    // Browser storage is an external system; hydrate it only after the client mounts.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTasks(storageRepository.getTasks());
    setCompanyState(storageRepository.getCompany());
    setProductsState(storageRepository.getProducts());
    setHydrated(true);
  }, []);

  const upsertTask = useCallback((task: Task) => setTasks(current => {
    const next = current.some(item => item.id === task.id) ? current.map(item => item.id === task.id ? task : item) : [task, ...current];
    storageRepository.saveTasks(next); return next;
  }), []);
  const deleteTask = useCallback((id: string) => setTasks(current => { const next = current.filter(item => item.id !== id); storageRepository.saveTasks(next); return next; }), []);
  const saveCompany = useCallback((profile: CompanyProfile) => { setCompanyState(profile); storageRepository.saveCompany(profile); }, []);
  const saveProducts = useCallback((items: Product[]) => { setProductsState(items); storageRepository.saveProducts(items); }, []);

  const value = useMemo(() => ({ hydrated, tasks, company, products, upsertTask, deleteTask, saveCompany, saveProducts }), [hydrated, tasks, company, products, upsertTask, deleteTask, saveCompany, saveProducts]);
  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData() {
  const value = useContext(AppDataContext);
  if (!value) throw new Error("useAppData must be used inside AppDataProvider");
  return value;
}
