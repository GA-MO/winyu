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
const DELTA_TONE = { good: "text-success", bad: "text-danger", neutral: "text-muted-foreground" } as const;
const SEVERITIES = ["P1", "P2", "P3"] as const;

type Tab = (typeof TABS)[number];
type SeverityFilter = AlertItem["severity"] | "all";

export type InboxFocus = { tab: Tab; severity: SeverityFilter };

const DEFAULT_FOCUS: InboxFocus = { tab: "handoffs", severity: "all" };

function isTab(value: string | null): value is Tab {
  return (TABS as readonly string[]).includes(value ?? "");
}

function isSeverity(value: string | null): value is AlertItem["severity"] {
  return (SEVERITIES as readonly string[]).includes(value ?? "");
}

/** Which tab and severity a `?inbox=alerts&severity=P1` link opens the drawer on. */
export function focusFromParams(params: URLSearchParams): InboxFocus {
  const tab = params.get("inbox");
  const severity = params.get("severity");
  return { tab: isTab(tab) ? tab : DEFAULT_FOCUS.tab, severity: isSeverity(severity) ? severity : DEFAULT_FOCUS.severity };
}
type PacketAction = "accept" | "need_info" | "return" | "resolve";

export function InboxDrawer({ open, onClose, focus = DEFAULT_FOCUS }: { open: boolean; onClose: () => void; focus?: InboxFocus }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>(focus.tab);
  const [data, setData] = useState<InboxPayload>(EMPTY);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch(INBOX_ENDPOINT)
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: InboxPayload | null) => setData(payload ?? EMPTY))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (open) setTab(focus.tab);
  }, [focus.tab, open]);

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
    async (packetId: string, action: PacketAction, outcome?: string) => {
      const response = await fetch(`${INBOX_ENDPOINT}/${packetId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, outcome: outcome ?? null }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setNote(payload?.error ?? TH.handoff.closeNeedsOutcome);
        return;
      }
      setNote(null);
      load();
    },
    [load],
  );

  const dismiss = useCallback(
    async (alertId: string) => {
      const response = await fetch(`${ALERTS_ENDPOINT}/${alertId}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "dismiss" }) });
      const payload = (await response.json().catch(() => null)) as { note?: string | null } | null;
      setNote(payload?.note ?? TH.inbox.dismissed);
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
          {tab === "handoffs" ? (
            <HandoffList
              items={data.handoffs}
              note={note}
              onAct={act}
              onOpen={(id) => router.push(`/c/new?preload=${id}`)}
              onAsk={(prompt) => router.push(`/c/new?prompt=${encodeURIComponent(prompt)}`)}
            />
          ) : null}
          {tab === "alerts" ? (
            <AlertList
              key={focus.severity}
              items={data.alerts}
              note={note}
              initialSeverity={focus.severity}
              onDismiss={dismiss}
              onAsk={(prompt) => router.push(`/c/new?prompt=${encodeURIComponent(prompt)}`)}
            />
          ) : null}
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

function HandoffList({
  items,
  note,
  onAct,
  onOpen,
  onAsk,
}: {
  items: HandoffItem[];
  note: string | null;
  onAct: (id: string, action: PacketAction, outcome?: string) => void;
  onOpen: (id: string) => void;
  onAsk: (prompt: string) => void;
}) {
  if (items.length === 0) return <EmptyLine text={TH.inbox.empty.handoffs} />;
  return (
    <>
      {note ? <p className="px-1 text-xs text-danger">{note}</p> : null}
      {items.map((item) => (
        <HandoffCard key={item.id} item={item} onAct={onAct} onOpen={onOpen} onAsk={onAsk} />
      ))}
    </>
  );
}

function HandoffCard({
  item,
  onAct,
  onOpen,
  onAsk,
}: {
  item: HandoffItem;
  onAct: (id: string, action: PacketAction, outcome?: string) => void;
  onOpen: (id: string) => void;
  onAsk: (prompt: string) => void;
}) {
  const [outcome, setOutcome] = useState("");
  return (
    <article className={ITEM}>
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
          <dd>{item.sla ? relativeTimeTh(item.sla) : TH.inbox.noSla}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted-foreground">{TH.inbox.statusLabel}</dt>
          <dd>{TH.inbox.status[item.status]}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted-foreground">{TH.inbox.sentAt}</dt>
          <dd>{relativeTimeTh(item.at)}</dd>
        </div>
      </dl>

      {item.evidence.length > 0 ? (
        <section className="flex flex-col gap-1.5">
          <h4 className="text-xs font-medium text-muted-foreground">{TH.inbox.evidence}</h4>
          <p className="text-[11px] text-muted-foreground">{TH.handoff.evidenceUnderYourScope}</p>
          {item.evidence.map((line) => (
            <div key={`${item.id}-${line.label}-${line.value}`} className="rounded-xl border border-border p-2 text-xs">
              <p className="font-medium">{line.label}</p>
              <p className="text-muted-foreground">{line.value}</p>
              <p className={cn("mt-1", line.denied || line.masked ? "text-warning" : "text-muted-foreground")}>
                {line.masked ? TH.handoff.maskedNote : line.summary}
              </p>
              {line.requestPrompt ? (
                <button type="button" onClick={() => onAsk(line.requestPrompt as string)} className={cn(ACTION, "mt-1.5")}>
                  {TH.handoff.requestAccess}
                </button>
              ) : null}
            </div>
          ))}
        </section>
      ) : null}

      {item.replies.length > 0 ? (
        <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
          {item.replies.map((reply, index) => (
            <li key={`${item.id}-reply-${index}`}>
              {reply.name}: {reply.text}
            </li>
          ))}
        </ul>
      ) : null}

      {item.status === "resolved" ? (
        <p className="text-xs text-success">
          {TH.handoff.outcome}: {item.outcome}
        </p>
      ) : (
        <>
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
          <div className="flex gap-1.5">
            <input
              value={outcome}
              onChange={(event) => setOutcome(event.target.value)}
              placeholder={TH.handoff.outcomePlaceholder}
              className="min-w-0 flex-1 rounded-full border border-border bg-card px-3 py-1.5 text-xs outline-none focus:border-foreground/25"
            />
            <button type="button" onClick={() => onAct(item.id, "resolve", outcome)} className={ACTION}>
              {TH.handoff.close}
            </button>
          </div>
        </>
      )}
    </article>
  );
}

function AlertList({
  items,
  note,
  initialSeverity,
  onDismiss,
  onAsk,
}: {
  items: AlertItem[];
  note: string | null;
  initialSeverity: SeverityFilter;
  onDismiss: (id: string) => void;
  onAsk: (prompt: string) => void;
}) {
  const [severity, setSeverity] = useState<SeverityFilter>(initialSeverity);
  const shown = severity === "all" ? items : items.filter((item) => item.severity === severity);
  if (items.length === 0) return <EmptyLine text={TH.inbox.empty.alerts} />;
  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5 px-1">
        <span className="text-xs text-muted-foreground">{TH.inbox.severityFilter}</span>
        {(["all", ...SEVERITIES] as const).map((level) => (
          <button
            key={level}
            type="button"
            onClick={() => setSeverity(level)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs transition",
              severity === level ? "border-transparent bg-ink text-ink-foreground" : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {level === "all" ? TH.inbox.allSeverities : `${level} · ${TH.severity[level]}`}
          </button>
        ))}
      </div>
      {note ? <p className="px-1 text-xs text-muted-foreground">{note}</p> : null}
      {shown.map((item) => (
        <article key={item.id} className={ITEM}>
          <div className="flex items-center justify-between gap-2">
            <span className={cn("text-xs font-medium", SEVERITY_TONE[item.severity])}>
              {item.severity} · {TH.severity[item.severity]}
            </span>
            <span className="text-xs text-muted-foreground">{relativeTimeTh(item.at)}</span>
          </div>
          <h3 className="text-sm font-medium">
            {item.metric}
            {item.scope ? ` · ${item.scope}` : ""}
          </h3>
          <p className="text-sm text-muted-foreground">{item.hypothesis}</p>
          <dl className="flex flex-col gap-1 rounded-xl bg-muted p-2.5 text-xs">
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">{TH.inbox.window}</dt>
              <dd className="text-right">{item.window}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">{TH.inbox.numbers}</dt>
              <dd className="flex items-center gap-1.5 text-right tabular-nums">
                <span className="font-semibold">{item.movement.observed}</span>
                <span className="text-muted-foreground">{TH.inbox.against(item.movement.expected)}</span>
                {item.movement.delta ? <span className={cn("font-semibold", DELTA_TONE[item.movement.tone])}>{item.movement.delta}</span> : null}
              </dd>
            </div>
            {item.ownerName ? <div className="text-muted-foreground">{TH.inbox.owner(item.ownerName)}</div> : null}
          </dl>
          <div className="flex flex-col gap-1.5">
            {item.verifySteps.map((step, index) => (
              <button key={`${item.id}-step-${index}`} type="button" onClick={() => onAsk(step)} className={cn(ACTION, "text-left")}>
                {TH.inbox.verify} {index + 1}: {step}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={() => onAsk(item.handoffPrompt)} className={cn(ACTION, "border-transparent bg-ink text-ink-foreground hover:text-ink-foreground")}>
              {TH.inbox.handoff}
            </button>
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
