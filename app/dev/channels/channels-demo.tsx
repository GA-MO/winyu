"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Bell, CalendarDays, ChevronLeft, Menu, MessageSquare, Search, SendHorizontal, Users } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { TH } from "@/lib/i18n/th";
import type { Sent } from "@/scripts/channels-sim";
import { AdaptiveCardView, type AdaptivePress } from "./adaptive-card-view";
import { chatOf, paneLinkOf, teamsThreadOf, type Bubble, type DemoPerson } from "./feed";
import { FlexView, type FlexPress } from "./flex-view";

const POLL_MS = 700;
const DEFAULT_TEAMS_USER = "u_thana";
const DEFAULT_LINE_USER = "u_krit";
const T = TH.channelsDemo;

type Simulator = { people: DemoPerson[] | null; entries: Sent[]; reachable: boolean };

function useSimulator(origin: string): Simulator {
  const [people, setPeople] = useState<DemoPerson[] | null>(null);
  const [entries, setEntries] = useState<Sent[]>([]);
  const [reachable, setReachable] = useState(true);
  const cursor = useRef(0);

  useEffect(() => {
    fetch(`${origin}/ui/people`)
      .then((response) => (response.ok ? (response.json() as Promise<DemoPerson[]>) : Promise.reject(new Error(String(response.status)))))
      .then(setPeople)
      .catch(() => setReachable(false));
  }, [origin]);

  useEffect(() => {
    let stopped = false;
    const poll = async () => {
      const response = await fetch(`${origin}/ui/feed?after=${cursor.current}`).catch(() => null);
      if (stopped) return;
      if (!response?.ok) return setReachable(false);
      const fresh = ((await response.json()) as { sent: Sent[] }).sent;
      setReachable(true);
      if (fresh.length === 0) return;
      cursor.current = fresh[fresh.length - 1].seq;
      setEntries((previous) => [...previous, ...fresh]);
    };
    void poll();
    const timer = setInterval(poll, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [origin]);

  return { people, entries, reachable };
}

function send(origin: string, path: string, body: Record<string, string>): void {
  void fetch(`${origin}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => undefined);
}

function openAs(link: string, person: DemoPerson): void {
  window.open(paneLinkOf(link, window.location, person.userId), "_blank", "noopener");
}

function useAutoScroll(count: number, typing: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: "smooth" });
  }, [count, typing]);
  return ref;
}

function PersonaPicker({ people, value, choose, className }: { people: DemoPerson[]; value: string; choose: (userId: string) => void; className?: string }) {
  return (
    <label className={cn("flex min-w-0 items-center gap-2 text-xs", className)}>
      <span className="shrink-0 opacity-80">{T.persona}</span>
      <select value={value} onChange={(event) => choose(event.target.value)} className="min-w-0 max-w-56 truncate rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {people.map((person) => (
          <option key={person.userId} value={person.userId}>
            {person.nameTh} · {person.title}
          </option>
        ))}
      </select>
    </label>
  );
}

function Composer({ submit, className, inputClassName, buttonClassName }: { submit: (text: string) => void; className: string; inputClassName: string; buttonClassName: string }) {
  const [text, setText] = useState("");
  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    submit(trimmed);
    setText("");
  };
  return (
    <form onSubmit={onSubmit} className={className}>
      <input value={text} onChange={(event) => setText(event.target.value)} placeholder={T.placeholder} aria-label={T.placeholder} className={cn("min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground", inputClassName)} />
      <button type="submit" aria-label={T.send} disabled={!text.trim()} className={cn("flex shrink-0 items-center justify-center transition disabled:opacity-40", buttonClassName)}>
        <SendHorizontal className="size-4" aria-hidden />
      </button>
    </form>
  );
}

function Dots({ className }: { className: string }) {
  return (
    <span className="inline-flex items-center gap-1" aria-hidden>
      {[0, 150, 300].map((delay) => (
        <span key={delay} className={cn("size-1.5 animate-bounce rounded-full", className)} style={{ animationDelay: `${delay}ms` }} />
      ))}
    </span>
  );
}

function BotAvatar({ className }: { className: string }) {
  return <span className={cn("flex shrink-0 items-center justify-center rounded-full bg-ink text-xs font-bold text-ink-foreground", className)}>W</span>;
}

function TeamsBubble({ bubble, press }: { bubble: Bubble; press: AdaptivePress }) {
  if (bubble.kind === "mine") {
    return (
      <div className="flex justify-end">
        <p className="max-w-[75%] whitespace-pre-wrap wrap-anywhere rounded-md bg-teams-bubble px-3 py-2 text-sm text-foreground">{bubble.text}</p>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2.5">
      <BotAvatar className="mt-5 size-8" />
      <div className="min-w-0 max-w-[85%] flex-1">
        <p className="mb-1 text-xs text-muted-foreground">{T.botName}</p>
        <div className="rounded-md bg-card px-4 py-3 text-sm shadow-card">
          {bubble.kind === "adaptive" ? <AdaptiveCardView card={bubble.card} press={press} /> : null}
          {bubble.kind === "text" ? <p className="whitespace-pre-wrap wrap-anywhere">{bubble.text}</p> : null}
        </div>
      </div>
    </div>
  );
}

function TeamsWindow({ origin, people, entries }: { origin: string; people: DemoPerson[]; entries: Sent[] }) {
  const [userId, setUserId] = useState(DEFAULT_TEAMS_USER);
  const person = people.find((candidate) => candidate.userId === userId) ?? people[0];
  const chat = chatOf(entries, "teams", teamsThreadOf(person));
  const scroller = useAutoScroll(chat.bubbles.length, chat.typing);
  const press: AdaptivePress = (action) => {
    if (action.type === "Action.OpenUrl" && action.url) return openAs(action.url, person);
    if (action.type === "Action.Submit" && action.data?.actionId) send(origin, "/ui/teams/press", { oid: person.oid, name: person.nameTh, actionId: action.data.actionId, value: action.data.value ?? "", label: action.title ?? "" });
  };
  return (
    <PaneFrame hint={T.opensAs(person.nameTh)}>
      <div className="flex h-[44rem] overflow-hidden rounded-xl border border-border bg-teams-surface shadow-lift">
        <nav className="hidden w-16 shrink-0 flex-col items-center gap-5 bg-teams py-4 text-teams-foreground sm:flex" aria-hidden>
          <Menu className="size-5 opacity-80" />
          <Bell className="size-5 opacity-70" />
          <MessageSquare className="size-5" />
          <Users className="size-5 opacity-70" />
          <CalendarDays className="size-5 opacity-70" />
        </nav>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-3 border-b border-border bg-card px-4 py-2">
            <span className="text-sm font-semibold text-teams">Microsoft Teams</span>
            <span className="mx-auto hidden max-w-xs flex-1 items-center gap-2 rounded-md bg-teams-surface px-3 py-1 text-xs text-muted-foreground md:flex">
              <Search className="size-3.5" aria-hidden />
              Search
            </span>
            <PersonaPicker people={people} value={person.userId} choose={setUserId} className="ml-auto text-muted-foreground" />
          </div>
          <header className="flex items-center gap-3 border-b border-border bg-card px-5 py-3">
            <BotAvatar className="size-9" />
            <div className="min-w-0">
              <p className="text-sm font-semibold">{T.botName}</p>
              <p className="text-xs text-muted-foreground">{T.botStatus}</p>
            </div>
            <span className="ml-auto border-b-2 border-teams pb-0.5 text-sm font-semibold">Chat</span>
          </header>
          <div ref={scroller} className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-5">
            {chat.bubbles.length === 0 && !chat.typing ? <p className="m-auto max-w-sm text-center text-xs text-muted-foreground">{T.teamsHint}</p> : null}
            {chat.bubbles.map((bubble, index) => (
              <TeamsBubble key={`${bubble.seq}-${index}`} bubble={bubble} press={press} />
            ))}
            {chat.typing ? (
              <p className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
                <Dots className="bg-teams" />
                {T.typing}
              </p>
            ) : null}
          </div>
          <Composer
            submit={(text) => send(origin, "/ui/teams/say", { oid: person.oid, name: person.nameTh, text })}
            className="mx-5 mb-5 flex items-center gap-2 rounded-md border-b-2 border-teams bg-card px-3 py-2.5 shadow-card"
            inputClassName="text-foreground"
            buttonClassName="size-8 rounded-md text-teams hover:bg-teams-surface"
          />
        </div>
      </div>
    </PaneFrame>
  );
}

function LineBubble({ bubble, press }: { bubble: Bubble; press: FlexPress }) {
  if (bubble.kind === "mine") {
    return (
      <div className="flex justify-end">
        <p className="max-w-[78%] whitespace-pre-wrap wrap-anywhere rounded-2xl rounded-tr-sm bg-line-bubble px-3 py-2 text-sm text-foreground">{bubble.text}</p>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2">
      <BotAvatar className="size-8" />
      <div className="min-w-0 max-w-[85%] flex-1">
        <p className="mb-1 text-[11px] text-ink-foreground">{T.botName}</p>
        {bubble.kind === "flex" ? <FlexView bubble={bubble.bubble} press={press} /> : null}
        {bubble.kind === "text" ? <p className="w-fit whitespace-pre-wrap wrap-anywhere rounded-2xl rounded-tl-sm bg-card px-3 py-2 text-sm text-foreground">{bubble.text}</p> : null}
      </div>
    </div>
  );
}

function LinePhone({ origin, people, entries }: { origin: string; people: DemoPerson[]; entries: Sent[] }) {
  const [userId, setUserId] = useState(DEFAULT_LINE_USER);
  const person = people.find((candidate) => candidate.userId === userId) ?? people[0];
  const chat = chatOf(entries, "line", person.lineUserId);
  const scroller = useAutoScroll(chat.bubbles.length, chat.typing);
  const press: FlexPress = (action) => {
    if (action.type === "uri" && action.uri) return openAs(action.uri, person);
    if (action.type === "postback" && action.data) send(origin, "/ui/line/press", { lineUserId: person.lineUserId, data: action.data, label: action.displayText ?? action.label ?? "" });
  };
  return (
    <PaneFrame hint={T.opensAs(person.nameTh)} picker={<PersonaPicker people={people} value={person.userId} choose={setUserId} className="text-muted-foreground" />}>
      <div className="mx-auto w-full max-w-[24rem] rounded-[2.75rem] border-[10px] border-ink bg-ink shadow-lift">
        <div className="flex h-[44rem] flex-col overflow-hidden rounded-[2rem] bg-line-chat">
          <div className="flex items-center justify-between px-6 pb-1 pt-3 text-[11px] font-semibold text-ink-foreground">
            <span>9:41</span>
            <span className="h-5 w-20 rounded-full bg-ink" aria-hidden />
            <span>5G</span>
          </div>
          <header className="flex items-center gap-2 px-3 py-2 text-ink-foreground">
            <ChevronLeft className="size-5" aria-hidden />
            <div className="min-w-0">
              <p className="text-sm font-semibold">{T.botName}</p>
              <p className="text-[10px] opacity-80">{T.lineStatus}</p>
            </div>
            <span className="ml-auto rounded-full bg-line px-2 py-0.5 text-[10px] font-bold text-line-foreground">LINE</span>
          </header>
          <div ref={scroller} className="flex flex-1 flex-col gap-3 overflow-y-auto px-3 py-3">
            {chat.bubbles.length === 0 && !chat.typing ? <p className="m-auto max-w-[16rem] rounded-full bg-ink/20 px-3 py-1.5 text-center text-[11px] text-ink-foreground">{T.lineHint}</p> : null}
            {chat.bubbles.map((bubble, index) => (
              <LineBubble key={`${bubble.seq}-${index}`} bubble={bubble} press={press} />
            ))}
            {chat.typing ? (
              <div className="flex items-center gap-2" role="status" aria-label={T.typing}>
                <BotAvatar className="size-8" />
                <span className="rounded-2xl rounded-tl-sm bg-card px-3 py-2.5">
                  <Dots className="bg-muted-foreground" />
                </span>
              </div>
            ) : null}
          </div>
          <Composer
            submit={(text) => send(origin, "/ui/line/say", { lineUserId: person.lineUserId, name: person.nameTh, text })}
            className="flex items-center gap-2 bg-card px-3 py-2.5"
            inputClassName="rounded-full bg-muted px-4 py-2 text-foreground"
            buttonClassName="size-8 rounded-full text-line hover:bg-muted"
          />
        </div>
      </div>
    </PaneFrame>
  );
}

function PaneFrame({ hint, picker, children }: { hint: string; picker?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-2">
      {picker ? <div className="flex justify-center">{picker}</div> : null}
      {children}
      <p className="text-center text-xs text-muted-foreground">{hint}</p>
    </section>
  );
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <div className="mx-auto mt-10 max-w-lg rounded-2xl border border-border bg-card p-6 text-center shadow-card">
      <p className="font-semibold">{title}</p>
      <p className="mt-2 text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

function Live({ origin }: { origin: string }) {
  const { people, entries, reachable } = useSimulator(origin);
  if (!reachable) return <Notice title={T.offlineTitle} body={T.offlineBody} />;
  if (!people || people.length === 0) return null;
  return (
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <TeamsWindow origin={origin} people={people} entries={entries} />
      <LinePhone origin={origin} people={people} entries={entries} />
    </div>
  );
}

/** The channel demo: a Teams desktop chat and a LINE phone side by side, each as a persona of its own, drawn from what Winyu really sent the simulator at `simulator` (null when the dev server runs without it). */
export function ChannelsDemo({ simulator }: { simulator: string | null }) {
  if (!simulator) return <Notice title={T.offlineTitle} body={T.offlineBody} />;
  return <Live origin={simulator} />;
}
