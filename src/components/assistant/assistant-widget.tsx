"use client";

import { useEffect, useRef, useState } from "react";
import { authFetch } from "./auth";
import { cardMap, type Card } from "./cards";

// 助手的一条回复由多段组成，按到达顺序排：先说的话、卡片、卡片后面的解读
type Block = { kind: "text"; text: string } | { kind: "card"; card: Card };

// 用户消息用 text，助手消息用 blocks
type Message = { id: string; role: "user" | "assistant"; text: string; blocks: Block[]; error?: string };

type ChunkPayload = { message_id: string; data?: string; card?: Card; error?: string };

const EXAMPLES = [
  "查询抖音这 7 天的订单量，用折线图画出来",
  "昨天卖得怎么样",
  "最近 30 天哪个商品退款最多",
  "导出今天的订单，只要订单号、下单人、订单状态",
];

export default function AssistantWidget() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [chatId, setChatId] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // 有新内容时滚到底部
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  // 只改最后一条（正在生成的助手消息）
  const updateLast = (update: (message: Message) => Message) => {
    setMessages((prev) => [...prev.slice(0, -1), update(prev[prev.length - 1])]);
  };

  // 文字接在最后一段文字后面；最后一段是卡片时，另起一段
  const appendText = (message: Message, text: string): Message => {
    const last = message.blocks[message.blocks.length - 1];
    if (last?.kind === "text") {
      return { ...message, blocks: [...message.blocks.slice(0, -1), { kind: "text", text: last.text + text }] };
    }
    return { ...message, blocks: [...message.blocks, { kind: "text", text }] };
  };

  const send = async (content: string) => {
    if (!content.trim() || loading) return;
    setInput("");
    setLoading(true);
    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: "user", text: content, blocks: [] },
      { id: crypto.randomUUID(), role: "assistant", text: "", blocks: [] },
    ]);

    const id = chatId ?? crypto.randomUUID();
    setChatId(id);
    const controller = new AbortController();
    controllerRef.current = controller;

    try {
      const res = await authFetch("/py/assistant/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, chat_id: id }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop()!;

        for (const event of events) {
          if (!event.startsWith("data: ")) continue;
          const data = event.slice(6);
          if (data === "[DONE]") continue;

          const payload = JSON.parse(data) as ChunkPayload;
          if (payload.data) updateLast((m) => appendText(m, payload.data!));
          if (payload.card) updateLast((m) => ({ ...m, blocks: [...m.blocks, { kind: "card", card: payload.card! }] }));
          if (payload.error) updateLast((m) => ({ ...m, error: payload.error }));
        }
      }
    } catch (error) {
      // 用户点停止时抛的 AbortError 不算出错
      if ((error as Error).name !== "AbortError") {
        updateLast((m) => ({ ...m, error: (error as Error).message }));
      }
    } finally {
      controllerRef.current = null;
      setLoading(false);
    }
  };

  const stop = () => controllerRef.current?.abort();

  // 丢掉 chatId，下次请求后端就会开一个新会话
  const reset = () => {
    setChatId(null);
    setMessages([]);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed right-6 bottom-6 z-50 rounded-full bg-zinc-900 px-5 py-3 text-sm text-white shadow-lg hover:bg-zinc-700"
      >
        AI 数据助手
      </button>
    );
  }

  return (
    <div className="fixed right-6 bottom-6 z-50 flex h-[600px] w-[400px] flex-col rounded-xl border border-zinc-200 bg-zinc-50 shadow-2xl">
      <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
        <span className="font-medium">AI 数据助手</span>
        <div className="flex gap-3 text-sm text-zinc-500">
          <button onClick={reset} disabled={loading} className="hover:text-zinc-900 disabled:opacity-40">
            新对话
          </button>
          <button onClick={() => setOpen(false)} className="hover:text-zinc-900">
            收起
          </button>
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="space-y-2">
            <p className="text-sm text-zinc-500">可以这样问我：</p>
            {EXAMPLES.map((example) => (
              <button
                key={example}
                onClick={() => send(example)}
                className="block w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-left text-sm hover:bg-zinc-100"
              >
                {example}
              </button>
            ))}
          </div>
        )}

        {messages.map((message) => {
          if (message.role === "user") {
            return (
              <div key={message.id} className="flex justify-end">
                <div className="max-w-[85%] rounded-lg bg-zinc-900 px-3 py-2 text-sm whitespace-pre-wrap text-white">
                  {message.text}
                </div>
              </div>
            );
          }
          return (
            <div key={message.id} className="max-w-[90%] space-y-2">
              {message.blocks.map((block, j) => {
                if (block.kind === "text") {
                  // 模型在调工具前常带几个换行，不去掉的话文字和卡片之间会空出一大块
                  if (!block.text.trim()) return null;
                  return (
                    <div key={j} className="rounded-lg bg-white px-3 py-2 text-sm leading-6 whitespace-pre-wrap shadow-sm">
                      {block.text.trim()}
                    </div>
                  );
                }
                // 不认识的 type 直接跳过，不让页面崩
                const CardComponent = cardMap[block.card.type];
                return CardComponent ? <CardComponent key={j} card={block.card} /> : null;
              })}
              {message.error && <div className="text-xs text-red-500">出错了：{message.error}</div>}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-zinc-200 p-3">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              // 回车发送，Shift + 回车换行；输入法正在选字时的回车不算
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send(input);
              }
            }}
            rows={2}
            placeholder="问点数据，例如：导出昨天的订单"
            className="flex-1 resize-none rounded-md border border-zinc-300 bg-white p-2 text-sm"
          />
          {loading ? (
            <button onClick={stop} className="rounded-md border border-red-300 px-3 text-sm text-red-600">
              停止
            </button>
          ) : (
            <button
              onClick={() => send(input)}
              disabled={!input.trim()}
              className="rounded-md bg-zinc-900 px-3 text-sm text-white disabled:opacity-40"
            >
              发送
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
