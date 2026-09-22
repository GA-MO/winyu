"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithApprovalResponses, lastAssistantMessageIsCompleteWithToolCalls } from "ai";
import { Inbox, Sparkles } from "lucide-react";
import type { VexaMessage } from "vexa/protocol";
import { AssistantMessage, UserMessage } from "vexa/chat";
import { Conversation, ConversationContent, ConversationScrollButton } from "vexa/ai-elements/conversation";
import { useVexaHostContext } from "vexa/react";
import type { QuickAction } from "@/lib/contracts";
import { TH } from "@/lib/i18n/th";
import { CopComposer } from "@/components/composer/cop-composer";
import { GlassPanel } from "@/components/ui/glass-panel";
import { GlowBackdrop } from "@/components/ui/glow-backdrop";
import { setHostContext } from "@/components/providers/host-context";
import { COP_CHAT_LABELS } from "./labels";

const CHAT_ENDPOINT = "/api/chat";
const THROTTLE_MS = 50;
const FALLBACK_MODEL = "mock";
const COLUMN = "mx-auto w-full max-w-3xl px-4 sm:px-6";

type ModelsPayload = { models?: { id: string }[]; default?: string | null };

export type SessionPreload = { packetId: string; fromName: string };

export function SessionChat({
  threadId,
  initialPrompt,
  preload,
  suggestions,
}: {
  threadId: string;
  initialPrompt: string | null;
  preload: SessionPreload | null;
  suggestions: QuickAction[];
}) {
  const router = useRouter();
  const host = useVexaHostContext();
  const hostRef = useRef(host);
  hostRef.current = host;
  const [model, setModel] = useState(FALLBACK_MODEL);
  const [modelReady, setModelReady] = useState(false);
  const modelRef = useRef(model);
  modelRef.current = model;
  const [text, setText] = useState("");
  const sent = useRef(false);

  useEffect(() => {
    setHostContext({ threadId, preloadPacketId: preload?.packetId ?? null });
  }, [preload, threadId]);

  useEffect(() => {
    const controller = new AbortController();
    fetch(CHAT_ENDPOINT, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: ModelsPayload | null) => {
        if (payload?.default) setModel(payload.default);
      })
      .catch(() => undefined)
      .finally(() => setModelReady(true));
    return () => controller.abort();
  }, []);

  const transport = useMemo(
    () =>
      new DefaultChatTransport<VexaMessage>({
        api: CHAT_ENDPOINT,
        body: async () => ({
          model: modelRef.current,
          context: (await hostRef.current?.readContext()) ?? {},
          hostTools: hostRef.current?.schemas ?? [],
        }),
      }),
    [],
  );

  const { messages, sendMessage, status, error, addToolApprovalResponse, addToolOutput } = useChat<VexaMessage>({
    transport,
    experimental_throttle: THROTTLE_MS,
    sendAutomaticallyWhen: (options) =>
      lastAssistantMessageIsCompleteWithToolCalls(options) || lastAssistantMessageIsCompleteWithApprovalResponses(options),
    onToolCall: ({ toolCall }) => {
      const currentHost = hostRef.current;
      if (toolCall.dynamic || !currentHost?.hasTool(toolCall.toolName)) return;
      void (async () => {
        const output = await currentHost.runTool(toolCall.toolName, toolCall.input, { toolCallId: toolCall.toolCallId, source: "model" });
        addToolOutput({ tool: toolCall.toolName as never, toolCallId: toolCall.toolCallId, output: output as never });
      })();
    },
  });

  const isStreaming = status === "streaming" || status === "submitted";

  const send = useCallback(
    (value: string) => {
      setText("");
      void sendMessage({ text: value });
    },
    [sendMessage],
  );

  useEffect(() => {
    if (!modelReady || sent.current || !initialPrompt) return;
    sent.current = true;
    send(initialPrompt);
    router.replace(`/c/${threadId}`, { scroll: false });
  }, [initialPrompt, modelReady, router, send, threadId]);

  return (
    <div className="relative flex h-dvh min-h-0 flex-col">
      <GlowBackdrop className="opacity-60" />
      <Conversation className="relative z-10 min-h-0 flex-1">
        <ConversationContent className={`flex flex-col gap-6 py-6 ${COLUMN}`}>
          {preload ? (
            <GlassPanel className="flex items-start gap-3 p-4 animate-hero-rise">
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-brand-violet text-primary-foreground">
                <Inbox className="size-4" aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium">{TH.session.preloadBanner(preload.fromName)}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{TH.session.preloadOpen}</p>
              </div>
            </GlassPanel>
          ) : null}

          {messages.length === 0 && !isStreaming ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center animate-hero-rise">
              <span className="flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-brand-violet/20 text-primary">
                <Sparkles className="size-5" aria-hidden />
              </span>
              <p className="text-base font-medium">{TH.chat.emptyTitle}</p>
              <p className="max-w-sm text-sm text-muted-foreground">{TH.chat.emptyDescription}</p>
            </div>
          ) : null}

          {messages.map((message, index) => (
            <Fragment key={message.id}>
              {message.role === "user" ? (
                <UserMessage labels={COP_CHAT_LABELS} message={message} />
              ) : (
                <AssistantMessage
                  isLast={index === messages.length - 1}
                  isStreaming={isStreaming}
                  labels={COP_CHAT_LABELS}
                  message={message}
                  messages={messages}
                  steps="collapsible"
                  onApproval={(id, approved) => void addToolApprovalResponse({ id, approved })}
                />
              )}
            </Fragment>
          ))}

          {error ? <p className="text-sm text-danger">{error.message}</p> : null}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="relative z-10 shrink-0 pb-4 pt-2">
        <div className={`flex flex-col gap-3 ${COLUMN}`}>
          {messages.length === 0 ? (
            <div className="flex flex-wrap gap-2">
              {suggestions.slice(0, 4).map((action) => (
                <button
                  key={action.id}
                  type="button"
                  onClick={() => send(action.prompt)}
                  className="rounded-full border border-border/70 bg-card/70 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur transition hover:-translate-y-0.5 hover:border-primary/50 hover:text-foreground"
                >
                  {action.label}
                </button>
              ))}
            </div>
          ) : null}
          <CopComposer value={text} onValueChange={setText} onSubmit={send} size="docked" busy={isStreaming} />
        </div>
      </div>
    </div>
  );
}
