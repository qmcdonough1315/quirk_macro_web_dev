import { useEffect, useState } from "react";

import { getEasternRefreshWindow } from "@/lib/ai-refresh";

/** Updates shortly after an Eastern-time commentary boundary without a hard refresh. */
export function useAiRefreshWindow() {
  const [windowKey, setWindowKey] = useState(() => getEasternRefreshWindow());

  useEffect(() => {
    const update = () => setWindowKey(getEasternRefreshWindow());
    const interval = window.setInterval(update, 30_000);
    return () => window.clearInterval(interval);
  }, []);

  return windowKey;
}