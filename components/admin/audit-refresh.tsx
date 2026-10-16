"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useRefreshWhileVisible } from "@/components/ui/use-refresh-while-visible";

const POLL_INTERVAL_MS = 10_000;

/** Reads the Audit tab again from the server on the bell's cadence (on focus, and every 10 seconds while visible), so a send, pass-on or accept made in another window shows without a reload. */
export function AuditRefresh() {
  const router = useRouter();
  const refresh = useCallback(() => router.refresh(), [router]);
  useRefreshWhileVisible(refresh, POLL_INTERVAL_MS);
  return null;
}
