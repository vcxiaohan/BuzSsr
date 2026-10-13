"use client";

import { useState } from "react";

export default function ChatBasicPage() {
  const [input, setInput] = useState("用 200 字左右介绍一下 SSE");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);

  const send = async () => {
    setAnswer("");
    setLoading(true);

    const res = await fetch("/py/chat/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: input }),
    });

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      // stream: true：一个中文字的字节可能被拆在两次 read 里，不加会出乱码
      buffer += decoder.decode(value, { stream: true });

      // 一次 read 可能只读到半条消息，最后一段不完整的留到下次拼接
      const messages = buffer.split("\n\n");
      buffer = messages.pop()!;

      for (const message of messages) {
        // 后端空闲 15 秒会发一条 ": ping" 心跳，冒号开头是 SSE 的注释行，不是数据
        if (!message.startsWith("data: ")) continue;

        const data = message.replace(/^data: /, "");
        if (data === "[DONE]") continue;

        const payload = JSON.parse(data);
        if (payload.data) {
          setAnswer((prev) => prev + payload.data);
        }
      }
    }

    setLoading(false);
  };

  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-2xl font-semibold">流式对话（最简版）</h1>

      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        rows={3}
        className="mt-6 w-full rounded-md border border-zinc-300 p-3 text-sm"
      />

      <button
        onClick={send}
        disabled={loading}
        className="mt-3 rounded-md bg-zinc-900 px-4 py-2 text-white disabled:opacity-40"
      >
        {loading ? "生成中..." : "发送"}
      </button>

      <div className="mt-4 min-h-40 whitespace-pre-wrap rounded-md border border-zinc-200 p-4 leading-7">
        {answer}
      </div>
    </main>
  );
}
