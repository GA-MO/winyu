"use client";

import { useEffect } from "react";

/** Calls `refresh` whenever the window regains focus or the page becomes visible again, and every `intervalMs` while the page is visible. */
export function useRefreshWhileVisible(refresh: () => void, intervalMs: number): void {
  useEffect(() => {
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [refresh]);
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const stopPolling = () => {
      if (timer !== null) clearInterval(timer);
      timer = null;
    };
    const startPolling = () => {
      stopPolling();
      timer = setInterval(refresh, intervalMs);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        stopPolling();
        return;
      }
      refresh();
      startPolling();
    };
    if (document.visibilityState !== "hidden") startPolling();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      stopPolling();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [refresh, intervalMs]);
}
