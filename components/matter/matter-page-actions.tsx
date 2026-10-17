"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { announceInboxChanged } from "@/components/inbox/counts";
import type { MatterBrief } from "@/lib/share/matter-actions";
import { MatterActions } from "./matter-actions";

/** The matter page's presses: after one lands, the bell counts again and the page reloads its path and thread from the server, its buttons held until the new page is drawn. */
export function MatterPageActions({ brief }: { brief: Pick<MatterBrief, "code" | "actions" | "suggested" | "judges" | "sent"> }) {
  const router = useRouter();
  const [settling, startTransition] = useTransition();
  const acted = () => {
    announceInboxChanged();
    startTransition(() => router.refresh());
  };
  return <MatterActions brief={brief} onActed={acted} settling={settling} />;
}
