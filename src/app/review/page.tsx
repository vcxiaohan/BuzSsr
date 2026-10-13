"use client";

import { useRef, useState, type ReactNode } from "react";

// [END] 之后每行一张卡片，按 type 区分。done 为 false 表示这一行还在生成中
type Review = { type: "review"; nickname?: string; score?: number; content: string };
type Tags = { type: "tags"; tags: string[] };
type Tip = { type: "tip"; content: string };
type Options = { type: "options"; options: string[] };
type Card = (Review | Tags | Tip | Options) & { done: boolean };

const END_MARK = "[END]";

// [END] 之前是回复文字。还没收到 [END] 时，末尾可能是半个标记（"["、"[E"、"[EN"、"[END"），先不显示
function getReplyText(raw: string) {
  const endIndex = raw.indexOf(END_MARK);
  if (endIndex !== -1) return raw.slice(0, endIndex).trim();
  return raw.replace(/\[(E(ND?)?)?$/, "");
}

// 还没收全的 JSON 无法 JSON.parse，用正则把已经到达的字段先取出来。
// content 可能写到一半，所以不要求结尾的引号；(?:[^"\\]|\\.)* 会停在半个转义符之前
function parsePartialReview(json: string): Card | null {
  const nickname = json.match(/"nickname"\s*:\s*"((?:[^"\\]|\\.)*)"/)?.[1];
  const score = json.match(/"score"\s*:\s*(\d)/)?.[1];
  const content = json.match(/"content"\s*:\s*"((?:[^"\\]|\\.)*)/)?.[1] ?? "";
  if (nickname === undefined && score === undefined && !content) return null;

  let text = content;
  try {
    // 把 \n、\" 这类转义还原成真实字符
    text = JSON.parse(`"${content}"`);
  } catch {}
  return { type: "review", nickname, score: score ? Number(score) : undefined, content: text, done: false };
}

// 一行 json:{...} 转成一张卡片
function parseLine(line: string): Card | null {
  const text = line.trim();
  if (!text.startsWith("json:")) return null;
  const json = text.slice(5);
  try {
    return { ...JSON.parse(json), done: true };
  } catch {
    // 只有评价内容长，值得边生成边展示；tags、tip 很短，等整行收全再渲染
    if (/"type"\s*:\s*"review"/.test(json)) return parsePartialReview(json);
    return null;
  }
}

type CardProps = { card: Card; loading: boolean; onSelect: (text: string) => void };

function ReviewCard({ card, loading }: CardProps) {
  const { nickname, score, content } = card as Review;
  // 模型可能给出越界的分数，repeat 遇到负数还会报错
  const stars = Math.min(5, Math.max(0, Math.round(Number(score) || 0)));
  return (
    <div className="rounded-md border border-zinc-200 p-3 text-sm">
      <div className="flex justify-between text-zinc-500">
        <span>{nickname ?? "..."}</span>
        <span className="text-amber-500">{"★".repeat(stars)}</span>
      </div>
      <p className="mt-2 min-h-6 leading-6">
        {content}
        {!card.done && loading && <span className="animate-pulse">▍</span>}
      </p>
    </div>
  );
}

function TagsCard({ card }: CardProps) {
  const { tags } = card as Tags;
  if (!Array.isArray(tags)) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {tags.map((tag) => (
        <span key={tag} className="rounded-full bg-blue-50 px-3 py-1 text-xs text-blue-600">
          # {tag}
        </span>
      ))}
    </div>
  );
}

function TipCard({ card }: CardProps) {
  const { content } = card as Tip;
  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
      <span className="font-medium">提示：</span>
      {content}
    </div>
  );
}

function OptionsCard({ card, loading, onSelect }: CardProps) {
  const { options } = card as Options;
  if (!Array.isArray(options)) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <button
          key={option}
          onClick={() => onSelect(option)}
          disabled={loading}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 disabled:opacity-40"
        >
          {option}
        </button>
      ))}
    </div>
  );
}

// type → 组件的映射表，加新卡片只需要写组件、在这里注册一行
const cardMap: Record<string, (props: CardProps) => ReactNode> = {
  review: ReviewCard,
  tags: TagsCard,
  tip: TipCard,
  options: OptionsCard,
};

export default function ReviewPage() {
  const [input, setInput] = useState("给一款蓝牙耳机生成 5 条好评，突出音质和续航");
  // 模型返回的原始文本，回复文字从它算出来
  const [raw, setRaw] = useState("");
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(false);
  // 会话 id：第一次发送时由前端生成，之后每次都带上，后端拿它找到之前的对话；null 表示还没开始会话
  const [chatId, setChatId] = useState<string | null>(null);
  // 当前这次请求的 AbortController，点停止时用它中断
  const controllerRef = useRef<AbortController | null>(null);

  const send = async (content: string) => {
    setRaw("");
    setCards([]);
    setLoading(true);

    const controller = new AbortController();
    controllerRef.current = controller;

    // crypto.randomUUID 只能在 HTTPS 或 localhost 下使用
    const id = chatId ?? crypto.randomUUID();
    setChatId(id);

    let text = "";
    // 下一行从哪开始解析；-1 表示还没遇到 [END]
    let index = -1;
    // 已经收全的卡片，解析一次就不再碰
    const parsed: Card[] = [];

    try {
      const res = await fetch("/py/review/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, chat_id: id }),
        signal: controller.signal,
      });

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const messages = buffer.split("\n\n");
        buffer = messages.pop()!;

        for (const message of messages) {
          if (!message.startsWith("data: ")) continue;

          const data = message.replace(/^data: /, "");
          if (data === "[DONE]") continue;

            const payload = JSON.parse(data);
            if (!payload.data) continue;
          text += payload.data;
          setRaw(text);

          if (index === -1) {
            const endIndex = text.indexOf(END_MARK);
            if (endIndex === -1) continue;
            index = endIndex + END_MARK.length;
          }

          // 从下标往后找换行：每找到一个，说明有一行收全了，解析完把下标挪到下一行开头
          let newline = text.indexOf("\n", index);
          while (newline !== -1) {
            const card = parseLine(text.slice(index, newline));
            // 这一行已经结束，就算 JSON 有问题也不会再变了
            if (card) parsed.push({ ...card, done: true });
            index = newline + 1;
            newline = text.indexOf("\n", index);
          }

          // 下标之后剩下的就是正在生成的那一行
          const current = parseLine(text.slice(index));
          setCards(current ? [...parsed, current] : [...parsed]);
        }
      }
    } catch (error) {
      // abort() 会让 fetch / reader.read() 抛 AbortError，这是用户主动停止，不算出错
      if ((error as Error).name !== "AbortError") console.error(error);
    } finally {
      controllerRef.current = null;
      setLoading(false);
    }
  };

  // 中断请求：浏览器断开连接，后端检测到断开也会停止调用模型
  const stop = () => {
    controllerRef.current?.abort();
  };

  // 点选项：把选项文字填进输入框，并作为下一句话直接发出去
  const select = (text: string) => {
    setInput(text);
    send(text);
  };

  // 丢掉 chatId，下次请求后端就会开一个新会话
  const reset = () => {
    setChatId(null);
    setRaw("");
    setCards([]);
  };

  const replyText = getReplyText(raw);
  const reviewCount = cards.filter((card) => card.type === "review").length;

  return (
    <main className="mx-auto max-w-5xl p-8">
      <h1 className="text-2xl font-semibold">AI 生成商品评价</h1>

      <div className="mt-6 grid grid-cols-2 gap-6">
        <section>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={3}
            className="w-full rounded-md border border-zinc-300 p-3 text-sm"
          />
          <div className="mt-3 flex items-center gap-3">
            <button
              onClick={() => send(input)}
              disabled={loading}
              className="rounded-md bg-zinc-900 px-4 py-2 text-white disabled:opacity-40"
            >
              {loading ? "生成中..." : "生成"}
            </button>
            {loading && (
              <button onClick={stop} className="rounded-md border border-red-300 px-4 py-2 text-red-600">
                停止
              </button>
            )}
            <button
              onClick={reset}
              disabled={loading || !chatId}
              className="rounded-md border border-zinc-300 px-4 py-2 disabled:opacity-40"
            >
              新对话
            </button>
            <span className="text-xs text-zinc-500">
              {chatId ? "多轮对话中，可以接着提修改要求" : "新对话"}
            </span>
          </div>

          <div className="mt-4 min-h-24 whitespace-pre-wrap rounded-md border border-zinc-200 p-4 leading-7">
            {replyText}
          </div>
        </section>

        <section>
          <h2 className="font-medium">评价预览（{reviewCount}）</h2>
          <ul className="mt-3 space-y-3">
            {cards.map((card, i) => {
              // 不认识的 type 直接跳过，不让页面崩
              const CardComponent = cardMap[card.type];
              if (!CardComponent) return null;
              return (
                <li key={i}>
                  <CardComponent card={card} loading={loading} onSelect={select} />
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </main>
  );
}
