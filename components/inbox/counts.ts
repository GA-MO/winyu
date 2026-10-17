"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useRefreshWhileVisible } from "@/components/ui/use-refresh-while-visible";
import type { InboxCounts } from "./types";

const COUNTS_ENDPOINT = "/api/notifications";
const NONE: InboxCounts = { decisions: 0, sharedUnread: 0, unreadUpdates: 0 };
const POLL_INTERVAL_MS = 10_000;
const CHANGED_EVENT = "winyu:inbox-changed";

/** Tells the bell on this page that a press changed what waits on the person, so it counts again now rather than at its next poll. */
export function announceInboxChanged(): void {
  window.dispatchEvent(new Event(CHANGED_EVENT));
}

/** The bell's and the rail's counts, fetched again on every page, whenever the window regains focus, every 10 seconds while the page is visible, whenever `key` changes, and when a press on the page announces a change. */
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
    window.addEventListener(CHANGED_EVENT, refresh);
    return () => window.removeEventListener(CHANGED_EVENT, refresh);
  }, [refresh]);
  useRefreshWhileVisible(refresh, POLL_INTERVAL_MS);
  return { counts, refresh };
}
