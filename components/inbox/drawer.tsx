"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Inbox, X } from "lucide-react";
import { approveGrantAction, declineGrantAction } from "@/app/(app)/g/actions";
import { cn } from "@/components/ui/cn";
import { actionHref, chatHref } from "@/components/landing/chat-entry";
import { postFeedAction, type FeedSettle } from "@/components/feed/feed-list";
import { DEFAULT_GRANT_DAYS, GRANT_DAYS, type FeedItem, type FeedTone, type GrantDays } from "@/lib/contracts";
import { TH } from "@/lib/i18n/th";
import { dueTimeTh, relativeTimeTh } from "@/lib/i18n/format";
import { Actions, Bars, CheckInChat, Figure, InboxRow, Primary, Quiet, Reason, Segments, type MenuItem } from "./row";
import { foldAlerts, handoffActions, type Severity } from "./rows";
import type { AlertItem, GrantRequestItem, HandoffItem, InboxPayload, ReplyItem, TodoItem } from "./types";

const INBOX_ENDPOINT = "/api/inbox";
const ALERTS_ENDPOINT = "/api/alerts";
const NOTIFICATIONS_ENDPOINT = "/api/notifications";
const GRANT_PAGE = "/g/";
const PANEL = "fixed right-0 top-0 z-50 flex h-dvh w-full max-w-[26rem] flex-col border-l border-border bg-card shadow-panel animate-panel-in";
const SEVERITY_DOT: Record<Severity, string> = { P1: "bg-danger", P2: "bg-warning", P3: "bg-info" };
const URGENCY_DOT: Record<HandoffItem["urgency"], string> = { high: "bg-danger", medium: "bg-warning", low: "bg-muted-foreground/50" };
const TONE_DOT: Record<FeedTone, string> = { danger: "bg-danger", warning: "bg-warning", info: "bg-info", brand: "bg-primary", success: "bg-success", neutral: "bg-muted-foreground/50" };
const TONE_TEXT: Record<FeedTone, string> = { danger: "text-danger", warning: "text-warning", info: "text-info", brand: "text-primary", success: "text-success", neutral: "text-muted-foreground" };
const FOLDS = ["alerts", "replies"] as const;

type Fold = (typeof FOLDS)[number];
type PacketAction = "accept" | "need_info" | "return" | "resolve";
type AlertAction = "open" | "mute" | "dismiss";
type Verdict = "real" | "noise";

/** Which fold a `?inbox=alerts` or `?inbox=replies` link opens the drawer on; any other `?inbox` opens it as it is. */
export type InboxFocus = Fold | null;

export function focusFromParams(params: URLSearchParams): InboxFocus {
  const value = params.get("inbox");
  return FOLDS.find((fold) => fold === value) ?? null;
}

/** "คุณวีร์ เจริญสุข" becomes "คุณวีร์": the name a row has room for. */
function shortName(fullName: string): string {
  return fullName.split(" ")[0] ?? fullName;
}

/** The Inbox drawer: one short list of what waits on the person, urgent first, each row opening in place with its one primary action. */
export function InboxDrawer({ open, onClose, focus = null, onChanged }: { open: boolean; onClose: () => void; focus?: InboxFocus; onChanged?: () => void }) {
  const router = useRouter();
  const [data, setData] = useState<InboxPayload | null>(null);
  const [opened, setOpened] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    () =>
      fetch(INBOX_ENDPOINT)
        .then((response) => (response.ok ? response.json() : null))
        .then((payload: InboxPayload | null) => {
          if (payload) setData(payload);
        })
        .catch(() => undefined),
    [],
  );

  useEffect(() => {
    if (!open) return;
    void load().then(() => fetch(NOTIFICATIONS_ENDPOINT, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ home: "inbox" }) }));
  }, [load, open]);

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const settled = useCallback(async () => {
    await load();
    onChanged?.();
  }, [load, onChanged]);

  const run = useCallback(
    async (work: () => Promise<string | null>) => {
      setBusy(true);
      const problem = await work().catch(() => TH.inbox.failed);
      setNote(problem);
      setBusy(false);
      if (!problem) await settled();
    },
    [settled],
  );

  const actOnPacket = useCallback(
    (packetId: string, action: PacketAction, outcome?: string, verdict?: Verdict) =>
      run(async () => {
        const response = await fetch(`${INBOX_ENDPOINT}/${packetId}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action, outcome: outcome ?? null, verdict: verdict ?? null }),
        });
        if (response.ok) return null;
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        return payload?.error ?? TH.handoff.closeNeedsOutcome;
      }),
    [run],
  );

  const actOnAlert = useCallback(
    async (alertId: string, action: AlertAction) => {
      const response = await fetch(`${ALERTS_ENDPOINT}/${alertId}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }) });
      if (action === "open") return;
      const payload = (await response.json().catch(() => null)) as { note?: string | null; error?: string } | null;
      setNote(payload?.error ?? payload?.note ?? null);
      if (response.ok) await settled();
    },
    [settled],
  );

  const decideGrant = useCallback(
    (requestId: string, days: GrantDays | null) =>
      run(async () => {
        const form = new FormData();
        form.set("request", requestId);
        if (days === null) {
          await declineGrantAction(form);
          return null;
        }
        form.set("days", String(days));
        await approveGrantAction(form);
        return null;
      }),
    [run],
  );

  const settleTodo = useCallback(
    (key: string, action: FeedSettle) => {
      postFeedAction(key, action);
      setOpened(null);
      setData((current) => (current ? { ...current, todo: current.todo.filter((row) => row.item.key !== key) } : current));
    },
    [],
  );

  const go = useCallback(
    (href: string) => {
      onClose();
      router.push(href);
    },
    [onClose, router],
  );

  if (!open) return null;

  const toggle = (key: string) => setOpened((current) => (current === key ? null : key));
  const rowProps = (key: string) => ({ open: opened === key, onToggle: () => toggle(key) });
  const fold = data ? foldAlerts(data.alerts) : null;
  const nothing = data !== null && data.grantRequests.length + data.handoffs.length + data.todo.length + data.alerts.length === 0;

  return (
    <>
      <button type="button" aria-label={TH.common.close} onClick={onClose} className="fixed inset-0 z-40 bg-foreground/10 backdrop-blur-sm" />
      <aside className={PANEL} aria-label={TH.inbox.title}>
        <header className="flex items-start justify-between gap-2 border-b border-border px-4 py-3">
          <div className="flex flex-col">
            <h2 className="text-sm font-semibold tracking-tight">{TH.inbox.title}</h2>
            {data ? <p className="text-xs text-muted-foreground" data-inbox-waiting={data.decisions}>{TH.inbox.waiting(data.decisions)}</p> : null}
          </div>
          <button type="button" onClick={onClose} aria-label={TH.common.close} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
            <X className="size-4" aria-hidden />
          </button>
        </header>

        <div className="ui-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto pb-6">
          {!data ? <p className="px-4 py-8 text-sm text-muted-foreground">{TH.common.loading}</p> : null}
          {note ? <p className="px-4 pt-3 text-xs text-muted-foreground" role="status">{note}</p> : null}
          {nothing ? (
            <p className="flex items-center gap-2 px-4 py-8 text-sm text-muted-foreground">
              <Inbox className="size-4" aria-hidden />
              {TH.inbox.empty}
            </p>
          ) : null}

          {data && data.grantRequests.length > 0 ? (
            <Section title={TH.inbox.sections.grants} count={data.grantRequests.length}>
              {data.grantRequests.map((item) => (
                <GrantRow key={item.id} item={item} {...rowProps(`grant:${item.id}`)} busy={busy} onDecide={decideGrant} onOpenPage={() => go(`${GRANT_PAGE}${item.id}`)} />
              ))}
            </Section>
          ) : null}

          {data && data.handoffs.length > 0 ? (
            <Section title={TH.inbox.sections.handoffs} count={data.handoffs.length}>
              {data.handoffs.map((item) => (
                <HandoffRow
                  key={item.id}
                  item={item}
                  {...rowProps(`handoff:${item.id}`)}
                  busy={busy}
                  onAct={actOnPacket}
                  onChat={() => go(chatHref({ preload: item.id }))}
                  onAsk={(prompt) => go(chatHref({ prompt }))}
                />
              ))}
            </Section>
          ) : null}

          {data && fold && data.todo.length + data.alerts.length > 0 ? (
            <Section title={TH.inbox.sections.todo} count={data.todo.length + fold.urgent.length}>
              {data.todo.map((row) => (
                <TodoRow
                  key={row.item.key}
                  row={row}
                  {...rowProps(`todo:${row.item.key}`)}
                  onChat={() => {
                    postFeedAction(row.item.key, "open");
                    go(chatHref(row.item.packetId ? { preload: row.item.packetId } : { prompt: row.item.prompt }));
                  }}
                  onRun={(href) => go(href)}
                  onSettle={settleTodo}
                />
              ))}
              {fold.urgent.map((item) => (
                <AlertRow key={item.id} item={item} {...rowProps(`alert:${item.id}`)} onAct={actOnAlert} onAsk={(prompt) => go(chatHref({ prompt }))} />
              ))}
              {fold.rest.length > 0 ? (
                <FoldLine label={TH.inbox.foldMore(fold.rest.length)} dots={fold.restCounts.map((entry) => ({ key: entry.severity, className: SEVERITY_DOT[entry.severity], count: entry.count }))} initiallyOpen={focus === "alerts"}>
                  {fold.rest.map((item) => (
                    <AlertRow key={item.id} item={item} {...rowProps(`alert:${item.id}`)} onAct={actOnAlert} onAsk={(prompt) => go(chatHref({ prompt }))} />
                  ))}
                </FoldLine>
              ) : null}
            </Section>
          ) : null}

          {data && (data.goodNews.length > 0 || data.replies.length > 0) ? (
            <ul className="mt-4 border-t border-border">
              {data.goodNews.length > 0 ? (
                <FoldLine label={TH.inbox.goodNews(data.goodNews.length)} dots={[{ key: "good", className: "bg-success", count: null }]} initiallyOpen={false}>
                  {data.goodNews.map((item) => (
                    <GoodNewsRow key={item.key} item={item} {...rowProps(`good:${item.key}`)} onChat={() => go(chatHref({ prompt: item.prompt }))} />
                  ))}
                </FoldLine>
              ) : null}
              {data.replies.length > 0 ? (
                <FoldLine label={TH.inbox.replies(data.replies.length)} dots={[]} initiallyOpen={focus === "replies"}>
                  {data.replies.map((item) => (
                    <ReplyLine key={item.id} item={item} />
                  ))}
                </FoldLine>
              ) : null}
            </ul>
          ) : null}
        </div>
      </aside>
    </>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  return (
    <section className="pt-4" aria-label={title}>
      <h3 className="flex items-baseline gap-1.5 px-4 pb-1 text-xs font-medium text-muted-foreground">
        {title}
        <span className="tabular-nums">{count}</span>
      </h3>
      <ul className="divide-y divide-border">{children}</ul>
    </section>
  );
}

/** A folded group: one line that says how many wait under it, opened in place. */
function FoldLine({ label, dots, initiallyOpen, children }: { label: string; dots: { key: string; className: string; count: number | null }[]; initiallyOpen: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <li>
      <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} className="flex min-h-12 w-full items-center gap-3 px-4 py-2.5 text-left text-xs transition hover:bg-muted focus-visible:bg-muted focus-visible:outline-none">
        <span className="flex items-center gap-2">
          {dots.map((dot) => (
            <span key={dot.key} className="flex items-center gap-1 tabular-nums text-muted-foreground">
              <span aria-hidden className={cn("size-1.5 rounded-full", dot.className)} />
              {dot.count}
            </span>
          ))}
        </span>
        <span className="flex-1 font-medium text-foreground">{label}</span>
        <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open ? <ul className="divide-y divide-border border-t border-border">{children}</ul> : null}
    </li>
  );
}

type RowState = { open: boolean; onToggle: () => void };

function GrantRow({ item, open, onToggle, busy, onDecide, onOpenPage }: RowState & { item: GrantRequestItem; busy: boolean; onDecide: (id: string, days: GrantDays | null) => void; onOpenPage: () => void }) {
  const [days, setDays] = useState<GrantDays>(DEFAULT_GRANT_DAYS);
  return (
    <InboxRow
      open={open}
      onToggle={onToggle}
      dot="bg-primary"
      title={TH.inbox.grantTitle(shortName(item.requesterName))}
      context={item.slice}
      figure={<span className="text-[11px] text-muted-foreground">{relativeTimeTh(item.at)}</span>}
    >
      <p className={cn("line-clamp-2 text-[13px] leading-relaxed", item.reason ? "text-foreground/80" : "text-muted-foreground")}>{item.reason || TH.grant.page.noReason}</p>
      <p className="text-[11px] text-muted-foreground">
        {item.requesterName} · {item.requesterTitle}
        {item.cardTitle ? ` · ${TH.grant.page.from(item.cardTitle)}` : ""}
      </p>
      <Segments label={TH.inbox.grantDays} options={GRANT_DAYS} value={days} onChange={setDays} render={TH.grant.days} />
      <Actions menu={[{ label: TH.inbox.openRequest, onSelect: onOpenPage }]}>
        <Primary onClick={() => onDecide(item.id, days)} disabled={busy}>
          {TH.grant.page.approveFor(days)}
        </Primary>
        <Quiet onClick={() => onDecide(item.id, null)} disabled={busy}>
          {TH.grant.page.decline}
        </Quiet>
      </Actions>
    </InboxRow>
  );
}

function handoffContext(item: HandoffItem): string {
  const parts = [TH.inbox.from(shortName(item.fromName))];
  if (item.status !== "open") parts.push(TH.inbox.status[item.status]);
  if (item.sla) parts.push(TH.inbox.due(dueTimeTh(item.sla)));
  return parts.join(" · ");
}

function HandoffRow({ item, open, onToggle, busy, onAct, onChat, onAsk }: RowState & {
  item: HandoffItem;
  busy: boolean;
  onAct: (id: string, action: PacketAction, outcome?: string, verdict?: Verdict) => void;
  onChat: () => void;
  onAsk: (prompt: string) => void;
}) {
  const [outcome, setOutcome] = useState("");
  const [verdict, setVerdict] = useState<Verdict>("real");
  const actions = handoffActions(item.status, item.alertCount);
  const evidenceAsk = item.evidence.find((line) => line.requestPrompt)?.requestPrompt ?? null;
  const menu: MenuItem[] = [
    ...actions.menu.map((action) => ({ label: action === "need_info" ? TH.inbox.needInfo : TH.inbox.reject, onSelect: () => onAct(item.id, action) })),
    ...(evidenceAsk ? [{ label: TH.inbox.requestAccess, onSelect: () => onAsk(evidenceAsk) }] : []),
  ];
  const latestReply = item.replies[item.replies.length - 1] ?? null;
  return (
    <InboxRow
      open={open}
      onToggle={onToggle}
      dot={URGENCY_DOT[item.urgency]}
      label={TH.inbox.urgency[item.urgency]}
      title={item.title}
      context={handoffContext(item)}
      figure={<Figure movement={item.movement} />}
    >
      <p className="line-clamp-2 text-[13px] leading-relaxed text-foreground/80">{item.ask}</p>
      <Bars movement={item.movement} period={item.window} />
      {latestReply ? (
        <p className="truncate text-xs text-muted-foreground">
          {latestReply.name}: {latestReply.text}
        </p>
      ) : null}
      {actions.primary === "close" ? (
        <>
          <input
            value={outcome}
            onChange={(event) => setOutcome(event.target.value)}
            placeholder={TH.handoff.outcomePlaceholder}
            aria-label={TH.handoff.outcomePlaceholder}
            className="min-h-9 w-full rounded-full bg-card px-3.5 text-xs outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
          />
          {actions.verdict ? <Segments label={TH.inbox.verdict} options={["real", "noise"] as const} value={verdict} onChange={setVerdict} render={(value) => (value === "real" ? TH.inbox.real : TH.inbox.noise)} /> : null}
        </>
      ) : null}
      <Actions menu={menu}>
        {actions.primary === "accept" ? (
          <Primary onClick={() => onAct(item.id, "accept")} disabled={busy}>
            {TH.inbox.accept}
          </Primary>
        ) : null}
        {actions.primary === "close" ? (
          <Primary onClick={() => onAct(item.id, "resolve", outcome, actions.verdict ? verdict : undefined)} disabled={busy || outcome.trim() === ""}>
            {TH.handoff.close}
          </Primary>
        ) : null}
        <CheckInChat onClick={onChat} />
      </Actions>
    </InboxRow>
  );
}

function TodoRow({ row, open, onToggle, onChat, onRun, onSettle }: RowState & { row: TodoItem; onChat: () => void; onRun: (href: string) => void; onSettle: (key: string, action: FeedSettle) => void }) {
  const { item } = row;
  const [action] = item.actions;
  const href = action ? actionHref(action) : null;
  const menu: MenuItem[] = item.canFinish
    ? [
        { label: TH.landing.feedDone, onSelect: () => onSettle(item.key, "done") },
        { label: TH.landing.feedSnooze, onSelect: () => onSettle(item.key, "snooze") },
        { label: TH.landing.feedMute, onSelect: () => onSettle(item.key, "mute") },
      ]
    : [];
  return (
    <InboxRow
      open={open}
      onToggle={onToggle}
      dot={TONE_DOT[item.tone]}
      title={item.label}
      context={item.detail ?? item.reason.replace("-", "−")}
      figure={row.movement ? <Figure movement={row.movement} /> : item.detail ? <span className={cn("max-w-28 truncate font-display text-sm font-semibold tabular-nums", TONE_TEXT[item.tone])}>{item.reason.replace("-", "−")}</span> : null}
    >
      {item.because ? <Reason text={item.because} /> : null}
      <Bars movement={row.movement} period={row.window} />
      <Actions menu={menu}>
        {action && href ? (
          <>
            <Primary onClick={() => onRun(href)}>{action.label}</Primary>
            <CheckInChat onClick={onChat} />
          </>
        ) : (
          <Primary onClick={onChat}>{TH.inbox.checkInChat}</Primary>
        )}
      </Actions>
    </InboxRow>
  );
}

function AlertRow({ item, open, onToggle, onAct, onAsk }: RowState & { item: AlertItem; onAct: (id: string, action: AlertAction) => void; onAsk: (prompt: string) => void }) {
  const owner = shortName(item.ownerName);
  const ask = (prompt: string) => {
    onAct(item.id, "open");
    onAsk(prompt);
  };
  const menu: MenuItem[] = [
    { label: TH.inbox.mute, onSelect: () => onAct(item.id, "mute") },
    ...(item.canJudge ? [{ label: TH.inbox.dismiss, onSelect: () => onAct(item.id, "dismiss") }] : []),
  ];
  return (
    <InboxRow
      open={open}
      onToggle={onToggle}
      dot={SEVERITY_DOT[item.severity]}
      label={`${item.severity} · ${TH.severity[item.severity]}`}
      title={item.scope || item.metric}
      context={owner ? `${item.metric} · ${owner}` : item.metric}
      figure={<Figure movement={item.movement} />}
    >
      <Reason text={item.hypothesis} />
      <Bars movement={item.movement} period={item.window} />
      {item.lesson ? <p className="text-xs text-muted-foreground">{item.lesson}</p> : null}
      <Actions menu={menu}>
        {item.handoffPrompt && owner ? (
          <>
            <Primary onClick={() => ask(item.handoffPrompt as string)}>{TH.feed.sendTo(owner)}</Primary>
            <CheckInChat onClick={() => ask(item.verifySteps[0])} />
          </>
        ) : (
          <Primary onClick={() => ask(item.verifySteps[0])}>{TH.inbox.checkInChat}</Primary>
        )}
      </Actions>
    </InboxRow>
  );
}

function GoodNewsRow({ item, open, onToggle, onChat }: RowState & { item: FeedItem; onChat: () => void }) {
  return (
    <InboxRow open={open} onToggle={onToggle} dot="bg-success" title={item.label} context={item.detail ?? ""} figure={<span className="font-display text-sm font-semibold tabular-nums text-success">{item.reason}</span>}>
      <Actions menu={[]}>
        <CheckInChat onClick={onChat} />
      </Actions>
    </InboxRow>
  );
}

function ReplyLine({ item }: { item: ReplyItem }) {
  return (
    <li className="flex flex-col gap-0.5 px-4 py-2.5">
      <span className="truncate text-sm font-medium">{item.title}</span>
      <span className="truncate text-xs text-muted-foreground">
        {item.toName} · {item.status} · {relativeTimeTh(item.at)}
      </span>
      <span className="line-clamp-2 text-[13px] text-foreground/80">{item.text}</span>
    </li>
  );
}
