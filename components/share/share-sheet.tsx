"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AlertTriangle, Check, EyeOff, Forward, KeyRound, Link2, Mail, MessageCircle, Search, Target, Users, X } from "lucide-react";
import { OutboxNote } from "@/components/share/outbox-note";
import { cn } from "@/components/ui/cn";
import { CardShareProvider } from "@/components/ui/card-share";
import { Portrait } from "@/components/ui/portrait";
import { DEFAULT_GRANT_DAYS, GRANT_DAYS, type GrantDays, type RecipientScope } from "@/lib/contracts/grant";
import { metricLabel } from "@/lib/dashboard/metric-display";
import { formatDateTh, formatTimeTh } from "@/lib/i18n/format";
import { TH } from "@/lib/i18n/th";
import { cardRefOf, MATTER_ASK_MAX, SHARE_RECIPIENTS_MAX, shareTitle, type SendPreview, type ShareChannel, type ShareContact, type ShareGrantReceipt, type ShareReceipt, type ShareTarget } from "@/lib/share/card";
import { contradictionOf } from "@/lib/share/figures";
import { defaultUrgency, MATTER_INTENTS, saysUrgent, type MatterIntent, type MatterUrgency } from "@/lib/share/matter";
import type { MatterSuggestions } from "@/lib/share/matter-actions";

const CONTACTS_ENDPOINT = "/api/shares/contacts";
const SHARES_ENDPOINT = "/api/shares";
const PREVIEW_ENDPOINT = "/api/shares/preview";
const SCOPES_ENDPOINT = "/api/shares/scopes";
const PANEL = "fixed right-0 top-0 z-50 flex h-dvh w-full max-w-[26rem] flex-col border-l border-border bg-card shadow-panel animate-panel-in";
const SENT_NOTE = "flex w-full basis-full flex-col gap-2 rounded-xl border border-success/25 bg-success/[0.06] px-3 py-2.5 animate-hero-rise";
const ASK_ROWS = 3;
const LINE_BREAKS = /[\r\n]+/g;
const CHIP = "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
/** The icon each share channel shows with. */
export const CHANNEL_ICON: Record<ShareChannel, typeof Mail> = { email: Mail, teams: Users, line: MessageCircle };

type Phase = { kind: "picking" } | { kind: "sending" } | { kind: "failed"; refused: boolean };

/** What one send left: the receipts, grants and hidden parts the server reported, the grant days picked, the matter's link, and whether the person folded the receipt away (the card still reads as sent). */
type SentShare = { receipts: ShareReceipt[]; grants: ShareGrantReceipt[]; hidden: RecipientScope[]; days: GrantDays | null; path: string; at: string; folded: boolean };

type SentShares = { byCard: Readonly<Record<string, SentShare>>; fold: (key: string) => void };

const SentContext = createContext<SentShares>({ byCard: {}, fold: () => undefined });

const REFUSED_STATUS = 422;

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

function ContactRow({ contact, chosen, toggle }: { contact: ShareContact; chosen: boolean; toggle: () => void }) {
  return (
    <li className={cn("rounded-xl px-2 py-2", chosen && "bg-muted")}>
      <button type="button" onClick={toggle} aria-pressed={chosen} className="flex w-full items-center gap-2.5 text-left">
        <Portrait name={contact.nameTh} src={contact.photo} className="size-8 text-xs" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm">{contact.nameTh}</span>
          <span className="truncate text-xs text-muted-foreground">{contact.title}</span>
        </span>
        <span aria-hidden className={cn("flex size-5 shrink-0 items-center justify-center rounded-full border", chosen ? "border-transparent bg-primary text-primary-foreground" : "border-border")}>
          {chosen ? <Check className="size-3.5" /> : null}
        </span>
      </button>
    </li>
  );
}

/** The people a card or a matter can go to: the card's owner and the person's own line first, then everyone else, searchable by name, title or role, the chosen ones on top. */
export function PeoplePicker({ contacts, suggested, chosen, onToggle }: { contacts: ShareContact[]; suggested: MatterSuggestions; chosen: readonly string[]; onToggle: (contact: ShareContact) => void }) {
  const [query, setQuery] = useState("");
  const firstIds = [...(suggested.ownerId ? [suggested.ownerId] : []), ...suggested.line];
  const pick = (ids: readonly string[]) => ids.flatMap((id) => contacts.find((contact) => contact.id === id) ?? []);
  const owner = pick(suggested.ownerId ? [suggested.ownerId] : []);
  const line = pick(suggested.line.filter((id) => id !== suggested.ownerId));
  const others = contacts.filter((contact) => !firstIds.includes(contact.id) && (chosen.includes(contact.id) || matches(contact, query)));
  const ordered = [...others.filter((contact) => chosen.includes(contact.id)), ...others.filter((contact) => !chosen.includes(contact.id))];
  const group = (heading: string, people: ShareContact[]) =>
    people.length > 0 ? (
      <section className="flex flex-col gap-1 border-b border-border px-2 py-2" data-share-suggested={people.map((contact) => contact.id).join(" ")}>
        <h3 className="px-2 text-xs font-medium text-muted-foreground">{heading}</h3>
        <ul>
          {people.map((contact) => (
            <ContactRow key={contact.id} contact={contact} chosen={chosen.includes(contact.id)} toggle={() => onToggle(contact)} />
          ))}
        </ul>
      </section>
    ) : null;
  return (
    <>
      {group(TH.share.suggested, owner)}
      {group(TH.share.yourLine, line)}
      <div className="flex flex-col gap-2 px-4 pt-3">
        {owner.length + line.length > 0 ? <h3 className="text-xs font-medium text-muted-foreground">{TH.share.others}</h3> : null}
        <label className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 focus-within:ring-2 focus-within:ring-ring">
          <Search className="size-4 text-muted-foreground" aria-hidden />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={TH.share.search} className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
        </label>
      </div>
      <ul className="flex flex-col gap-0.5 px-2 py-2">
        {ordered.map((contact) => (
          <ContactRow key={contact.id} contact={contact} chosen={chosen.includes(contact.id)} toggle={() => onToggle(contact)} />
        ))}
        {contacts.length > 0 && ordered.length === 0 ? <li className="px-2 py-3 text-sm text-muted-foreground">{TH.share.noMatch}</li> : null}
      </ul>
    </>
  );
}

function IntentToggle({ intent, choose }: { intent: MatterIntent; choose: (intent: MatterIntent) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="inline-flex self-start rounded-full border border-border p-0.5" role="radiogroup" aria-label={TH.share.sheetTitle}>
        {MATTER_INTENTS.map((option) => (
          <button key={option} type="button" role="radio" aria-checked={option === intent} onClick={() => choose(option)} className={cn("rounded-full px-3 py-1 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", option === intent ? "bg-ink text-ink-foreground" : "text-muted-foreground hover:text-foreground")}>
            {TH.share.intent[option]}
          </button>
        ))}
      </div>
      <p className="text-[11px] leading-relaxed text-muted-foreground">{TH.share.intentHint[intent]}</p>
    </div>
  );
}

const URGENCY_ORDER: readonly MatterUrgency[] = ["today", "this_week", "now"];

function UrgencyChoice({ urgency, choose }: { urgency: MatterUrgency; choose: (urgency: MatterUrgency) => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-medium text-muted-foreground">{TH.share.urgencyLabel}</span>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={TH.share.urgencyLabel} data-share-urgency>
        {URGENCY_ORDER.map((option) => (
          <button key={option} type="button" role="radio" aria-checked={option === urgency} data-urgency={option} onClick={() => choose(option)} className={cn(CHIP, option === urgency ? "border-transparent bg-ink text-ink-foreground" : "border-border text-muted-foreground hover:border-foreground/25 hover:text-foreground")}>
            {TH.share.urgency[option]}
          </button>
        ))}
      </div>
    </div>
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

function hiddenLine(scope: RecipientScope): string {
  return TH.share.recipientHidden[scope.hidden](scope.name, metricLabel(scope.metric));
}

/** What the card would hide from each chosen recipient, as the server works it out from their access, before anything is sent; empty while it loads or when everyone would see all of it. */
export function useRecipientScopes(card: ShareTarget["card"] | null, recipientIds: readonly string[]): RecipientScope[] {
  const [scopes, setScopes] = useState<RecipientScope[]>([]);
  const body = card && recipientIds.length > 0 ? JSON.stringify({ card, recipients: recipientIds }) : null;
  useEffect(() => {
    if (!body) {
      setScopes([]);
      return;
    }
    const controller = new AbortController();
    fetch(SCOPES_ENDPOINT, { method: "POST", headers: { "content-type": "application/json" }, body, signal: controller.signal })
      .then((response) => (response.ok ? (response.json() as Promise<{ scopes?: RecipientScope[] }>) : null))
      .then((payload) => setScopes(payload?.scopes ?? []))
      .catch(() => undefined);
    return () => controller.abort();
  }, [body]);
  return scopes;
}

/** One line per recipient who would see the card masked, closed or with rows locked, and the temporary grant where the sender may give it. */
export function RecipientWarnings({ scopes, granting, grant }: { scopes: readonly RecipientScope[]; granting: boolean; grant: (() => void) | null }) {
  if (scopes.length === 0) return null;
  const grantable = scopes.some((scope) => scope.grantable);
  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-warning/25 bg-warning/[0.08] px-3 py-2" role="status" data-share-hidden>
      <ul className="flex flex-col gap-1">
        {scopes.map((scope) => (
          <li key={scope.userId} className="flex items-start gap-1.5 text-xs leading-relaxed text-foreground">
            <EyeOff className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
            {hiddenLine(scope)}
          </li>
        ))}
      </ul>
      {grantable && granting ? <p className="pl-5 text-[11px] text-muted-foreground">{TH.share.grantWillShow}</p> : null}
      {grantable && !granting && grant ? (
        <button type="button" onClick={grant} className="ml-5 inline-flex items-center gap-1 self-start text-xs font-medium text-primary hover:underline" data-share-grant>
          <KeyRound className="size-3.5" aria-hidden />
          {TH.share.grantToShow}
        </button>
      ) : null}
    </div>
  );
}

/** What a share left, under the card it sent: who got it on which channel, what it still hides from whom, any grants, the Outbox when any of it went by mail, and the matter's link; it stays where the person sent from, covering nothing, until they fold it. */
export function ShareSent({ receipts, grants, hidden = [], days, path, at, close }: { receipts: ShareReceipt[]; grants: ShareGrantReceipt[]; hidden?: RecipientScope[]; days: GrantDays | null; path: string; at: string; close: () => void }) {
  const url = typeof window === "undefined" ? path : `${window.location.origin}${path}`;
  return (
    <aside role="status" aria-label={TH.share.sentTitle} data-share-sent className={SENT_NOTE}>
      <div className="flex items-start gap-2">
        <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
        <p className="min-w-0 flex-1 text-sm font-medium text-success">{TH.share.sentAt(`${formatDateTh(at)} ${formatTimeTh(at)}`)}</p>
        <button type="button" onClick={close} aria-label={TH.common.close} className="-m-1 rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
          <X className="size-4" aria-hidden />
        </button>
      </div>
      <ul className="flex flex-col gap-1 pl-6 text-xs">
        {receipts.map((receipt) => (
          <li key={receipt.userId} className={cn(receipt.fallback ? "text-warning" : "text-foreground")}>
            {receiptLine(receipt)}
          </li>
        ))}
      </ul>
      {hidden.length > 0 ? (
        <ul className="flex flex-col gap-1 pl-6 text-xs text-warning" aria-label={TH.share.stillHidden}>
          {hidden.map((scope) => (
            <li key={scope.userId} className="flex items-start gap-1.5">
              <EyeOff className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              {hiddenLine(scope)}
            </li>
          ))}
        </ul>
      ) : null}
      {receipts.some((receipt) => receipt.via === "email") ? <div className="pl-6"><OutboxNote /></div> : null}
      {days !== null && grants.length > 0 ? (
        <ul className="flex flex-col gap-1 pl-6 text-xs">
          {grants.map((grant) => (
            <li key={`${grant.userId}:${grant.metric}`} className={cn("flex items-start gap-1.5", grant.granted ? "text-foreground" : "text-warning")}>
              <KeyRound className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              {grantLine(grant, days)}
            </li>
          ))}
        </ul>
      ) : null}
      <a href={path} className="ml-6 inline-flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
        <Link2 className="size-3.5 shrink-0" aria-hidden />
        <span className="truncate">{url}</span>
      </a>
    </aside>
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

const NO_PREVIEW: SendPreview = { ownerId: null, line: [], title: null, figures: null, goal: null, focus: null, subject: null };

/** What the server says about sending a card before it leaves: the title it will carry, whom to put first (its owner, never the sender, then the sender's own line), what the card's numbers say for the sender, the goal that would close it, and the rows the sender's `words` (the ask and what they typed) single out; empty until loaded. */
export function useSendPreview(card: ShareTarget["card"] | null, alertIds: readonly string[] = [], words: readonly string[] = []): SendPreview {
  const [preview, setPreview] = useState<SendPreview>(NO_PREVIEW);
  const body = card ? JSON.stringify({ card, alertIds, words }) : null;
  useEffect(() => {
    if (!body) return;
    const controller = new AbortController();
    fetch(PREVIEW_ENDPOINT, { method: "POST", headers: { "content-type": "application/json" }, body, signal: controller.signal })
      .then((response) => (response.ok ? (response.json() as Promise<Partial<SendPreview>>) : null))
      .then((payload) =>
        setPreview({ ownerId: payload?.ownerId ?? null, line: payload?.line ?? [], title: payload?.title ?? null, figures: payload?.figures ?? null, goal: payload?.goal ?? null, focus: payload?.focus ?? null, subject: payload?.subject ?? null }),
      )
      .catch(() => undefined);
    return () => controller.abort();
  }, [body]);
  return preview;
}

/** The one line code writes when the sender's words claim what the card's numbers do not show; the sender can still send. */
export function ContradictionNote({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <p className="flex items-start gap-1.5 rounded-xl border border-warning/25 bg-warning/[0.08] px-3 py-2 text-xs leading-relaxed text-foreground" role="status" data-send-warning>
      <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
      {text}
    </p>
  );
}

function GoalChoice({ goal, keep, toggle }: { goal: string; keep: boolean; toggle: () => void }) {
  return (
    <button type="button" role="switch" aria-checked={keep} onClick={toggle} className="flex items-center gap-2 text-left text-xs text-foreground" data-share-goal>
      <span aria-hidden className={cn("flex size-4 shrink-0 items-center justify-center rounded border", keep ? "border-transparent bg-primary text-primary-foreground" : "border-border")}>
        {keep ? <Check className="size-3" /> : null}
      </span>
      <Target className="size-3.5 text-primary" aria-hidden />
      {goal}
    </button>
  );
}

function nextChosen(current: readonly string[], id: string, intent: MatterIntent): string[] {
  if (current.includes(id)) return current.filter((chosen) => chosen !== id);
  if (intent === "act") return [id];
  return current.length < SHARE_RECIPIENTS_MAX ? [...current, id] : [...current];
}

function Sheet({ target, close, onSent }: { target: ShareTarget; close: () => void; onSent: (sent: SentShare) => void }) {
  const directory = useShareDirectory();
  const contacts = directory?.contacts ?? [];
  const preview = useSendPreview(target.card);
  const [keepGoal, setKeepGoal] = useState(true);
  const title = preview.title ?? shareTitle(target.card);
  const [grantDays, setGrantDays] = useState<GrantDays | null>(null);
  const [ask, setAsk] = useState(() => target.draftAsk ?? TH.share.askDraft(title));
  const [intent, setIntent] = useState<MatterIntent>("act");
  const [chosenUrgency, setUrgency] = useState<MatterUrgency | null>(null);
  const urgency = chosenUrgency ?? (saysUrgent(ask) ? "now" : defaultUrgency(intent));
  const [picked, setPicked] = useState<string[] | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "picking" });

  const chosen = picked ?? (preview.ownerId ? [preview.ownerId] : []);
  const toggle = (contact: ShareContact) => setPicked(nextChosen(chosen, contact.id, intent));
  const chooseIntent = (next: MatterIntent) => {
    setIntent(next);
    setUrgency(null);
    if (next === "act") setPicked(chosen.slice(0, 1));
  };
  const ready = chosen.length > 0 && (intent === "fyi" || ask.trim().length > 0) && phase.kind !== "sending";
  const scopes = useRecipientScopes(target.card, chosen);

  const send = async () => {
    setPhase({ kind: "sending" });
    const recipients = chosen.map((userId) => ({ userId, channel: "winyu" as const }));
    const body = { card: target.card, question: target.question, ask, intent, urgency, recipients, grantDays: directory?.mayGrant ? grantDays : null, closeOnGoal: keepGoal };
    const response = await fetch(SHARES_ENDPOINT, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const payload = response?.ok ? ((await response.json()) as { receipts: ShareReceipt[]; grants?: ShareGrantReceipt[]; hidden?: RecipientScope[]; path: string }) : null;
    if (!payload) return setPhase({ kind: "failed", refused: response?.status === REFUSED_STATUS });
    onSent({ receipts: payload.receipts, grants: payload.grants ?? [], hidden: payload.hidden ?? [], days: grantDays, path: payload.path, at: new Date().toISOString(), folded: false });
  };

  return (
    <>
      <button type="button" aria-label={TH.common.close} onClick={close} className="fixed inset-0 z-50 bg-foreground/10 backdrop-blur-sm" />
      <aside className={PANEL} aria-label={TH.share.sheetTitle} data-share-sheet>
        <header className="flex items-start justify-between gap-2 border-b border-border px-4 py-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold">
              <Forward className="size-4 text-primary" aria-hidden />
              {TH.share.sheetTitle}
            </h2>
            <p className="text-sm leading-snug text-foreground wrap-anywhere">{title}</p>
          </div>
          <button type="button" onClick={close} aria-label={TH.common.close} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
            <X className="size-4" aria-hidden />
          </button>
        </header>
        <div className="flex flex-col gap-3 border-b border-border px-4 py-3">
          <IntentToggle intent={intent} choose={chooseIntent} />
          {intent === "act" ? <UrgencyChoice urgency={urgency} choose={setUrgency} /> : null}
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">{TH.share.askLabel}</span>
            <textarea value={ask} onChange={(event) => setAsk(event.target.value.replace(LINE_BREAKS, " ").slice(0, MATTER_ASK_MAX))} rows={ASK_ROWS} placeholder={TH.share.askPlaceholder} data-share-ask className="field-sizing-content min-h-16 resize-none rounded-xl border border-border bg-transparent px-3 py-2 text-sm leading-relaxed outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring" />
          </label>
          <ContradictionNote text={contradictionOf(ask, preview.figures)} />
          {intent === "act" && preview.goal ? <GoalChoice goal={preview.goal} keep={keepGoal} toggle={() => setKeepGoal((value) => !value)} /> : null}
        </div>
        <div className="ui-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto">
          <PeoplePicker contacts={contacts} suggested={preview} chosen={chosen} onToggle={toggle} />
        </div>
        <footer className="flex flex-col gap-2 border-t border-border px-4 py-3">
          <RecipientWarnings scopes={scopes} granting={grantDays !== null} grant={directory?.mayGrant ? () => setGrantDays(DEFAULT_GRANT_DAYS) : null} />
          {directory?.mayGrant ? <GrantPicker days={grantDays} choose={setGrantDays} /> : null}
          <p className="text-[11px] leading-relaxed text-muted-foreground">{TH.share.sheetNote}</p>
          {phase.kind === "failed" ? (
            <p className="text-xs text-danger">
              {phase.refused ? TH.share.refused : TH.share.failed}
            </p>
          ) : null}
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">{TH.share.chosen(chosen.length)}</span>
            <button type="button" onClick={() => void send()} disabled={!ready} data-share-send className="inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-xs font-medium text-ink-foreground transition hover:opacity-90 disabled:opacity-40">
              <Forward className="size-3.5" aria-hidden />
              {phase.kind === "sending" ? TH.share.sending : TH.share.send}
            </button>
          </div>
        </footer>
      </aside>
    </>
  );
}

type SentCard = { ref: string; path: string; receipts: ShareReceipt[]; at: string };

/** What the server says the person sent, added under each card's ref where this page has not recorded a send of its own (that one carries its grants and whether its receipt was folded). */
function withServerSends(current: Record<string, SentShare>, sent: readonly SentCard[]): Record<string, SentShare> {
  const added = sent.filter((card) => !current[card.ref]).map((card): [string, SentShare] => [card.ref, { receipts: card.receipts, grants: [], hidden: [], days: null, path: card.path, at: card.at, folded: false }]);
  return added.length > 0 ? { ...current, ...Object.fromEntries(added) } : current;
}

/** The cards the signed-in person sent, read again on every page, so a sent card reads as sent after navigation and reload. */
function useServerSends(pathname: string, merge: (sent: SentCard[]) => void): void {
  useEffect(() => {
    const controller = new AbortController();
    fetch(SHARES_ENDPOINT, { signal: controller.signal })
      .then((response) => (response.ok ? (response.json() as Promise<{ sent?: SentCard[] }>) : null))
      .then((payload) => {
        if (Array.isArray(payload?.sent)) merge(payload.sent);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [pathname, merge]);
}

/** Lets every card inside offer ส่งต่อ, with one sheet for the whole surface that closes when the person moves to another page, and knows which cards the person sent (from the server, and each send made here) so the card reads as sent; with `open` false (the admin turned sending work off) no card offers it. */
export function ShareProvider({ open, children }: { open: boolean; children: ReactNode }) {
  const [target, setTarget] = useState<ShareTarget | null>(null);
  const [byCard, setByCard] = useState<Record<string, SentShare>>({});
  const pathname = usePathname();
  const show = useCallback((next: ShareTarget) => setTarget(next), []);
  const close = useCallback(() => setTarget(null), []);
  useEffect(close, [close, pathname]);
  const merge = useCallback((sent: SentCard[]) => setByCard((current) => withServerSends(current, sent)), []);
  useServerSends(pathname, merge);
  const value = useMemo(() => (open ? show : null), [open, show]);
  const fold = useCallback((key: string) => setByCard((current) => (current[key] ? { ...current, [key]: { ...current[key], folded: true } } : current)), []);
  const sentShares = useMemo(() => ({ byCard, fold }), [byCard, fold]);
  const sent = (sentTarget: ShareTarget, share: SentShare) => {
    setByCard((current) => ({ ...current, [cardRefOf(sentTarget.card)]: share }));
    close();
  };
  return (
    <ShareContext.Provider value={value}>
      <SentContext.Provider value={sentShares}>
        {children}
        {open && target ? <Sheet key={JSON.stringify(target.card)} target={target} close={close} onSent={(share) => sent(target, share)} /> : null}
      </SentContext.Provider>
    </ShareContext.Provider>
  );
}

/** Hands the outermost card inside its ส่งต่อ pill, which reads as sent with the receipt under the card once this card went out; nothing outside a surface that can share. */
export function ShareChrome({ target, children }: { target: ShareTarget | null; children: ReactNode }) {
  const share = useShareCard();
  const { byCard, fold } = useContext(SentContext);
  const key = target ? cardRefOf(target.card) : null;
  const sent = key ? byCard[key] : undefined;
  const note = sent && key && !sent.folded ? <ShareSent receipts={sent.receipts} grants={sent.grants} hidden={sent.hidden} days={sent.days} path={sent.path} at={sent.at} close={() => fold(key)} /> : null;
  const value = share && target ? { share: () => share(target), label: TH.share.buttonLabel(shareTitle(target.card)), sent: sent ? { note } : null } : null;
  return <CardShareProvider value={value}>{children}</CardShareProvider>;
}
