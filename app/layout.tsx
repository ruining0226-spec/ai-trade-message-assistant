import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/layout/app-shell";
import { AppDataProvider } from "@/components/providers/app-data-provider";

export const metadata: Metadata = {
  title: "AI 外贸开发信助手",
  description: "面向空压机 B2B 海外客户开发的本地演示工作台",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body><AppDataProvider><AppShell>{children}</AppShell></AppDataProvider></body></html>;
}
