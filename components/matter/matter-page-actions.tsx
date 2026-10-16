"use client";

import { useRouter } from "next/navigation";
import type { MatterBrief } from "@/lib/share/matter-actions";
import { MatterActions } from "./matter-actions";

/** The matter page's presses: after one lands, the page reloads its path and thread from the server. */
export function MatterPageActions({ brief }: { brief: Pick<MatterBrief, "code" | "actions" | "suggested" | "judges"> }) {
  const router = useRouter();
  return <MatterActions brief={brief} onActed={() => router.refresh()} />;
}
