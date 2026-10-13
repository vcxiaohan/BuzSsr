"use client";

import { useState } from "react";
import { useLockFn } from "@/hooks/use-lock-fn";

type Order = { id: string; source: string };

export default function LockDemoPage() {
  const [orders, setOrders] = useState<Order[]>([]);

  const submit = async (source: string) => {
    const res = await fetch("/api/order", {
      method: "POST",
      body: JSON.stringify({ source }),
    });
    const { data } = await res.json();
    setOrders((prev) => [...prev, data]);
  };

  const [lockedSubmit, loading] = useLockFn(submit);

  return (
    <main className="p-8">
      <h1 className="text-2xl font-semibold">防重复提交演示</h1>
      <p className="mt-2 text-sm text-zinc-600">接口延迟 2 秒，在 2 秒内连点按钮试试。</p>

      <div className="mt-6 flex gap-4">
        <button onClick={() => submit("不加锁")} className="rounded-md bg-zinc-900 px-4 py-2 text-white">
          不加锁
        </button>
        <button onClick={() => lockedSubmit("加锁")} className="rounded-md bg-zinc-900 px-4 py-2 text-white">
          {loading ? "提交中..." : "加锁"}
        </button>
      </div>

      <ul className="mt-6 space-y-1 text-sm">
        {orders.map((o) => (
          <li key={o.id + o.source}>
            {o.id} · {o.source}
          </li>
        ))}
      </ul>
    </main>
  );
}
