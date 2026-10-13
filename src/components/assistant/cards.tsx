"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { authFetch } from "./auth";
import { chartCardMap } from "./chart-cards";

// 后端推过来的卡片，按 type 找组件渲染
export type Card = { type: string; [key: string]: unknown };

type ExportTask = {
  task_id: string;
  status: "pending" | "running" | "done" | "failed";
  date_range: string;
  columns: string[];
  row_count?: number | null;
  analysis?: string | null;
  download_url?: string;
  error?: string | null;
  progress?: { percent: number; stage: string } | null;
};

const POLL_INTERVAL = 2000;
const TYPE_INTERVAL = 30;

async function fetchTask(taskId: string): Promise<ExportTask | null> {
  const res = await authFetch(`/py/export/tasks/${taskId}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// 文件在后台生成，每 2 秒查一次进度，完成或失败就停
function useExportTask(initial: ExportTask): ExportTask {
  const [task, setTask] = useState(initial);
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const latest = await fetchTask(initial.task_id);
        if (stopped) return;
        if (!latest) {
          setTask((t) => ({ ...t, status: "failed", error: "导出任务不存在" }));
          return;
        }
        setTask(latest);
        if (latest.status === "done" || latest.status === "failed") return;
      } catch {
        // 网络抖动不算失败，下一轮接着查
      }
      if (!stopped) timer = setTimeout(poll, POLL_INTERVAL);
    };
    timer = setTimeout(poll, POLL_INTERVAL);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [initial.task_id]);
  return task;
}

// 解读是一次拿到的整段文字，逐字显示出来，和对话里的流式输出看起来一样
function useTypewriter(text: string | null | undefined): string {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!text) return;
    const timer = setInterval(() => {
      setCount((c) => {
        if (c >= text.length) clearInterval(timer);
        return Math.min(c + 1, text.length);
      });
    }, TYPE_INTERVAL);
    return () => clearInterval(timer);
  }, [text]);
  return text ? text.slice(0, count) : "";
}

function ExportCard({ card }: { card: Card }) {
  const task = useExportTask(card as unknown as ExportTask);
  const analysis = useTypewriter(task.analysis);
  const analysisRef = useRef<HTMLDivElement>(null);

  // 解读一个字一个字变长，聊天框要跟着滚到底
  useEffect(() => {
    analysisRef.current?.scrollIntoView({ block: "end" });
  }, [analysis]);

  // 下载链接 10 分钟过期，点的时候再查一次拿新链接，卡片放多久都能下
  const download = async () => {
    const latest = await fetchTask(task.task_id);
    if (latest?.download_url) window.location.href = latest.download_url;
  };

  const generating = task.status === "pending" || task.status === "running";
  return (
    <>
      <div className="rounded-md border border-zinc-200 bg-white p-3 text-sm">
        <div className="font-medium">订单明细</div>
        <div className="mt-1 text-xs text-zinc-500">
          {task.date_range}
          {task.status === "done" && ` · 共 ${task.row_count ?? 0} 行`}
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {task.columns.map((column) => (
            <span key={column} className="rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">
              {column}
            </span>
          ))}
        </div>
        {generating && task.progress && (
          <div className="mt-3">
            <div className="flex justify-between text-xs text-zinc-500">
              <span>{task.progress.stage}</span>
              <span>{task.progress.percent}%</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-100">
              <div
                className="h-full rounded-full bg-zinc-900 transition-all duration-500"
                style={{ width: `${task.progress.percent}%` }}
              />
            </div>
          </div>
        )}
        {/* 还在排队，或者 worker 刚接手、还没写进度 */}
        {generating && !task.progress && (
          <div className="mt-3 animate-pulse rounded-md bg-zinc-100 py-1.5 text-center text-zinc-500">
            {task.status === "pending" ? "排队中..." : "生成中..."}
          </div>
        )}
        {task.status === "done" && task.download_url && (
          <button
            onClick={download}
            className="mt-3 block w-full rounded-md bg-zinc-900 py-1.5 text-center text-white hover:bg-zinc-700"
          >
            下载 Excel
          </button>
        )}
        {task.status === "failed" && <div className="mt-3 text-xs text-red-500">导出失败：{task.error}</div>}
      </div>
      {analysis && (
        <div ref={analysisRef} className="rounded-lg bg-white px-3 py-2 text-sm leading-6 whitespace-pre-wrap shadow-sm">
          {analysis}
        </div>
      )}
    </>
  );
}

// type → 组件的映射表，加新卡片只需要写组件、在这里注册一行
export const cardMap: Record<string, (props: { card: Card }) => ReactNode> = {
  export: ExportCard,
  ...chartCardMap,
};
