"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import type { InboxCounts } from "./types";

const COUNTS_ENDPOINT = "/api/notifications";
const NONE: InboxCounts = { decisions: 0, sharedUnread: 0 };

/** The bell's and the rail's counts, fetched again on every page and whenever `key` changes. */
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
  return { counts, refresh };
}
