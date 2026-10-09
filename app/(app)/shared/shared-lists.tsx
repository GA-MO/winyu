"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChevronDown, Search } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { Portrait } from "@/components/ui/portrait";
import { relativeTimeTh } from "@/lib/i18n/format";
import { TH } from "@/lib/i18n/th";
import type { ReceivedLine, ReceivedState, SentLine, SentState, ShareLine } from "@/lib/share/card";
import { revokeGrantAction } from "../g/actions";
import { collapseRepeats, dayList, lastSentLabel, offersSearch, searchGroups, tabOf, tabSearch, withLiveGrants, type ShareGroup, type SharedTab } from "./model";

const COPY = TH.shared;
const STATE = COPY.state;
const DAYS = TH.conversation.rail.groups;
const PATH = "/shared";
const ROW = "flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none";
const FOLD = "flex min-h-12 w-full items-center gap-3 px-4 py-2.5 text-left text-xs transition hover:bg-muted focus-visible:bg-muted focus-visible:outline-none";
const HEADING = "px-4 pb-1.5 pt-3 text-[11px] font-medium text-muted-foreground";
const QUIET = "inline-flex min-h-8 shrink-0 items-center rounded-full px-3 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

type Said = { text: string; tone: string } | null;
type Queries = Record<SharedTab, string>;

function receivedSaid(state: ReceivedState): Said {
  if (state.kind === "granted") return { text: STATE.granted(state.until), tone: "text-success" };
  if (state.kind === "pending") return { text: STATE.pending(state.approverName), tone: "text-warning" };
  if (state.kind === "declined") return { text: STATE.declined, tone: "text-danger" };
  if (state.kind === "hidden") return { text: STATE.hidden, tone: "text-muted-foreground" };
  return null;
}

function sentSaid(group: ShareGroup<SentState>, grantsListed: boolean): Said {
  const { state } = group.latest;
  if (state.kind === "asked") return { text: STATE.asked(state.requesterName), tone: "text-warning" };
  if (grantsListed) return null;
  const [live] = group.grants;
  if (live) return { text: STATE.gave(live.recipientName, live.until), tone: "text-success" };
  return { text: STATE.opened(state.opened, state.recipients), tone: "text-muted-foreground" };
}

function peopleLabel(line: ShareLine<ReceivedState | SentState>): string {
  const [first, ...others] = line.people;
  if (!first) return "";
  return others.length === 0 ? first.name : COPY.toMany(first.name, others.length);
}

function contextOf(group: ShareGroup<ReceivedState | SentState>, lead: string, now: Date): string {
  if (group.count === 1) return lead;
  const sent = lastSentLabel(group, now);
  return [lead, COPY.repeats(group.count), sent ? COPY.lastSent(sent) : null].filter(Boolean).join(" · ");
}

function Row({ group, context, said, now, children }: { group: ShareGroup<ReceivedState | SentState>; context: string; said: Said; now: Date; children?: ReactNode }) {
  const person = group.latest.people[0];
  return (
    <li data-shared-row={group.latest.code} data-count={group.count}>
      <Link href={group.latest.path} className={ROW}>
        <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", group.unread ? "bg-primary" : "bg-transparent")} />
        {group.unread ? <span className="sr-only">{TH.notifications.unread}</span> : null}
        {person ? (
          <span aria-hidden className="contents">
            <Portrait name={person.name} src={person.photo} className="size-7 text-[11px]" />
          </span>
        ) : null}
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
  return <Row group={group} now={now} said={receivedSaid(group.latest.state)} context={contextOf(group, COPY.from(peopleLabel(group.latest)), now)} />;
}

function GrantLines({ group }: { group: ShareGroup<SentState> }) {
  return (
    <ul className="flex flex-col gap-1 pb-3 pl-[4.25rem] pr-4">
      {group.grants.map((grant) => (
        <li key={grant.id} className="flex items-center gap-2 text-xs" data-live-grant={grant.id}>
          <span className="min-w-0 flex-1 text-success">{COPY.gave(grant.recipientName, grant.slice, grant.until)}</span>
          <form action={revokeGrantAction}>
            <input type="hidden" name="grant" value={grant.id} />
            <input type="hidden" name="back" value={PATH} />
            <button type="submit" className={QUIET}>
              {COPY.revoke}
            </button>
          </form>
        </li>
      ))}
    </ul>
  );
}

function SentRow({ group, now, grantsListed }: { group: ShareGroup<SentState>; now: Date; grantsListed: boolean }) {
  return (
    <Row group={group} now={now} said={sentSaid(group, grantsListed)} context={contextOf(group, COPY.to(peopleLabel(group.latest)), now)}>
      {grantsListed ? <GrantLines group={group} /> : null}
    </Row>
  );
}

function DayLists<S extends ReceivedState | SentState>({ groups, now, render, empty }: { groups: ShareGroup<S>[]; now: Date; render: (group: ShareGroup<S>) => ReactNode; empty: string }) {
  const [expanded, setExpanded] = useState(false);
  const [olderOpen, setOlderOpen] = useState(false);
  if (groups.length === 0) return <p className="px-4 py-8 text-sm text-muted-foreground">{empty}</p>;
  const view = dayList(groups, now, expanded);
  return (
    <>
      {view.days.map(({ group, rows }) => (
        <section key={group} aria-label={DAYS[group]} data-day={group} className="border-b border-border last:border-b-0">
          <h3 className={HEADING}>{DAYS[group]}</h3>
          <ul className="divide-y divide-border border-t border-border">{rows.map(render)}</ul>
        </section>
      ))}
      {view.hiddenRecent > 0 ? (
        <button type="button" onClick={() => setExpanded(true)} className={cn(FOLD, "justify-center border-b border-border font-medium text-foreground")} data-shared-more={view.hiddenRecent}>
          {COPY.more(view.hiddenRecent)}
        </button>
      ) : null}
      {view.older.length > 0 ? (
        <section aria-label={DAYS.older} data-day="older">
          <button type="button" onClick={() => setOlderOpen((open) => !open)} aria-expanded={olderOpen} className={FOLD} data-shared-older={view.older.length}>
            <span className="flex-1 font-medium text-muted-foreground">
              {DAYS.older} <span className="tabular-nums">{view.older.length}</span>
            </span>
            <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", olderOpen && "rotate-180")} aria-hidden />
          </button>
          {olderOpen ? <ul className="divide-y divide-border border-t border-border">{view.older.map(render)}</ul> : null}
        </section>
      ) : null}
    </>
  );
}

function SearchBox({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <label className="flex min-h-10 min-w-0 flex-1 basis-56 items-center gap-2 rounded-full bg-muted px-3 text-sm focus-within:ring-2 focus-within:ring-ring">
      <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="sr-only">{COPY.search}</span>
      <input type="search" value={value} onChange={(event) => onChange(event.target.value)} placeholder={COPY.search} className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground" data-shared-search />
    </label>
  );
}

function TabButton({ tab, active, label, count, onChoose }: { tab: SharedTab; active: boolean; label: string; count: number; onChoose: (tab: SharedTab) => void }) {
  return (
    <a
      href={`${PATH}${tabSearch(tab)}`}
      role="tab"
      aria-selected={active}
      data-shared-tab={tab}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
        event.preventDefault();
        onChoose(tab);
      }}
      className={cn("flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-full px-4 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", active ? "bg-card font-semibold text-foreground shadow-card" : "text-muted-foreground hover:text-foreground")}
    >
      {label}
      <span className="font-normal tabular-nums text-muted-foreground">{count}</span>
    </a>
  );
}

/** Shared's two tabs, kept in `?tab=`: one row per card and person carrying its latest state, under day headings by latest activity, twenty at a time with Older folded, search past one page, and a live-grant filter with ยกเลิกสิทธิ์ on what the person sent. */
export function SharedLists({ received, sent, nowIso }: { received: ReceivedLine[]; sent: SentLine[]; nowIso: string }) {
  const now = useMemo(() => new Date(nowIso), [nowIso]);
  const receivedGroups = useMemo(() => collapseRepeats(received), [received]);
  const sentGroups = useMemo(() => collapseRepeats(sent), [sent]);
  const liveGroups = useMemo(() => withLiveGrants(sentGroups), [sentGroups]);
  const tab = tabOf(useSearchParams().get("tab"));
  const [queries, setQueries] = useState<Queries>({ received: "", sent: "" });
  const [liveOnly, setLiveOnly] = useState(false);
  const query = queries[tab];
  const tabGroups = tab === "received" ? receivedGroups : sentGroups;
  const searchable = offersSearch(tabGroups);
  const filterKey = `${tab}|${query}|${liveOnly}`;

  const choose = (next: SharedTab) => {
    if (next !== tab) window.history.pushState(null, "", `${PATH}${tabSearch(next)}`);
  };

  return (
    <div className="flex flex-col gap-3" data-shared-lists={tab}>
      <div role="tablist" aria-label={COPY.title} className="flex gap-1 rounded-full bg-muted p-1">
        <TabButton tab="received" active={tab === "received"} label={COPY.received} count={receivedGroups.length} onChoose={choose} />
        <TabButton tab="sent" active={tab === "sent"} label={COPY.sent} count={sentGroups.length} onChoose={choose} />
      </div>
      {searchable || tab === "sent" ? (
        <div className="flex flex-wrap items-center gap-2">
          {searchable ? <SearchBox value={query} onChange={(value) => setQueries((current) => ({ ...current, [tab]: value }))} /> : null}
          {tab === "sent" ? (
            <button
              type="button"
              aria-pressed={liveOnly}
              onClick={() => setLiveOnly((on) => !on)}
              data-shared-live-filter
              className={cn("flex min-h-10 shrink-0 items-center gap-2 rounded-full border px-3 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", liveOnly ? "border-foreground text-foreground" : "border-border text-muted-foreground hover:text-foreground")}
            >
              <span aria-hidden className="size-1.5 rounded-full bg-success" />
              {COPY.liveFilter}
              <span className="tabular-nums text-muted-foreground">{liveGroups.length}</span>
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-card" role="tabpanel">
        {tab === "received" ? (
          <DayLists key={filterKey} groups={searchGroups(receivedGroups, query)} now={now} empty={query ? COPY.searchEmpty(query) : COPY.receivedEmpty} render={(group) => <ReceivedRow key={group.key} group={group} now={now} />} />
        ) : (
          <DayLists
            key={filterKey}
            groups={searchGroups(liveOnly ? liveGroups : sentGroups, query)}
            now={now}
            empty={query ? COPY.searchEmpty(query) : liveOnly ? COPY.liveEmpty : COPY.sentEmpty}
            render={(group) => <SentRow key={group.key} group={group} now={now} grantsListed={liveOnly} />}
          />
        )}
      </div>
    </div>
  );
}
