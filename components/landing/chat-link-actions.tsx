"use client";

import { useMemo, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { CardActionsProvider, type CardAction } from "@/components/cards/card-actions";
import { actionHref } from "./chat-entry";

/** Card buttons outside the chat (dashboard, landing, stories) open a new chat on the action instead of running it in place. */
export function ChatLinkActions({ children }: { children: ReactNode }) {
  const router = useRouter();
  const value = useMemo(
    () => ({
      runAction: (action: CardAction) => {
        const href = actionHref(action);
        if (href) router.push(href);
      },
    }),
    [router],
  );
  return <CardActionsProvider value={value}>{children}</CardActionsProvider>;
}
