import { useCallback, useRef, useState } from "react";

type SSEPayload = {
  message_id: string;
  data?: string;
  error?: string;
};

type Options = {
  getUrl: () => string;
  getHeaders?: () => Record<string, string>;
  onData?: (messageId: string, data: string) => void;
  onEnd?: (messageId: string) => void;
  onError?: (error: Error) => void;
  onComplete?: () => void;
};

const MAX_RETRY = 3;
// 只限制“发出请求 → 收到响应头”这段时间，开始收数据后就清掉
const TIMEOUT_MS = 10 * 60 * 1000;

// 一条 SSE 消息里可能有多行 data:，按规范用换行拼起来
function parseEvent(rawEvent: string): string | null {
  const lines = rawEvent.split("\n").filter((line) => line.startsWith("data:"));
  if (lines.length === 0) return null;
  return lines.map((line) => line.slice(5).replace(/^ /, "")).join("\n");
}

export function useSSEStream(options: Options) {
  const { getUrl, getHeaders, onData, onEnd, onError, onComplete } = options;

  const [isStreaming, setIsStreaming] = useState(false);
  // 已发出请求、还没收到第一段数据
  const [isWaiting, setIsWaiting] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);
  const retryCountRef = useRef(0);
  const timeoutIdRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 超时和用户点停止都会抛 AbortError，靠这个标记区分，用户主动停止时不重试
  const stoppedByUserRef = useRef(false);

  const clearTimer = () => {
    if (timeoutIdRef.current) {
      clearTimeout(timeoutIdRef.current);
      timeoutIdRef.current = null;
    }
  };

  const stop = useCallback(() => {
    stoppedByUserRef.current = true;
    clearTimer();
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setIsStreaming(false);
    setIsWaiting(false);
  }, []);

  const start = useCallback(
    async (content: string) => {
      if (isStreaming) return;

      setIsStreaming(true);
      setIsWaiting(true);
      retryCountRef.current = 0;
      stoppedByUserRef.current = false;

      const finish = (messageIds: Set<string>) => {
        messageIds.forEach((id) => onEnd?.(id));
        onComplete?.();
        setIsStreaming(false);
        setIsWaiting(false);
      };

      const attemptFetch = async (): Promise<void> => {
        const controller = new AbortController();
        abortControllerRef.current = controller;
        timeoutIdRef.current = setTimeout(() => controller.abort(), TIMEOUT_MS);
        const messageIds = new Set<string>();

        try {
          const res = await fetch(getUrl(), {
            method: "POST",
            headers: { "Content-Type": "application/json", ...getHeaders?.() },
            body: JSON.stringify({ content }),
            signal: controller.signal,
          });
          clearTimer();

          if (!res.ok || !res.body) {
            throw new Error(`HTTP ${res.status}`);
          }

          const reader = res.body.getReader();
          const decoder = new TextDecoder("utf-8");
          let buffer = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            // stream: true：一个中文字的字节被拆到两次 read 里时，先留着不解码，避免乱码
            buffer = (buffer + decoder.decode(value, { stream: true })).replace(/\r\n/g, "\n");

            // 一次 read 拿到的可能是半条消息，最后一段不完整的留到下次拼接
            const events = buffer.split("\n\n");
            buffer = events.pop() ?? "";

            for (const rawEvent of events) {
              const data = parseEvent(rawEvent);
              if (data === null) continue;
              if (data === "[DONE]") {
                finish(messageIds);
                return;
              }

              const payload = JSON.parse(data) as SSEPayload;
              if (payload.error) throw new Error(payload.error);
              if (payload.data === undefined) continue;

              messageIds.add(payload.message_id);
              setIsWaiting(false);
              onData?.(payload.message_id, payload.data);
            }
          }

          finish(messageIds);
        } catch (err) {
          clearTimer();
          if (stoppedByUserRef.current) return;

          const error = err as Error;
          if (error.name === "AbortError") {
            if (retryCountRef.current >= MAX_RETRY) {
              onError?.(new Error("连接超时，请稍后重试"));
              setIsStreaming(false);
              setIsWaiting(false);
              return;
            }
            // 指数退避：2s、4s、8s 后重试
            retryCountRef.current++;
            await new Promise((r) => setTimeout(r, 2 ** retryCountRef.current * 1000));
            if (stoppedByUserRef.current) return;
            return attemptFetch();
          }

          controller.abort();
          onError?.(error);
          setIsStreaming(false);
          setIsWaiting(false);
        }
      };

      return attemptFetch();
    },
    [isStreaming, getUrl, getHeaders, onData, onEnd, onError, onComplete],
  );

  return { isStreaming, isWaiting, start, stop };
}
