"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type MouseEvent } from "react";
import { Check, X } from "lucide-react";
import { Primary } from "@/components/inbox/row";
import { cn } from "@/components/ui/cn";
import { TH } from "@/lib/i18n/th";
import { decisionAction, hasUnread, type BellDecision, type BellItem, type BellPayload } from "./items";
import { Face, UnreadDot, When } from "./parts";

const COPY = TH.notifications;
const BELL_ENDPOINT = "/api/notifications/bell";
const READ_ENDPOINT = "/api/notifications";
const INBOX_ENDPOINT = "/api/inbox";
const SHARED_PATH = "/shared";
const JSON_HEADERS = { "content-type": "application/json" };
const DIALOG =
  "fixed m-0 flex flex-col overflow-hidden border-border bg-popover p-0 text-popover-foreground shadow-lift backdrop:bg-transparent " +
  "max-sm:inset-x-0 max-sm:bottom-0 max-sm:top-auto max-sm:max-h-[85dvh] max-sm:w-full max-sm:max-w-none max-sm:rounded-t-[26px] max-sm:border-t max-sm:pb-[env(safe-area-inset-bottom)] max-sm:backdrop:bg-foreground/15 " +
  "sm:left-auto sm:right-4 sm:top-[3.75rem] sm:max-h-[min(36rem,calc(100dvh-5rem))] sm:w-[22rem] sm:overflow-visible sm:rounded-2xl sm:border";
const LINK = "rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function postRead(body: { id: string } | { all: true }): Promise<unknown> {
  return fetch(READ_ENDPOINT, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(body), keepalive: true }).catch(() => undefined);
}

function plainClick(event: MouseEvent<HTMLAnchorElement>): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

function ItemLink({ item, onOpen, className, children }: { item: BellItem; onOpen: (item: BellItem) => void; className: string; children: React.ReactNode }) {
  return (
    <a
      href={item.target}
      data-bell-item={item.key}
      onClick={(event) => {
        if (!plainClick(event)) return;
        event.preventDefault();
        onOpen(item);
      }}
      className={cn(LINK, className)}
    >
      {children}
    </a>
  );
}

function DecisionRow({ item, busy, onOpen, onDecide }: { item: BellDecision; busy: boolean; onOpen: (item: BellItem) => void; onDecide: (item: BellDecision) => void }) {
  return (
    <li className={cn("flex gap-3 rounded-xl px-2.5 py-2.5", !item.read && "bg-primary/[0.05]")} data-bell-decision={item.kind}>
      <Face item={item} className="size-8" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <ItemLink item={item} onOpen={onOpen} className={cn("line-clamp-2 text-[13px] leading-snug hover:underline", item.read ? "text-foreground/80" : "font-medium text-foreground")}>
          {item.title}
        </ItemLink>
        <div className="flex items-center gap-2">
          <Primary onClick={() => onDecide(item)} disabled={busy}>
            {COPY.actions[item.kind]}
          </Primary>
          <span className="flex-1" />
          <When at={item.at} />
        </div>
      </div>
      <UnreadDot read={item.read} className="mt-1.5" />
    </li>
  );
}

function UpdateRow({ item, onOpen }: { item: BellItem; onOpen: (item: BellItem) => void }) {
  return (
    <li>
      <ItemLink item={item} onOpen={onOpen} className="flex items-center gap-3 rounded-xl px-2.5 py-2 transition hover:bg-muted">
        <Face item={item} className="size-7" />
        <span title={item.title} className={cn("min-w-0 flex-1 truncate text-[13px]", item.read ? "text-muted-foreground" : "font-medium text-foreground")}>{item.title}</span>
        <When at={item.at} />
        <span className="flex w-2 justify-center">
          <UnreadDot read={item.read} />
        </span>
      </ItemLink>
    </li>
  );
}

function AllCaughtUp() {
  return (
    <div className="flex flex-col items-center gap-1 px-6 py-8 text-center">
      <span className="mb-2 flex size-10 items-center justify-center rounded-full bg-success/10 text-success">
        <Check className="size-5" aria-hidden />
      </span>
      <p className="text-sm font-medium">{COPY.allCaughtUp}</p>
      <p className="text-xs text-muted-foreground">{COPY.allCaughtUpHint}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex flex-col">
      <h3 id={id} className="px-2.5 pb-1 pt-1 text-[11px] font-medium text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Lists({ payload, busyKey, onOpen, onDecide }: { payload: BellPayload; busyKey: string | null; onOpen: (item: BellItem) => void; onDecide: (item: BellDecision) => void }) {
  if (payload.decide.length === 0 && payload.updates.length === 0) return <AllCaughtUp />;
  return (
    <div className="flex flex-col gap-2 px-1.5 pb-1.5">
      {payload.decide.length > 0 ? (
        <Section title={COPY.decide}>
          <ul className="flex flex-col gap-0.5">
            {payload.decide.map((item) => (
              <DecisionRow key={item.key} item={item} busy={busyKey === item.key} onOpen={onOpen} onDecide={onDecide} />
            ))}
          </ul>
        </Section>
      ) : null}
      {payload.updates.length > 0 ? (
        <Section title={COPY.updates}>
          <ul className="flex flex-col">
            {payload.updates.map((item) => (
              <UpdateRow key={item.key} item={item} onOpen={onOpen} />
            ))}
          </ul>
        </Section>
      ) : null}
    </div>
  );
}

function readEverything(payload: BellPayload): BellPayload {
  return { decide: payload.decide.map((item) => ({ ...item, read: true })), updates: payload.updates.map((item) => ({ ...item, read: true })) };
}

type BellPopoverProps = { onClose: () => void; onOpenInbox: () => void; onChanged: () => void; navigate: (href: string) => void };

/** What the bell opens: decisions on top, each with its one action, then updates; a popover under the bell, a bottom sheet on a phone. Opening it reads nothing. */
export function BellPopover({ onClose, onOpenInbox, onChanged, navigate }: BellPopoverProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [payload, setPayload] = useState<BellPayload | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const load = useCallback(
    () =>
      fetch(BELL_ENDPOINT)
        .then((response) => (response.ok ? response.json() : null))
        .then((next: BellPayload | null) => {
          if (next) setPayload(next);
        })
        .catch(() => undefined),
    [],
  );

  useLayoutEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const element = dialog.current;
    if (element && !element.open) element.showModal();
    return () => {
      if (element?.open) element.close();
      opener?.focus();
    };
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const open = useCallback(
    (item: BellItem) => {
      if (item.notificationId && !item.read) void postRead({ id: item.notificationId });
      onClose();
      navigate(item.target);
    },
    [navigate, onClose],
  );

  const decide = useCallback(
    async (item: BellDecision) => {
      const action = decisionAction(item);
      if (action.type === "open") return open(item);
      setBusyKey(item.key);
      setProblem(null);
      const response = await fetch(`${INBOX_ENDPOINT}/${encodeURIComponent(action.packetId)}`, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ action: "accept" }) }).catch(() => null);
      if (response?.ok && item.notificationId) await postRead({ id: item.notificationId });
      if (!response?.ok) {
        const body = (await response?.json().catch(() => null)) as { error?: string } | null;
        setProblem(body?.error ?? TH.inbox.failed);
      }
      await load();
      setBusyKey(null);
      onChanged();
    },
    [load, onChanged, open],
  );

  const readAll = useCallback(async () => {
    setPayload((current) => (current ? readEverything(current) : current));
    await postRead({ all: true });
    onChanged();
  }, [onChanged]);

  const openInbox = useCallback(() => {
    onClose();
    onOpenInbox();
  }, [onClose, onOpenInbox]);

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className={DIALOG}
    >
      <span aria-hidden className="absolute -top-1.5 right-[3.6rem] hidden size-3 rotate-45 border-l border-t border-border bg-popover sm:block" />
      <span aria-hidden className="mx-auto mt-2 block h-1 w-10 shrink-0 rounded-full bg-border sm:hidden" />
      <header className="flex items-center gap-2 px-4 pb-1.5 pt-3">
        <h2 id={titleId} className="flex-1 text-sm font-semibold tracking-tight">
          {COPY.bell}
        </h2>
        {payload && hasUnread(payload) ? (
          <button type="button" onClick={() => void readAll()} className={cn(LINK, "px-1 text-xs text-muted-foreground hover:text-foreground")}>
            {COPY.markAllRead}
          </button>
        ) : null}
        <button type="button" onClick={onClose} aria-label={COPY.close} className={cn(LINK, "-mr-1.5 flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground")}>
          <X className="size-4" aria-hidden />
        </button>
      </header>
      {problem ? (
        <p role="alert" className="mx-4 mb-1 rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">
          {problem}
        </p>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto">{payload ? <Lists payload={payload} busyKey={busyKey} onOpen={open} onDecide={(item) => void decide(item)} /> : <div className="h-24" aria-busy />}</div>
      <footer className="flex items-center justify-between border-t border-border px-4 py-2.5 text-xs">
        <button type="button" onClick={openInbox} className={cn(LINK, "font-medium text-primary hover:underline")}>
          {COPY.openInbox}
        </button>
        <a
          href={SHARED_PATH}
          onClick={(event) => {
            if (!plainClick(event)) return;
            event.preventDefault();
            onClose();
            navigate(SHARED_PATH);
          }}
          className={cn(LINK, "text-muted-foreground hover:text-foreground")}
        >
          {COPY.openShared}
        </a>
      </footer>
    </dialog>
  );
}
