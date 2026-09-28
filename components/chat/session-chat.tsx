"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithApprovalResponses, lastAssistantMessageIsCompleteWithToolCalls } from "ai";
import { Inbox, Sparkles } from "lucide-react";
import type { VexaMessage } from "vexa/protocol";
import { AssistantMessage, UserMessage } from "vexa/chat";
import { Conversation, ConversationContent, ConversationScrollButton } from "vexa/ai-elements/conversation";
import { useVexaHostContext } from "vexa/react";
import type { QuickAction } from "@/lib/contracts";
import { TH } from "@/lib/i18n/th";
import { WinyuComposer } from "@/components/composer/winyu-composer";
import { GlassPanel } from "@/components/ui/glass-panel";
import { GlowBackdrop } from "@/components/ui/glow-backdrop";
import { ChipIcon } from "@/components/ui/chip-icon";
import { registerChatSender } from "@/components/providers/chat-sender";
import { PILL } from "@/components/ui/pill";
import { setHostContext } from "@/components/providers/host-context";
import { isFollowUpIntent } from "@/lib/engine/follow-ups";
import { WINYU_CHAT_LABELS } from "./labels";
import { answeredMetrics, chipRow, latestFollowUps } from "./follow-ups";

const CHAT_ENDPOINT = "/api/chat";
const THREADS_ENDPOINT = "/api/threads";
const QUICK_ACTIONS_ENDPOINT = "/api/quick-actions";
const SAVE_DEBOUNCE_MS = 800;
const THROTTLE_MS = 50;
const FALLBACK_MODEL = "mock";
const COLUMN = "mx-auto w-full max-w-3xl px-4 sm:px-6";
const EMPTY_CHIPS = 4;
const ANSWER_CHIPS = 3;

type ModelsPayload = { models?: { id: string }[]; default?: string | null };

export type SessionPreload = { packetId: string; fromName: string };

export function SessionChat({
  threadId,
  initialPrompt,
  initialMessages,
  preload,
  suggestions,
  placeholder,
}: {
  threadId: string;
  initialPrompt: string | null;
  initialMessages: VexaMessage[];
  preload: SessionPreload | null;
  suggestions: QuickAction[];
  placeholder: string;
}) {
  const host = useVexaHostContext();
  const hostRef = useRef(host);
  hostRef.current = host;
  const [model, setModel] = useState(FALLBACK_MODEL);
  const [modelReady, setModelReady] = useState(false);
  const modelRef = useRef(model);
  modelRef.current = model;
  const [text, setText] = useState("");
  const [chips, setChips] = useState(suggestions);
  const sent = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedMessages = useRef<unknown[]>(initialMessages);

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
      .finally(() => {
        if (!controller.signal.aborted) setModelReady(true);
      });
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
    id: threadId,
    messages: initialMessages,
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
  const followUps = useMemo(() => (isStreaming ? [] : latestFollowUps(messages)), [isStreaming, messages]);
  const answered = useMemo(() => (isStreaming ? new Set<string>() : answeredMetrics(messages)), [isStreaming, messages]);
  const visibleChips = messages.length === 0 ? chips.slice(0, EMPTY_CHIPS) : chipRow(followUps, chips, ANSWER_CHIPS, answered);

  const refreshChips = useCallback(() => {
    fetch(QUICK_ACTIONS_ENDPOINT)
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { actions?: QuickAction[] } | null) => {
        if (payload?.actions) setChips(payload.actions);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (isStreaming || messages.length === 0 || messages === savedMessages.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      savedMessages.current = messages;
      void fetch(`${THREADS_ENDPOINT}/${threadId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages }),
      })
        .then(() => refreshChips())
        .catch(() => undefined);
    }, SAVE_DEBOUNCE_MS);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [isStreaming, messages, refreshChips, threadId]);

  const send = useCallback(
    (value: string) => {
      setText("");
      void sendMessage({ text: value });
    },
    [sendMessage],
  );

  useEffect(() => {
    registerChatSender(send);
    host?.registerChatSender(send);
    return () => {
      registerChatSender(null);
      host?.registerChatSender(null);
    };
  }, [host, send]);

  useEffect(() => {
    if (!modelReady || sent.current || !initialPrompt) return;
    sent.current = true;
    send(initialPrompt);
    window.history.replaceState(null, "", `/c/${threadId}`);
  }, [initialPrompt, modelReady, send, threadId]);

  return (
    <div className="relative flex h-dvh min-h-0 flex-col">
      <GlowBackdrop className="opacity-70" />
      <Conversation className="relative z-10 min-h-0 flex-1" initial="instant">
        <ConversationContent className={`winyu-chat flex flex-col gap-6 pb-6 pt-16 ${COLUMN}`}>
          {preload ? (
            <GlassPanel className="flex items-start gap-3 p-4 animate-hero-rise">
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl bg-ink text-ink-foreground">
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
              <span className="flex size-12 items-center justify-center rounded-2xl border border-border bg-card text-primary shadow-card">
                <Sparkles className="size-5" aria-hidden />
              </span>
              <p className="text-base font-medium">{TH.chat.emptyTitle}</p>
              <p className="max-w-sm text-sm text-muted-foreground">{TH.chat.emptyDescription}</p>
            </div>
          ) : null}

          {messages.map((message, index) => (
            <Fragment key={message.id}>
              {message.role === "user" ? (
                <UserMessage labels={WINYU_CHAT_LABELS} message={message} />
              ) : (
                <AssistantMessage
                  isLast={index === messages.length - 1}
                  isStreaming={isStreaming}
                  labels={WINYU_CHAT_LABELS}
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

      <div className="relative z-10 shrink-0 border-t border-border bg-background/90 pb-4 pt-3 backdrop-blur">
        <div className={`flex flex-col gap-3 ${COLUMN}`}>
          {!isStreaming ? (
            <div className="flex flex-wrap gap-2">
              {visibleChips.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  title={action.reason}
                  onClick={() => {
                    void fetch(QUICK_ACTIONS_ENDPOINT, {
                      method: "POST",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify({ intentKey: action.intentKey, prompt: action.prompt, kind: isFollowUpIntent(action.intentKey) ? "follow_up" : "quick_action" }),
                    }).catch(() => undefined);
                    send(action.prompt);
                  }}
                  className={PILL}
                >
                  <ChipIcon text={`${action.label} ${action.prompt}`} />
                  {action.label}
                </button>
              ))}
            </div>
          ) : null}
          <WinyuComposer value={text} onValueChange={setText} onSubmit={send} size="docked" busy={isStreaming} placeholder={placeholder} />
        </div>
      </div>
    </div>
  );
}
