import Link from "next/link";

export default function Home() {
  return (
    <main className="p-8">
      <h1 className="text-2xl font-semibold">BuzSsr</h1>
      <p className="mt-2 text-zinc-600">Next.js 学习项目。右下角的 AI 数据助手在任何页面都能打开。</p>

      <ul className="mt-6 list-disc space-y-2 pl-5">
        <li>
          <Link href="/lock-demo" className="text-blue-600 underline">
            防重复提交演示（lockFn / useLockFn）
          </Link>
        </li>
        <li>
          <Link href="/chat-basic" className="text-blue-600 underline">
            流式对话（最简版）
          </Link>
        </li>
        <li>
          <Link href="/chat-demo" className="text-blue-600 underline">
            流式对话演示（SSE + fetch 读流）
          </Link>
        </li>
        <li>
          <Link href="/review" className="text-blue-600 underline">
            AI 生成商品评价
          </Link>
        </li>
        <li>
          <a href="/api/order" className="text-blue-600 underline">
            GET /api/order
          </a>
        </li>
      </ul>
    </main>
  );
}
