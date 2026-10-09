"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Check, Forward, KeyRound, Link2, Mail, MessageCircle, Search, Users, X } from "lucide-react";
import { OutboxNote } from "@/components/share/outbox-note";
import { cn } from "@/components/ui/cn";
import { CardShareProvider } from "@/components/ui/card-share";
import { Portrait } from "@/components/ui/portrait";
import { DEFAULT_GRANT_DAYS, GRANT_DAYS, type GrantDays } from "@/lib/contracts/grant";
import { metricLabel } from "@/lib/dashboard/metric-display";
import { TH } from "@/lib/i18n/th";
import { SHARE_NOTE_MAX, SHARE_RECIPIENTS_MAX, preferredChannel, shareTitle, type ChannelOption, type ShareChannel, type ShareContact, type SharedCard, type ShareGrantReceipt, type ShareReceipt, type ShareTarget } from "@/lib/share/card";

const CONTACTS_ENDPOINT = "/api/shares/contacts";
const SHARES_ENDPOINT = "/api/shares";
const PANEL = "fixed right-0 top-0 z-50 flex h-dvh w-full max-w-[26rem] flex-col border-l border-border bg-card shadow-panel animate-panel-in";
const CHIP = "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
/** The icon each share channel shows with. */
export const CHANNEL_ICON: Record<ShareChannel, typeof Mail> = { email: Mail, teams: Users, line: MessageCircle };

type Phase = { kind: "picking" } | { kind: "sending" } | { kind: "sent"; receipts: ShareReceipt[]; grants: ShareGrantReceipt[]; path: string } | { kind: "failed" };

/** Who the signed-in person can share with, and whether they may grant temporary access as they share. */
export type ShareDirectory = { contacts: ShareContact[]; mayGrant: boolean };

const ShareContext = createContext<((target: ShareTarget) => void) | null>(null);

/** The share action cards offer, or null outside a surface that can share (the button then hides). */
export function useShareCard(): ((target: ShareTarget) => void) | null {
  return useContext(ShareContext);
}

function matches(contact: ShareContact, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [contact.nameTh, contact.title, TH.role[contact.role]].some((text) => text.toLowerCase().includes(needle));
}

function receiptLine(receipt: ShareReceipt): string {
  if (receipt.fallback === "no-teams-conversation") return TH.share.fellBack(receipt.name);
  if (receipt.fallback === "send-failed") return TH.share.failedSend(receipt.name);
  return TH.share.sentVia(receipt.name, TH.share.channel[receipt.via]);
}

function ChannelChips({ contact, chosen, choose }: { contact: ShareContact; chosen: ShareChannel; choose: (channel: ShareChannel) => void }) {
  const teams = contact.channels.find((option) => option.channel === "teams");
  return (
    <div className="flex flex-col gap-1.5 pl-11">
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={contact.nameTh}>
        {contact.channels.map((option) => {
          const Icon = CHANNEL_ICON[option.channel];
          const active = option.channel === chosen;
          return (
            <button key={option.channel} type="button" role="radio" aria-checked={active} onClick={() => choose(option.channel)} className={cn(CHIP, active ? "border-transparent bg-ink text-ink-foreground" : "border-border text-muted-foreground hover:border-foreground/25 hover:text-foreground")}>
              <Icon className="size-3.5" aria-hidden />
              {TH.share.channel[option.channel]}
            </button>
          );
        })}
      </div>
      {chosen === "teams" && teams && !teams.ready ? <p className="text-[11px] text-warning">{TH.share.teamsViaEmail}</p> : null}
    </div>
  );
}

function ContactRow({ contact, chosen, toggle, choose }: { contact: ShareContact; chosen: ShareChannel | null; toggle: () => void; choose: (channel: ShareChannel) => void }) {
  return (
    <li className={cn("flex flex-col gap-2 rounded-xl px-2 py-2", chosen && "bg-muted")}>
      <button type="button" onClick={toggle} aria-pressed={chosen !== null} className="flex items-center gap-2.5 text-left">
        <Portrait name={contact.nameTh} src={contact.photo} className="size-8 text-xs" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm">{contact.nameTh}</span>
          <span className="truncate text-xs text-muted-foreground">{contact.title}</span>
        </span>
        <span aria-hidden className={cn("flex size-5 shrink-0 items-center justify-center rounded-full border", chosen ? "border-transparent bg-primary text-primary-foreground" : "border-border")}>
          {chosen ? <Check className="size-3.5" /> : null}
        </span>
      </button>
      {chosen ? <ChannelChips contact={contact} chosen={chosen} choose={choose} /> : null}
    </li>
  );
}

function grantLine(grant: ShareGrantReceipt, days: GrantDays): string {
  const label = `${grant.name} · ${metricLabel(grant.metric)}`;
  if (grant.granted || !grant.refusal) return TH.grant.given(label, days);
  return TH.grant.notGiven(label, TH.grant.refusal[grant.refusal] ?? grant.refusal);
}

function GrantPicker({ days, choose }: { days: GrantDays | null; choose: (days: GrantDays | null) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <button type="button" role="switch" aria-checked={days !== null} onClick={() => choose(days === null ? DEFAULT_GRANT_DAYS : null)} className="flex items-center gap-2 text-left text-xs font-medium text-foreground">
        <span aria-hidden className={cn("flex size-4 shrink-0 items-center justify-center rounded border", days !== null ? "border-transparent bg-primary text-primary-foreground" : "border-border")}>
          {days !== null ? <Check className="size-3" /> : null}
        </span>
        <KeyRound className="size-3.5 text-primary" aria-hidden />
        {TH.grant.giveTitle}
      </button>
      {days !== null ? (
        <div className="flex flex-col gap-1.5 pl-6">
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={TH.grant.giveTitle}>
            {GRANT_DAYS.map((option) => (
              <button key={option} type="button" role="radio" aria-checked={option === days} onClick={() => choose(option)} className={cn(CHIP, option === days ? "border-transparent bg-ink text-ink-foreground" : "border-border text-muted-foreground hover:border-foreground/25 hover:text-foreground")}>
                {TH.grant.days(option)}
              </button>
            ))}
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">{TH.grant.giveNote}</p>
        </div>
      ) : null}
    </div>
  );
}

/** What the sheet shows once a share went out: who got it on which channel, any grants, the link, and the Outbox when any of it went by mail. */
export function ShareSent({ receipts, grants, days, path, close }: { receipts: ShareReceipt[]; grants: ShareGrantReceipt[]; days: GrantDays | null; path: string; close: () => void }) {
  const url = typeof window === "undefined" ? path : `${window.location.origin}${path}`;
  return (
    <div className="flex flex-col gap-4 px-4 py-5">
      <p className="flex items-center gap-2 text-sm font-medium text-success">
        <Check className="size-4" aria-hidden />
        {TH.share.sentTitle}
      </p>
      <ul className="flex flex-col gap-1.5 text-sm">
        {receipts.map((receipt) => (
          <li key={receipt.userId} className={cn(receipt.fallback ? "text-warning" : "text-foreground")}>
            {receiptLine(receipt)}
          </li>
        ))}
      </ul>
      {receipts.some((receipt) => receipt.via === "email") ? <OutboxNote /> : null}
      {days !== null && grants.length > 0 ? (
        <ul className="flex flex-col gap-1.5 text-sm">
          {grants.map((grant) => (
            <li key={`${grant.userId}:${grant.metric}`} className={cn("flex items-start gap-1.5", grant.granted ? "text-foreground" : "text-warning")}>
              <KeyRound className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              {grantLine(grant, days)}
            </li>
          ))}
        </ul>
      ) : null}
      <a href={path} className="inline-flex items-center gap-1.5 break-all text-xs text-muted-foreground hover:text-foreground">
        <Link2 className="size-3.5 shrink-0" aria-hidden />
        {url}
      </a>
      <button type="button" onClick={close} className="self-start rounded-full border border-border px-3.5 py-2 text-xs font-medium text-muted-foreground hover:text-foreground">
        {TH.common.close}
      </button>
    </div>
  );
}

/** Everyone the signed-in person can share with, the channels that reach them, and whether they may grant; null until loaded. */
export function useShareDirectory(): ShareDirectory | null {
  const [directory, setDirectory] = useState<ShareDirectory | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch(CONTACTS_ENDPOINT, { signal: controller.signal })
      .then((response) => (response.ok ? (response.json() as Promise<Partial<ShareDirectory>>) : null))
      .then((payload) => setDirectory({ contacts: payload?.contacts ?? [], mayGrant: payload?.mayGrant === true }))
      .catch(() => undefined);
    return () => controller.abort();
  }, []);
  return directory;
}

/** Everyone the signed-in person can share with and the channels that reach them; null until loaded. */
export function useShareContacts(): ShareContact[] | null {
  return useShareDirectory()?.contacts ?? null;
}

function Sheet({ target, close }: { target: ShareTarget; close: () => void }) {
  const directory = useShareDirectory();
  const contacts = directory?.contacts ?? [];
  const [grantDays, setGrantDays] = useState<GrantDays | null>(null);
  const [query, setQuery] = useState("");
  const [note, setNote] = useState("");
  const [chosen, setChosen] = useState<ReadonlyMap<string, ShareChannel>>(new Map());
  const [phase, setPhase] = useState<Phase>({ kind: "picking" });

  const toggle = (contact: ShareContact) =>
    setChosen((current) => {
      const next = new Map(current);
      if (next.has(contact.id)) next.delete(contact.id);
      else if (next.size < SHARE_RECIPIENTS_MAX) next.set(contact.id, preferredChannel(contact.channels));
      return next;
    });
  const choose = (contact: ShareContact, channel: ShareChannel) => setChosen((current) => new Map(current).set(contact.id, channel));

  const send = async () => {
    setPhase({ kind: "sending" });
    const recipients = [...chosen].map(([userId, channel]) => ({ userId, channel }));
    const response = await fetch(SHARES_ENDPOINT, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ card: target.card, question: target.question, note, recipients, grantDays: directory?.mayGrant ? grantDays : null }) }).catch(() => null);
    const payload = response?.ok ? ((await response.json()) as { receipts: ShareReceipt[]; grants?: ShareGrantReceipt[]; path: string }) : null;
    setPhase(payload ? { kind: "sent", receipts: payload.receipts, grants: payload.grants ?? [], path: payload.path } : { kind: "failed" });
  };

  const visible = contacts.filter((contact) => chosen.has(contact.id) || matches(contact, query));
  const ordered = [...visible.filter((contact) => chosen.has(contact.id)), ...visible.filter((contact) => !chosen.has(contact.id))];

  return (
    <>
      <button type="button" aria-label={TH.common.close} onClick={close} className="fixed inset-0 z-40 bg-foreground/10 backdrop-blur-sm" />
      <aside className={PANEL} aria-label={TH.share.sheetTitle} data-share-sheet>
        <header className="flex items-start justify-between gap-2 border-b border-border px-4 py-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold">
              <Forward className="size-4 text-primary" aria-hidden />
              {TH.share.sheetTitle}
            </h2>
            <p className="truncate text-sm text-foreground">{shareTitle(target.card)}</p>
          </div>
          <button type="button" onClick={close} aria-label={TH.common.close} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
            <X className="size-4" aria-hidden />
          </button>
        </header>
        {phase.kind === "sent" ? (
          <ShareSent receipts={phase.receipts} grants={phase.grants} days={grantDays} path={phase.path} close={close} />
        ) : (
          <>
            <div className="flex flex-col gap-2 border-b border-border px-4 py-3">
              <p className="text-xs leading-relaxed text-muted-foreground">{TH.share.sheetNote}</p>
              <label className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 focus-within:ring-2 focus-within:ring-ring">
                <Search className="size-4 text-muted-foreground" aria-hidden />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={TH.share.search} className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
              </label>
            </div>
            <ul className="ui-scrollbar flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 py-2">
              {ordered.map((contact) => (
                <ContactRow key={contact.id} contact={contact} chosen={chosen.get(contact.id) ?? null} toggle={() => toggle(contact)} choose={(channel) => choose(contact, channel)} />
              ))}
              {contacts.length > 0 && ordered.length === 0 ? <li className="px-2 py-3 text-sm text-muted-foreground">{TH.share.noMatch}</li> : null}
            </ul>
            <footer className="flex flex-col gap-2 border-t border-border px-4 py-3">
              {directory?.mayGrant ? <GrantPicker days={grantDays} choose={setGrantDays} /> : null}
              <textarea value={note} onChange={(event) => setNote(event.target.value.slice(0, SHARE_NOTE_MAX))} placeholder={TH.share.notePlaceholder} rows={2} className="resize-none rounded-xl border border-border bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring" />
              {phase.kind === "failed" ? <p className="text-xs text-danger">{TH.share.failed}</p> : null}
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">{TH.share.chosen(chosen.size)}</span>
                <button type="button" onClick={() => void send()} disabled={chosen.size === 0 || phase.kind === "sending"} className="inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-xs font-medium text-ink-foreground transition hover:opacity-90 disabled:opacity-40">
                  <Forward className="size-3.5" aria-hidden />
                  {phase.kind === "sending" ? TH.share.sending : TH.share.send}
                </button>
              </div>
            </footer>
          </>
        )}
      </aside>
    </>
  );
}

/** Lets every card inside offer ส่งต่อ, with one sheet for the whole surface. */
export function ShareProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<ShareTarget | null>(null);
  const open = useCallback((next: ShareTarget) => setTarget(next), []);
  const close = useCallback(() => setTarget(null), []);
  const value = useMemo(() => open, [open]);
  return (
    <ShareContext.Provider value={value}>
      {children}
      {target ? <Sheet key={JSON.stringify(target.card)} target={target} close={close} /> : null}
    </ShareContext.Provider>
  );
}

/** Hands the outermost card inside its ส่งต่อ pill; nothing outside a surface that can share. */
export function ShareChrome({ target, children }: { target: ShareTarget | null; children: ReactNode }) {
  const share = useShareCard();
  const value = share && target ? { share: () => share(target), label: TH.share.buttonLabel(shareTitle(target.card)) } : null;
  return <CardShareProvider value={value}>{children}</CardShareProvider>;
}
