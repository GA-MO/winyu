"use client";

import { VexaChat } from "vexa/chat";

export function ChatPanel() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <VexaChat layout="page" className="min-h-[calc(100dvh-3.5rem)]" />
    </div>
  );
}
