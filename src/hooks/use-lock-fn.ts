import { useRef, useState } from "react";

export function useLockFn<P extends unknown[], R>(
  fn: (...args: P) => Promise<R>,
  timeout = 10000,
) {
  const lockRef = useRef(false);
  const [loading, setLoading] = useState(false);

  const unlock = () => {
    lockRef.current = false;
    setLoading(false);
  };

  const run = async (...args: P) => {
    if (lockRef.current) return;
    lockRef.current = true;
    setLoading(true);
    // 兜底：Promise 一直不结束时，到时间也强制解锁
    const timer = setTimeout(unlock, timeout);
    try {
      return await fn(...args);
    } finally {
      clearTimeout(timer);
      unlock();
    }
  };

  return [run, loading] as const;
}
