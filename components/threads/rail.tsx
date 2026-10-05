"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Check, History, Menu, MessageSquarePlus, PanelLeftClose, PanelLeftOpen, Pencil, Search, Trash2, X } from "lucide-react";
import { THREADS_CHANGED } from "@/components/chat/chat-session";
import { cn } from "@/components/ui/cn";
import { threadGroupOf, type ThreadGroup } from "@/lib/i18n/format";
import { TH } from "@/lib/i18n/th";

const THREADS_ENDPOINT = "/api/threads";
const STORAGE_KEY = "mascop-rail-open";
const GROUP_ORDER: ThreadGroup[] = ["today", "yesterday", "week", "older"];
const ICON_BUTTON =
  "flex size-10 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const ROW = "group flex min-h-9 items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground";
const ROW_ACTIVE = "bg-bubble text-foreground";
const ROW_ACTION = "rounded-md p-1 opacity-0 transition focus-visible:opacity-100 group-hover:opacity-100 hover:text-foreground";
const TEXT = TH.conversation.rail;

type ThreadSummary = { id: string; title: string; createdAt: string; updatedAt: string; packetId: string | null };

type RowMode = { kind: "view" } | { kind: "rename"; id: string; draft: string } | { kind: "confirm-delete"; id: string };

function storedOpen(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "false";
  } catch {
    return true;
  }
}

function persistOpen(open: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, String(open));
  } catch {
    return;
  }
}

function useThreads() {
  const pathname = usePathname();
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const load = useCallback(() => {
    fetch(THREADS_ENDPOINT)
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { threads?: ThreadSummary[] } | null) => setThreads(payload?.threads ?? []))
      .catch(() => undefined);
  }, []);
  useEffect(load, [load, pathname]);
  useEffect(() => {
    window.addEventListener(THREADS_CHANGED, load);
    return () => window.removeEventListener(THREADS_CHANGED, load);
  }, [load]);
  return { threads, load };
}

function grouped(threads: readonly ThreadSummary[], query: string) {
  const needle = query.trim().toLowerCase();
  const visible = needle ? threads.filter((thread) => thread.title.toLowerCase().includes(needle)) : threads;
  return GROUP_ORDER.map((group) => ({ group, items: visible.filter((thread) => threadGroupOf(thread.updatedAt) === group) })).filter((entry) => entry.items.length > 0);
}

/** The person's threads beside the chat: new chat, search, threads grouped by day, rename and delete in place; collapses to icons on desktop and slides in on mobile. */
export function ThreadRail() {
  const pathname = usePathname();
  const router = useRouter();
  const { threads, load } = useThreads();
  const [open, setOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<RowMode>({ kind: "view" });

  useEffect(() => setOpen(storedOpen()), []);
  useEffect(() => setMobileOpen(false), [pathname]);

  const toggle = useCallback(() => {
    setOpen((current) => {
      persistOpen(!current);
      return !current;
    });
  }, []);

  const rename = useCallback(
    async (id: string, title: string) => {
      setMode({ kind: "view" });
      if (!title.trim()) return;
      await fetch(`${THREADS_ENDPOINT}/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ title }) });
      load();
    },
    [load],
  );

  const remove = useCallback(
    async (id: string) => {
      setMode({ kind: "view" });
      await fetch(`${THREADS_ENDPOINT}/${id}`, { method: "DELETE" });
      load();
      if (pathname === `/c/${id}`) router.push("/");
    },
    [load, pathname, router],
  );

  const expanded = open || mobileOpen;
  const groups = grouped(threads, query);

  return (
    <>
      <button type="button" onClick={() => setMobileOpen(true)} aria-label={TEXT.expand} className={cn(ICON_BUTTON, "fixed bottom-24 left-3 z-30 border border-border bg-card shadow-card md:hidden")}>
        <Menu className="size-5" aria-hidden />
      </button>
      {mobileOpen ? <button type="button" aria-label={TH.common.close} onClick={() => setMobileOpen(false)} className="fixed inset-0 z-30 bg-foreground/10 backdrop-blur-sm md:hidden" /> : null}

      <aside
        aria-label={TEXT.label}
        className={cn(
          "z-40 flex shrink-0 flex-col gap-2 border-r border-border bg-card/80 py-3 backdrop-blur transition-[width] duration-300",
          expanded ? "w-72 px-3" : "w-14 px-2",
          mobileOpen ? "fixed inset-y-0 left-0 bg-card" : "hidden md:flex",
        )}
      >
        <div className={cn("flex items-center gap-1", expanded ? "justify-between" : "flex-col")}>
          <RailLink href="/c/new" icon={<MessageSquarePlus className="size-5" aria-hidden />} label={TEXT.newChat} expanded={expanded} />
          <button type="button" onClick={toggle} aria-label={expanded ? TEXT.collapse : TEXT.expand} className={cn(ICON_BUTTON, "hidden md:flex")}>
            {expanded ? <PanelLeftClose className="size-5" aria-hidden /> : <PanelLeftOpen className="size-5" aria-hidden />}
          </button>
          <button type="button" onClick={() => setMobileOpen(false)} aria-label={TH.common.close} className={cn(ICON_BUTTON, "md:hidden")}>
            <X className="size-5" aria-hidden />
          </button>
        </div>

        {expanded ? (
          <>
            <label className="flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5">
              <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={TEXT.searchPlaceholder}
                aria-label={TEXT.search}
                className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </label>
            <div className="ui-scrollbar -mr-1 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
              {groups.length === 0 ? <p className="px-3 py-4 text-xs text-muted-foreground">{query.trim() ? TEXT.noMatch : TEXT.empty}</p> : null}
              {groups.map((entry) => (
                <section key={entry.group} className="flex flex-col gap-0.5">
                  <h2 className="px-3 py-1 text-[11px] font-medium tracking-wide text-muted-foreground">{TEXT.groups[entry.group]}</h2>
                  {entry.items.map((thread) => (
                    <ThreadRow key={thread.id} thread={thread} active={pathname === `/c/${thread.id}`} mode={mode} setMode={setMode} rename={rename} remove={remove} />
                  ))}
                </section>
              ))}
            </div>
          </>
        ) : (
          <nav className="flex flex-col items-center gap-1">
            <button type="button" onClick={toggle} aria-label={TEXT.search} title={TEXT.search} className={ICON_BUTTON}>
              <Search className="size-5" aria-hidden />
            </button>
            <button type="button" onClick={toggle} aria-label={TEXT.history} title={TEXT.history} className={ICON_BUTTON}>
              <History className="size-5" aria-hidden />
            </button>
          </nav>
        )}
      </aside>
    </>
  );
}

type RowProps = {
  thread: ThreadSummary;
  active: boolean;
  mode: RowMode;
  setMode: (mode: RowMode) => void;
  rename: (id: string, title: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
};

function ThreadRow({ thread, active, mode, setMode, rename, remove }: RowProps) {
  const rowClass = cn(ROW, active ? ROW_ACTIVE : "");
  if (mode.kind === "rename" && mode.id === thread.id) {
    return (
      <div className={rowClass}>
        <input
          value={mode.draft}
          autoFocus
          onChange={(event) => setMode({ ...mode, draft: event.target.value })}
          onKeyDown={(event) => {
            if (event.key === "Enter") void rename(thread.id, mode.draft);
            if (event.key === "Escape") setMode({ kind: "view" });
          }}
          aria-label={TEXT.renamePlaceholder}
          placeholder={TEXT.renamePlaceholder}
          className="w-full min-w-0 bg-transparent text-sm text-foreground outline-none"
        />
        <button type="button" onClick={() => void rename(thread.id, mode.draft)} aria-label={TH.common.save} className="rounded-md p-1 hover:text-foreground">
          <Check className="size-4" aria-hidden />
        </button>
      </div>
    );
  }
  if (mode.kind === "confirm-delete" && mode.id === thread.id) {
    return (
      <div className={cn(rowClass, "flex-col items-stretch gap-2 bg-muted py-2")} role="alertdialog" aria-label={TEXT.deleteConfirm}>
        <p className="text-xs text-foreground">{TEXT.deleteConfirm}</p>
        <div className="flex gap-2">
          <button type="button" onClick={() => void remove(thread.id)} className="rounded-full bg-destructive px-3 py-1 text-xs font-medium text-destructive-foreground transition hover:opacity-90">
            {TH.common.delete}
          </button>
          <button type="button" onClick={() => setMode({ kind: "view" })} className="rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground transition hover:text-foreground">
            {TH.common.cancel}
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className={rowClass}>
      <Link href={`/c/${thread.id}`} className="min-w-0 flex-1 truncate" title={thread.title}>
        {thread.title}
      </Link>
      <button type="button" onClick={() => setMode({ kind: "rename", id: thread.id, draft: thread.title })} aria-label={TEXT.rename} title={TEXT.rename} className={ROW_ACTION}>
        <Pencil className="size-3.5" aria-hidden />
      </button>
      <button type="button" onClick={() => setMode({ kind: "confirm-delete", id: thread.id })} aria-label={TEXT.delete} title={TEXT.delete} className={cn(ROW_ACTION, "hover:text-danger")}>
        <Trash2 className="size-3.5" aria-hidden />
      </button>
    </div>
  );
}

function RailLink({ href, icon, label, expanded }: { href: string; icon: ReactNode; label: string; expanded: boolean }) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className={cn(expanded ? "flex flex-1 items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium" : ICON_BUTTON, "text-foreground transition hover:bg-muted")}
    >
      {icon}
      {expanded ? <span>{label}</span> : null}
    </Link>
  );
}
