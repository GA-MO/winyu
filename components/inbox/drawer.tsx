"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, BellOff, X } from "lucide-react";
import { cn } from "vexa/lib/utils";
import { TH } from "@/lib/i18n/th";
import { relativeTimeTh } from "@/lib/i18n/format";
import type { AlertItem, HandoffItem, InboxPayload, ReplyItem } from "./types";

const INBOX_ENDPOINT = "/api/inbox";
const ALERTS_ENDPOINT = "/api/alerts";
const NOTIFICATIONS_ENDPOINT = "/api/notifications";
const EMPTY: InboxPayload = { handoffs: [], alerts: [], replies: [], unread: 0 };
const TABS = ["handoffs", "alerts", "replies"] as const;
const PANEL = "fixed right-0 top-0 z-50 flex h-dvh w-full max-w-[26rem] flex-col border-l border-border bg-card shadow-panel animate-panel-in";
const ACTION = "rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground transition hover:border-foreground/25 hover:text-foreground";
const ITEM = "flex flex-col gap-2 rounded-2xl border border-border bg-card p-3 shadow-card";
const URGENCY_TONE: Record<HandoffItem["urgency"], string> = { low: "text-muted-foreground", medium: "text-warning", high: "text-danger" };
const SEVERITY_TONE: Record<AlertItem["severity"], string> = { P1: "text-danger", P2: "text-warning", P3: "text-info" };

type Tab = (typeof TABS)[number];

export function InboxDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("handoffs");
  const [data, setData] = useState<InboxPayload>(EMPTY);

  const load = useCallback(() => {
    fetch(INBOX_ENDPOINT)
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: InboxPayload | null) => setData(payload ?? EMPTY))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    void fetch(NOTIFICATIONS_ENDPOINT, { method: "POST" });
  }, [load, open]);

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const act = useCallback(
    async (packetId: string, action: "accept" | "need_info" | "return") => {
      await fetch(`${INBOX_ENDPOINT}/${packetId}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }) });
      load();
    },
    [load],
  );

  const dismiss = useCallback(
    async (alertId: string) => {
      await fetch(`${ALERTS_ENDPOINT}/${alertId}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "dismiss" }) });
      load();
    },
    [load],
  );

  if (!open) return null;

  const counts: Record<Tab, number> = { handoffs: data.handoffs.length, alerts: data.alerts.length, replies: data.replies.length };

  return (
    <>
      <button type="button" aria-label={TH.common.close} onClick={onClose} className="fixed inset-0 z-40 bg-foreground/10 backdrop-blur-sm" />
      <aside className={PANEL} aria-label={TH.inbox.title}>
        <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold tracking-tight">{TH.inbox.title}</h2>
          <button type="button" onClick={onClose} aria-label={TH.common.close} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
            <X className="size-4" aria-hidden />
          </button>
        </header>

        <nav className="flex gap-1 border-b border-border px-2 py-2">
          {TABS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setTab(item)}
              className={cn("rounded-full px-3 py-1.5 text-xs transition", tab === item ? "bg-bubble font-medium text-foreground" : "text-muted-foreground hover:text-foreground")}
            >
              {TH.inbox.tabs[item]}
              {counts[item] > 0 ? <span className="ml-1.5 text-muted-foreground">{counts[item]}</span> : null}
            </button>
          ))}
        </nav>

        <div className="vexa-scrollbar flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
          {tab === "handoffs" ? <HandoffList items={data.handoffs} onAct={act} onOpen={(id) => router.push(`/c/new?preload=${id}`)} /> : null}
          {tab === "alerts" ? <AlertList items={data.alerts} onDismiss={dismiss} onVerify={(prompt) => router.push(`/c/new?prompt=${encodeURIComponent(prompt)}`)} /> : null}
          {tab === "replies" ? <ReplyList items={data.replies} /> : null}
        </div>
      </aside>
    </>
  );
}

function EmptyLine({ text }: { text: string }) {
  return (
    <p className="flex items-center gap-2 px-2 py-8 text-sm text-muted-foreground">
      <BellOff className="size-4" aria-hidden />
      {text}
    </p>
  );
}

function HandoffList({ items, onAct, onOpen }: { items: HandoffItem[]; onAct: (id: string, action: "accept" | "need_info" | "return") => void; onOpen: (id: string) => void }) {
  if (items.length === 0) return <EmptyLine text={TH.inbox.empty.handoffs} />;
  return (
    <>
      {items.map((item) => (
        <article key={item.id} className={ITEM}>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate text-sm font-medium">{item.title}</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">{TH.inbox.from(item.fromName, item.fromRole)}</p>
            </div>
            <span className={cn("shrink-0 text-xs", URGENCY_TONE[item.urgency])}>{TH.inbox.urgency[item.urgency]}</span>
          </div>
          <p className="text-sm text-muted-foreground">{item.ask}</p>
          <dl className="flex flex-col gap-1 rounded-xl bg-muted p-2.5 text-xs">
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">{TH.inbox.sla}</dt>
              <dd>{item.sla ?? TH.inbox.noSla}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">{TH.inbox.statusLabel}</dt>
              <dd>{TH.inbox.status[item.status]}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">{TH.inbox.sentAt}</dt>
              <dd>{relativeTimeTh(item.at)}</dd>
            </div>
            {item.evidence.map((line) => (
              <div key={`${item.id}-${line.label}`} className="flex justify-between gap-2">
                <dt className="text-muted-foreground">{line.label}</dt>
                <dd className="truncate text-right">{line.value}</dd>
              </div>
            ))}
          </dl>
          {item.replies.length > 0 ? (
            <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
              {item.replies.map((reply, index) => (
                <li key={`${item.id}-reply-${index}`}>
                  {reply.name}: {reply.text}
                </li>
              ))}
            </ul>
          ) : null}
          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={() => onAct(item.id, "accept")} className={ACTION}>
              {TH.inbox.accept}
            </button>
            <button type="button" onClick={() => onAct(item.id, "need_info")} className={ACTION}>
              {TH.inbox.needInfo}
            </button>
            <button type="button" onClick={() => onAct(item.id, "return")} className={ACTION}>
              {TH.inbox.reject}
            </button>
            <button type="button" onClick={() => onOpen(item.id)} className={cn(ACTION, "border-transparent bg-ink text-ink-foreground hover:text-ink-foreground")}>
              <span className="flex items-center gap-1">
                {TH.inbox.openInAgent}
                <ArrowRight className="size-3" aria-hidden />
              </span>
            </button>
          </div>
        </article>
      ))}
    </>
  );
}

function AlertList({ items, onDismiss, onVerify }: { items: AlertItem[]; onDismiss: (id: string) => void; onVerify: (prompt: string) => void }) {
  if (items.length === 0) return <EmptyLine text={TH.inbox.empty.alerts} />;
  return (
    <>
      {items.map((item) => (
        <article key={item.id} className={ITEM}>
          <div className="flex items-center justify-between gap-2">
            <span className={cn("text-xs font-medium", SEVERITY_TONE[item.severity])}>
              {item.severity} · {TH.severity[item.severity]}
            </span>
            <span className="text-xs text-muted-foreground">{relativeTimeTh(item.at)}</span>
          </div>
          <h3 className="text-sm font-medium">{item.metric}{item.scope ? ` · ${item.scope}` : ""}</h3>
          <p className="text-sm text-muted-foreground">{item.hypothesis}</p>
          <div className="flex flex-wrap gap-1.5">
            {item.verifySteps.map((step, index) => (
              <button key={`${item.id}-step-${index}`} type="button" onClick={() => onVerify(step)} className={ACTION}>
                {TH.inbox.verify} {index + 1}
              </button>
            ))}
            <button type="button" onClick={() => onDismiss(item.id)} className={ACTION}>
              {TH.inbox.dismiss}
            </button>
          </div>
        </article>
      ))}
    </>
  );
}

function ReplyList({ items }: { items: ReplyItem[] }) {
  if (items.length === 0) return <EmptyLine text={TH.inbox.empty.replies} />;
  return (
    <>
      {items.map((item) => (
        <article key={item.id} className={cn(ITEM, "gap-1")}>
          <h3 className="text-sm font-medium">{item.title}</h3>
          <p className="text-xs text-muted-foreground">
            {item.toName} · {item.status} · {relativeTimeTh(item.at)}
          </p>
          <p className="text-sm text-muted-foreground">{item.text}</p>
        </article>
      ))}
    </>
  );
}
