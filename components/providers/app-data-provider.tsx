"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { defaultCompanyProfile, defaultProducts } from "@/lib/mock/defaults";
import { storageRepository } from "@/lib/storage/repository";
import type { CompanyProfile, Product, Task } from "@/types";

interface AppDataValue {
  hydrated: boolean;
  tasks: Task[];
  company: CompanyProfile;
  products: Product[];
  storageError: string;
  clearStorageError(): void;
  upsertTask(task: Task): boolean;
  deleteTask(id: string): boolean;
  saveCompany(profile: CompanyProfile): boolean;
  saveProducts(products: Product[]): boolean;
}

const AppDataContext = createContext<AppDataValue | null>(null);

export function AppDataProvider({ children }: { children: React.ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [company, setCompanyState] = useState(defaultCompanyProfile);
  const [products, setProductsState] = useState(defaultProducts);
  const [storageError, setStorageError] = useState("");
  const tasksRef = useRef<Task[]>([]);
  const companyRef = useRef(defaultCompanyProfile);
  const productsRef = useRef(defaultProducts);

  useEffect(() => {
    const loadedTasks = storageRepository.getTasks();
    const loadedCompany = storageRepository.getCompany();
    const loadedProducts = storageRepository.getProducts();
    tasksRef.current = loadedTasks; companyRef.current = loadedCompany; productsRef.current = loadedProducts;
    // Browser storage is an external system; hydrate it only after the client mounts.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTasks(loadedTasks); setCompanyState(loadedCompany); setProductsState(loadedProducts);
    setStorageError(storageRepository.consumeStorageError());
    setHydrated(true);
  }, []);

  const captureStorageError = useCallback(() => {
    setStorageError(storageRepository.consumeStorageError() || "本地保存失败，请检查浏览器存储空间后重试。");
  }, []);
  const upsertTask = useCallback((task: Task) => {
    const current = tasksRef.current;
    const next = current.some(item => item.id === task.id) ? current.map(item => item.id === task.id ? task : item) : [task, ...current];
    if (!storageRepository.saveTasks(next)) { captureStorageError(); return false; }
    tasksRef.current = next; setTasks(next); return true;
  }, [captureStorageError]);
  const deleteTask = useCallback((id: string) => {
    const next = tasksRef.current.filter(item => item.id !== id);
    if (!storageRepository.saveTasks(next)) { captureStorageError(); return false; }
    tasksRef.current = next; setTasks(next); return true;
  }, [captureStorageError]);
  const saveCompany = useCallback((profile: CompanyProfile) => {
    if (!storageRepository.saveCompany(profile)) { captureStorageError(); return false; }
    companyRef.current = profile; setCompanyState(profile); return true;
  }, [captureStorageError]);
  const saveProducts = useCallback((items: Product[]) => {
    if (!storageRepository.saveProducts(items)) { captureStorageError(); return false; }
    productsRef.current = items; setProductsState(items); return true;
  }, [captureStorageError]);
  const clearStorageError = useCallback(() => setStorageError(""), []);

  const value = useMemo(() => ({ hydrated, tasks, company, products, storageError, clearStorageError, upsertTask, deleteTask, saveCompany, saveProducts }), [hydrated, tasks, company, products, storageError, clearStorageError, upsertTask, deleteTask, saveCompany, saveProducts]);
  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData() {
  const value = useContext(AppDataContext);
  if (!value) throw new Error("useAppData must be used inside AppDataProvider");
  return value;
}
