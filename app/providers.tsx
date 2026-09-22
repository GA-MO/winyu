"use client";

import { z } from "zod";
import { VexaProvider } from "vexa/react";
import type { ChatLabels } from "vexa/chat";
import { TH } from "@/lib/i18n/th";
import { ThemeProvider, useTheme } from "@/components/theme/theme-provider";
import { readHostContext } from "@/components/providers/host-context";

const CHAT_LABELS: Partial<ChatLabels> = {
  emptyTitle: TH.chat.emptyTitle,
  emptyDescription: TH.chat.emptyDescription,
  placeholder: TH.landing.composerPlaceholder,
  send: TH.chat.send,
  stop: TH.chat.stop,
  thinking: TH.chat.thinking,
  approve: TH.chat.approve,
  reject: TH.chat.reject,
  startOver: TH.chat.startOver,
  selectModel: TH.chat.selectModel,
  run: TH.common.confirm,
  cancel: TH.common.cancel,
};

const contextSchema = z.object({ threadId: z.string().nullable(), preloadPacketId: z.string().nullable() });

function VexaLayer({ children }: { children: React.ReactNode }) {
  const { mode } = useTheme();
  return (
    <VexaProvider
      format={{ locale: "th-TH", currency: "THB" }}
      theme={{ mode }}
      chat={{ title: TH.session.title, subtitle: TH.chat.subtitle, labels: CHAT_LABELS }}
      contextSchema={contextSchema}
      context={readHostContext}
    >
      {children}
    </VexaProvider>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <VexaLayer>{children}</VexaLayer>
    </ThemeProvider>
  );
}
