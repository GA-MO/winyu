"use client";

import { VexaProvider } from "vexa/react";
import type { ChatLabels } from "vexa/chat";
import { TH } from "@/lib/i18n/th";

const CHAT_LABELS: Partial<ChatLabels> = {
  emptyTitle: TH.chat.emptyTitle,
  emptyDescription: TH.chat.emptyDescription,
  placeholder: TH.chat.placeholder,
  send: TH.chat.send,
  stop: TH.chat.stop,
  thinking: TH.chat.thinking,
  approve: TH.chat.approve,
  reject: TH.chat.reject,
  startOver: TH.chat.startOver,
  selectModel: TH.chat.selectModel,
};

const SUGGESTIONS = [
  { label: "สวัสดี", prompt: "สวัสดี" },
  { label: "ping", prompt: "ping" },
];

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <VexaProvider
      format={{ locale: "th-TH", currency: "THB" }}
      chat={{ title: TH.chat.title, subtitle: TH.chat.subtitle, labels: CHAT_LABELS, suggestions: SUGGESTIONS }}
    >
      {children}
    </VexaProvider>
  );
}
