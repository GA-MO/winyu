"use client";

import { z } from "zod";
import { VexaProvider } from "vexa/react";
import type { ChatLabels } from "vexa/chat";
import { TH } from "@/lib/i18n/th";
import { ThemeProvider, useTheme } from "@/components/theme/theme-provider";
import { readHostContext } from "@/components/providers/host-context";
import { COP_CARD_COMPONENTS } from "@/components/cards/data-card";
import { askTool, copActionTool } from "@/components/cards/action-tool";
import { ASK_TOOL } from "@/lib/cards/host-tools";
import { sendToChat } from "@/components/providers/chat-sender";
import { normalizeCopSpec } from "@/lib/cards/normalize";
import { describeCopToolCall } from "@/components/cards/describe-tool";
import { renderCopApproval } from "@/components/cards/approval-card";

const CHAT_LABELS: Partial<ChatLabels> = {
  emptyTitle: TH.chat.emptyTitle,
  emptyDescription: TH.chat.emptyDescription,
  placeholder: TH.landing.composerPlaceholder,
  send: TH.chat.send,
  stop: TH.chat.stop,
  thinking: TH.chat.thinking,
  approve: TH.chat.approve,
  reject: TH.chat.reject,
  approved: TH.chat.approved,
  rejected: TH.chat.rejected,
  approveTool: () => TH.chat.approveTool,
  startOver: TH.chat.startOver,
  carouselHint: TH.chat.carouselHint,
  carouselPrevious: TH.chat.carouselPrevious,
  carouselNext: TH.chat.carouselNext,
  selectModel: TH.chat.selectModel,
  run: TH.common.confirm,
  cancel: TH.common.cancel,
};

const contextSchema = z.object({ threadId: z.string().nullable(), preloadPacketId: z.string().nullable() });
const HOST_TOOLS = { cop_action: copActionTool(sendToChat), [ASK_TOOL.name]: askTool(sendToChat) };

function VexaLayer({ children }: { children: React.ReactNode }) {
  const { mode } = useTheme();
  return (
    <VexaProvider
      components={COP_CARD_COMPONENTS}
      normalizeSpec={normalizeCopSpec}
      describeToolCall={describeCopToolCall}
      renderApproval={renderCopApproval}
      format={{ locale: "th-TH", currency: "THB" }}
      theme={{ mode }}
      chat={{ title: TH.session.title, subtitle: TH.chat.subtitle, labels: CHAT_LABELS }}
      contextSchema={contextSchema}
      context={readHostContext}
      tools={HOST_TOOLS}
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
