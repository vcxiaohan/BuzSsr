"use client";

import { useRef, useState } from "react";
import { useSSEStream } from "@/hooks/use-sse-stream";

type Stats = { firstChunkMs: number; totalMs: number };

const EMPTY_STATS: Stats = { firstChunkMs: 0, totalMs: 0 };

export default function ChatDemoPage() {
  const [input, setInput] = useState("用 200 字左右介绍一下 SSE 和 WebSocket 的区别");
  // 按到达顺序保存每一段，显示时拼起来；单独存是为了能高亮每一段的边界
  const [chunks, setChunks] = useState<string[]>([]);
  const [highlight, setHighlight] = useState(false);
  const [error, setError] = useState("");
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);
  const startTimeRef = useRef(0);

  const { isStreaming, isWaiting, start, stop } = useSSEStream({
    getUrl: () => "/py/chat/stream",
    onData: (_, data) => {
      setChunks((prev) => [...prev, data]);
      setStats((prev) =>
        prev.firstChunkMs ? prev : { ...prev, firstChunkMs: Date.now() - startTimeRef.current },
      );
    },
    onComplete: () => setStats((prev) => ({ ...prev, totalMs: Date.now() - startTimeRef.current })),
    onError: (err) => setError(err.message),
  });

  const send = () => {
    const content = input.trim();
    if (!content) return;
    setChunks([]);
    setError("");
    setStats(EMPTY_STATS);
    startTimeRef.current = Date.now();
    start(content);
  };

  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-2xl font-semibold">流式对话演示</h1>
      <p className="mt-2 text-sm text-zinc-600">
        前端 fetch POST /py/chat/stream → Next 代理到 pyfast（FastAPI）→ 千问流式返回 → 前端逐段追加显示。
      </p>

      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        rows={3}
        className="mt-6 w-full rounded-md border border-zinc-300 p-3 text-sm"
      />

      <div className="mt-3 flex items-center gap-4">
        <button
          onClick={send}
          disabled={isStreaming}
          className="rounded-md bg-zinc-900 px-4 py-2 text-white disabled:opacity-40"
        >
          发送
        </button>
        <button
          onClick={stop}
          disabled={!isStreaming}
          className="rounded-md border border-zinc-300 px-4 py-2 disabled:opacity-40"
        >
          停止生成
        </button>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={highlight} onChange={(e) => setHighlight(e.target.checked)} />
          高亮每一段
        </label>
      </div>

      <div className="mt-4 text-xs text-zinc-500">
        {isWaiting ? "等待首段数据..." : isStreaming ? "输出中..." : "空闲"}
        {" · "}收到 {chunks.length} 段
        {stats.firstChunkMs > 0 && ` · 首段耗时 ${stats.firstChunkMs}ms`}
        {stats.totalMs > 0 && ` · 总耗时 ${stats.totalMs}ms`}
      </div>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      <div className="mt-4 min-h-40 whitespace-pre-wrap rounded-md border border-zinc-200 p-4 leading-7">
        {highlight
          ? chunks.map((chunk, i) => (
              <span key={i} className={i % 2 ? "bg-amber-100" : "bg-sky-100"}>
                {chunk}
              </span>
            ))
          : chunks.join("")}
        {isStreaming && <span className="animate-pulse">▍</span>}
      </div>
    </main>
  );
}
