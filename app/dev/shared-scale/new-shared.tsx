"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { ChevronDown, Search } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { Portrait } from "@/components/ui/portrait";
import { relativeTimeTh } from "@/lib/i18n/format";
import { TH } from "@/lib/i18n/th";
import { collapseRepeats, foldList, isLive, offersSearch, searchGroups, withLiveGrants, type ReceivedState, type ShareGroup, type SentState, type ShareLine } from "./model";

const COPY = TH.sharedScale;
const STATE = COPY.state;
const ROW = "flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none";
const FOLD = "flex min-h-12 w-full items-center gap-3 px-4 py-2.5 text-left text-xs transition hover:bg-muted focus-visible:bg-muted focus-visible:outline-none";
const QUIET = "inline-flex min-h-8 shrink-0 items-center rounded-full px-3 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

type Tab = "received" | "sent";
type Said = { text: string; tone: string } | null;

function receivedSaid(state: ReceivedState): Said {
  if (state.kind === "granted") return { text: STATE.granted(state.until), tone: "text-success" };
  if (state.kind === "pending") return { text: STATE.pending(state.approverName), tone: "text-warning" };
  if (state.kind === "declined") return { text: STATE.declined, tone: "text-danger" };
  if (state.kind === "hidden") return { text: STATE.hidden, tone: "text-muted-foreground" };
  return null;
}

function sentSaid(group: ShareGroup<SentState>, now: Date): Said {
  const { state } = group.latest;
  if (state.kind === "asked") return { text: STATE.asked(state.requesterName), tone: "text-warning" };
  const live = group.grants.find((grant) => isLive(grant, now));
  if (live) return { text: STATE.gave(live.recipientName, live.until), tone: "text-success" };
  return { text: STATE.opened(state.opened, state.recipients), tone: "text-muted-foreground" };
}

function peopleLabel(line: ShareLine<unknown>): string {
  const [first, ...others] = line.people;
  return others.length === 0 ? first.name : COPY.toMany(first.name, others.length);
}

function contextOf(group: ShareGroup<unknown>, lead: string, now: Date): string {
  return group.count > 1 ? `${lead} · ${COPY.repeats(group.count, relativeTimeTh(group.lastSentAt, now))}` : lead;
}

function Row({ group, context, said, now, children }: { group: ShareGroup<unknown>; context: string; said: Said; now: Date; children?: ReactNode }) {
  const person = group.latest.people[0];
  return (
    <li data-scale-row={group.key} data-count={group.count}>
      <Link href={group.latest.path} className={ROW}>
        <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", group.unread ? "bg-primary" : "bg-transparent")} />
        {group.unread ? <span className="sr-only">{TH.notifications.unread}</span> : null}
        <span aria-hidden className="contents">
          <Portrait name={person.name} src={person.photo} className="size-7 text-[11px]" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className={cn("truncate text-sm leading-snug tracking-tight", group.unread ? "font-semibold" : "font-medium")}>{group.latest.title}</span>
          <span className="truncate text-xs text-muted-foreground">{context}</span>
        </span>
        <span className="flex max-w-[45%] shrink-0 flex-col items-end gap-0.5 text-right leading-tight">
          {said ? <span className={cn("text-xs font-medium", said.tone)}>{said.text}</span> : null}
          <time dateTime={group.activityAt} className="text-[11px] tabular-nums text-muted-foreground">
            {relativeTimeTh(group.activityAt, now)}
          </time>
        </span>
      </Link>
      {children}
    </li>
  );
}

function ReceivedRow({ group, now }: { group: ShareGroup<ReceivedState>; now: Date }) {
  return <Row group={group} now={now} said={receivedSaid(group.latest.state)} context={contextOf(group, TH.shared.from(peopleLabel(group.latest)), now)} />;
}

function SentRow({ group, now, showGrants }: { group: ShareGroup<SentState>; now: Date; showGrants: boolean }) {
  return (
    <Row group={group} now={now} said={sentSaid(group, now)} context={contextOf(group, TH.shared.to(peopleLabel(group.latest)), now)}>
      {showGrants ? (
        <ul className="flex flex-col gap-1 pb-3 pl-[4.25rem] pr-4">
          {group.grants.map((grant) => (
            <li key={grant.id} className="flex items-center gap-2 text-xs" data-live-grant={grant.id}>
              <span className="min-w-0 flex-1 text-foreground/80">{TH.shared.gave(grant.recipientName, grant.slice, grant.until)}</span>
              <button type="button" className={QUIET}>
                {TH.shared.revoke}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </Row>
  );
}

function Folded<S>({ groups, now, render, empty }: { groups: ShareGroup<S>[]; now: Date; render: (group: ShareGroup<S>) => ReactNode; empty: string }) {
  const [expanded, setExpanded] = useState(false);
  const [olderOpen, setOlderOpen] = useState(false);
  const view = foldList(groups, now, expanded);
  if (groups.length === 0) return <p className="px-4 py-8 text-sm text-muted-foreground">{empty}</p>;
  return (
    <>
      <ul className="divide-y divide-border">{view.shown.map(render)}</ul>
      {view.hiddenRecent > 0 ? (
        <button type="button" onClick={() => setExpanded(true)} className={cn(FOLD, "justify-center border-t border-border font-medium text-foreground")} data-scale-more={view.hiddenRecent}>
          {COPY.more(view.hiddenRecent)}
        </button>
      ) : null}
      {view.older.length > 0 ? (
        <div className="border-t border-border">
          <button type="button" onClick={() => setOlderOpen((open) => !open)} aria-expanded={olderOpen} className={FOLD} data-scale-older={view.older.length}>
            <span className="flex-1 font-medium text-muted-foreground">{COPY.older(view.older.length)}</span>
            <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", olderOpen && "rotate-180")} aria-hidden />
          </button>
          {olderOpen ? <ul className="divide-y divide-border border-t border-border">{view.older.map(render)}</ul> : null}
        </div>
      ) : null}
    </>
  );
}

function SearchBox({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <label className="flex min-h-10 flex-1 items-center gap-2 rounded-full bg-muted px-3 text-sm focus-within:ring-2 focus-within:ring-ring">
      <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="sr-only">{COPY.search}</span>
      <input type="search" value={value} onChange={(event) => onChange(event.target.value)} placeholder={COPY.search} className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground" data-scale-search />
    </label>
  );
}

function TabButton({ active, label, count, onClick }: { active: boolean; label: string; count: number; onClick: () => void }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn("flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-full px-4 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", active ? "bg-card font-semibold text-foreground shadow-card" : "text-muted-foreground hover:text-foreground")}
    >
      {label}
      <span className="font-normal tabular-nums text-muted-foreground">{count}</span>
    </button>
  );
}

/** The proposed Shared: two tabs, one row per card and person carrying its latest state, twenty at a time, older than 30 days folded, search past one page, and a live-grant filter on what the person sent. */
export function NewShared({ received, sent, nowIso }: { received: ShareLine<ReceivedState>[]; sent: ShareLine<SentState>[]; nowIso: string }) {
  const now = useMemo(() => new Date(nowIso), [nowIso]);
  const receivedGroups = useMemo(() => collapseRepeats(received), [received]);
  const sentGroups = useMemo(() => collapseRepeats(sent), [sent]);
  const [tab, setTab] = useState<Tab>("received");
  const [query, setQuery] = useState("");
  const [liveOnly, setLiveOnly] = useState(false);
  const tabGroups = tab === "received" ? receivedGroups : sentGroups;
  const filterKey = `${tab}|${query}|${liveOnly}`;

  const choose = (next: Tab) => {
    setTab(next);
    setQuery("");
    setLiveOnly(false);
  };

  return (
    <div className="flex flex-col gap-3" data-new-shared>
      <div role="tablist" aria-label={TH.shared.title} className="flex gap-1 rounded-full bg-muted p-1">
        <TabButton active={tab === "received"} label={TH.shared.received} count={receivedGroups.length} onClick={() => choose("received")} />
        <TabButton active={tab === "sent"} label={TH.shared.sent} count={sentGroups.length} onClick={() => choose("sent")} />
      </div>
      {offersSearch(tabGroups) || tab === "sent" ? (
        <div className="flex flex-wrap items-center gap-2">
          {offersSearch(tabGroups) ? <SearchBox value={query} onChange={setQuery} /> : null}
          {tab === "sent" ? (
            <button
              type="button"
              aria-pressed={liveOnly}
              onClick={() => setLiveOnly((on) => !on)}
              data-scale-live-filter
              className={cn("flex min-h-10 shrink-0 items-center gap-2 rounded-full border px-3 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", liveOnly ? "border-foreground text-foreground" : "border-border text-muted-foreground hover:text-foreground")}
            >
              <span aria-hidden className="size-1.5 rounded-full bg-success" />
              {COPY.liveFilter}
              <span className="tabular-nums text-muted-foreground">{withLiveGrants(sentGroups, now).length}</span>
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-card" role="tabpanel">
        {tab === "received" ? (
          <Folded key={filterKey} groups={searchGroups(receivedGroups, query)} now={now} empty={query ? COPY.searchEmpty(query) : TH.shared.receivedEmpty} render={(group) => <ReceivedRow key={group.key} group={group} now={now} />} />
        ) : (
          <Folded
            key={filterKey}
            groups={searchGroups(liveOnly ? withLiveGrants(sentGroups, now) : sentGroups, query)}
            now={now}
            empty={query ? COPY.searchEmpty(query) : liveOnly ? COPY.liveEmpty : TH.shared.sentEmpty}
            render={(group) => <SentRow key={group.key} group={group} now={now} showGrants={liveOnly} />}
          />
        )}
      </div>
    </div>
  );
}
