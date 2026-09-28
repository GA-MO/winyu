"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Check, History, Inbox, LayoutDashboard, Menu, MessageSquarePlus, Pencil, Search, Trash2, X } from "lucide-react";
import { cn } from "vexa/lib/utils";
import { BrandMark } from "@/components/chrome/brand-mark";
import { TH } from "@/lib/i18n/th";
import { threadGroupOf, type ThreadGroup } from "@/lib/i18n/format";

const THREADS_ENDPOINT = "/api/threads";
const STORAGE_KEY = "winyu-rail-open";
const GROUP_ORDER: ThreadGroup[] = ["today", "yesterday", "week", "older"];
const ICON_BUTTON = "flex size-10 items-center justify-center rounded-xl text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const ROW = "group flex items-center gap-2 rounded-full px-3 py-1.5 text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground";
const ROW_ACTIVE = "bg-bubble text-foreground";
const BRAND_MARK = "flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-linear-135 from-primary via-brand-violet to-brand-coral text-white shadow-sm";

type ThreadSummary = { id: string; title: string; createdAt: string; updatedAt: string; packetId: string | null };

function storedOpen(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function persistOpen(open: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, String(open));
  } catch {
    return;
  }
}

export function ThreadRail() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  useEffect(() => setOpen(storedOpen()), []);

  useEffect(() => {
    document.documentElement.style.setProperty("--winyu-rail-offset", open ? "var(--winyu-rail-expanded)" : "var(--winyu-rail-collapsed)");
  }, [open]);

  const load = useCallback(() => {
    fetch(THREADS_ENDPOINT)
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { threads?: ThreadSummary[] } | null) => setThreads(payload?.threads ?? []))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    load();
    setMobileOpen(false);
  }, [load, pathname]);

  const toggle = useCallback(() => {
    setOpen((current) => {
      persistOpen(!current);
      return !current;
    });
  }, []);

  const rename = useCallback(
    async (id: string) => {
      await fetch(`${THREADS_ENDPOINT}/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: draft }) });
      setEditing(null);
      load();
    },
    [draft, load],
  );

  const remove = useCallback(
    async (id: string) => {
      if (!window.confirm(TH.rail.deleteConfirm)) return;
      await fetch(`${THREADS_ENDPOINT}/${id}`, { method: "DELETE" });
      load();
      if (pathname === `/c/${id}`) router.push("/");
    },
    [load, pathname, router],
  );

  const visible = threads.filter((thread) => thread.title.toLowerCase().includes(query.trim().toLowerCase()));
  const grouped = GROUP_ORDER.map((group) => ({ group, items: visible.filter((thread) => threadGroupOf(thread.updatedAt) === group) })).filter(
    (entry) => entry.items.length > 0,
  );
  const expanded = open || mobileOpen;

  return (
    <>
      <button type="button" onClick={() => setMobileOpen(true)} aria-label={TH.rail.expand} className={cn(ICON_BUTTON, "fixed left-2 top-2 z-30 border border-border bg-card shadow-card md:hidden")}>
        <Menu className="size-5" aria-hidden />
      </button>

      {mobileOpen ? <button type="button" aria-label={TH.common.close} onClick={() => setMobileOpen(false)} className="fixed inset-0 z-30 bg-foreground/10 backdrop-blur-sm md:hidden" /> : null}

      <aside
        className={cn(
          "fixed left-0 top-0 z-40 flex h-dvh shrink-0 flex-col gap-2 border-r border-border bg-card py-3 transition-all duration-300",
          expanded ? "w-72 px-3" : "w-14 px-2",
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
        )}
      >
        <div className={cn("flex items-center gap-2", expanded ? "justify-between" : "flex-col")}>
          <Link href="/" aria-label={TH.app.name} className="flex items-center gap-2 px-1">
            <span className={BRAND_MARK}>
              <BrandMark className="size-5" />
            </span>
            {expanded ? <span className="text-base font-semibold tracking-tight">{TH.app.name}</span> : null}
          </Link>
          <button type="button" onClick={toggle} aria-label={expanded ? TH.rail.collapse : TH.rail.expand} className={cn(ICON_BUTTON, "hidden md:flex")}>
            <Menu className="size-5" aria-hidden />
          </button>
          <button type="button" onClick={() => setMobileOpen(false)} aria-label={TH.common.close} className={cn(ICON_BUTTON, "md:hidden")}>
            <X className="size-5" aria-hidden />
          </button>
        </div>

        <nav className={cn("flex flex-col gap-1", expanded ? "" : "items-center")}>
          <RailLink href="/c/new" icon={<MessageSquarePlus className="size-5" aria-hidden />} label={TH.rail.newChat} expanded={expanded} />
          <RailLink href="/dashboard" icon={<LayoutDashboard className="size-5" aria-hidden />} label={TH.rail.dashboard} expanded={expanded} active={pathname === "/dashboard"} />
          <RailLink href="/?inbox" icon={<Inbox className="size-5" aria-hidden />} label={TH.rail.inbox} expanded={expanded} />
          {expanded ? null : (
            <>
              <button type="button" onClick={toggle} aria-label={TH.rail.search} title={TH.rail.search} className={ICON_BUTTON}>
                <Search className="size-5" aria-hidden />
              </button>
              <button type="button" onClick={toggle} aria-label={TH.rail.history} title={TH.rail.history} className={ICON_BUTTON}>
                <History className="size-5" aria-hidden />
              </button>
            </>
          )}
        </nav>

        {expanded ? (
          <>
            <label className="flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5">
              <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={TH.rail.searchPlaceholder}
                aria-label={TH.rail.search}
                className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </label>

            <div className="vexa-scrollbar -mr-1 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
              {grouped.length === 0 ? <p className="px-2 py-4 text-xs text-muted-foreground">{TH.rail.empty}</p> : null}
              {grouped.map((entry) => (
                <section key={entry.group} className="flex flex-col gap-0.5">
                  <h2 className="px-3 py-1 text-[11px] font-medium tracking-wide text-muted-foreground">{TH.rail.groups[entry.group]}</h2>
                  {entry.items.map((thread) => (
                    <div key={thread.id} className={cn(ROW, pathname === `/c/${thread.id}` ? ROW_ACTIVE : "")}>
                      {editing === thread.id ? (
                        <>
                          <input
                            value={draft}
                            autoFocus
                            onChange={(event) => setDraft(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") void rename(thread.id);
                              if (event.key === "Escape") setEditing(null);
                            }}
                            aria-label={TH.rail.renamePlaceholder}
                            className="w-full bg-transparent text-sm outline-none"
                          />
                          <button type="button" onClick={() => void rename(thread.id)} aria-label={TH.common.save} className="text-muted-foreground hover:text-foreground">
                            <Check className="size-4" aria-hidden />
                          </button>
                        </>
                      ) : (
                        <>
                          <Link href={`/c/${thread.id}`} className="min-w-0 flex-1 truncate">
                            {thread.title}
                          </Link>
                          <button
                            type="button"
                            onClick={() => {
                              setEditing(thread.id);
                              setDraft(thread.title);
                            }}
                            aria-label={TH.rail.rename}
                            className="opacity-0 transition group-hover:opacity-100 hover:text-foreground"
                          >
                            <Pencil className="size-3.5" aria-hidden />
                          </button>
                          <button type="button" onClick={() => void remove(thread.id)} aria-label={TH.rail.delete} className="opacity-0 transition group-hover:opacity-100 hover:text-danger">
                            <Trash2 className="size-3.5" aria-hidden />
                          </button>
                        </>
                      )}
                    </div>
                  ))}
                </section>
              ))}
            </div>
          </>
        ) : null}
      </aside>
    </>
  );
}

function RailLink({ href, icon, label, expanded, active }: { href: string; icon: React.ReactNode; label: string; expanded: boolean; active?: boolean }) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className={cn(
        expanded ? "flex items-center gap-3 rounded-full px-3 py-2 text-sm" : ICON_BUTTON,
        "text-muted-foreground transition hover:bg-muted hover:text-foreground",
        active ? ROW_ACTIVE : "",
      )}
    >
      {icon}
      {expanded ? <span>{label}</span> : null}
    </Link>
  );
}
