"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import type { InboxCounts } from "./types";

const COUNTS_ENDPOINT = "/api/notifications";
const NONE: InboxCounts = { decisions: 0, sharedUnread: 0 };
const POLL_INTERVAL_MS = 10_000;

/** The bell's and the rail's counts, fetched again on every page, whenever the window regains focus, every 10 seconds while the page is visible, and whenever `key` changes. */
export function useInboxCounts(key: unknown = null): { counts: InboxCounts; refresh: () => void } {
  const pathname = usePathname();
  const [counts, setCounts] = useState<InboxCounts>(NONE);
  const refresh = useCallback(() => {
    fetch(COUNTS_ENDPOINT)
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: InboxCounts | null) => setCounts(payload ?? NONE))
      .catch(() => undefined);
  }, []);
  useEffect(refresh, [refresh, pathname, key]);
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
      timer = setInterval(refresh, POLL_INTERVAL_MS);
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
  }, [refresh]);
  return { counts, refresh };
}
