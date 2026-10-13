import type { Metadata } from "next";
import AssistantWidget from "@/components/assistant/assistant-widget";
import "./globals.css";

export const metadata: Metadata = {
  title: "BuzSsr",
  description: "Next.js 学习项目",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>
        {children}
        {/* 全局悬浮的数据助手，任何页面右下角都能打开 */}
        <AssistantWidget />
      </body>
    </html>
  );
}
