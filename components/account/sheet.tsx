"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BellRing, LogOut, Moon, Shield, Sun, Trash2, X } from "lucide-react";
import { cn } from "vexa/lib/utils";
import type { MemoryFact, User, WatchItem } from "@/lib/contracts";
import { STORY_CAST } from "@/lib/demo/stories";
import { TH } from "@/lib/i18n/th";
import { useTheme } from "@/components/theme/theme-provider";

const MEMORY_ENDPOINT = "/api/memory";
const WATCHES_ENDPOINT = "/api/watches";
const SESSION_ENDPOINT = "/api/session";
const PANEL = "fixed right-0 top-0 z-50 flex h-dvh w-full max-w-[24rem] flex-col border-l border-border bg-card shadow-panel animate-panel-in";
const SECTION = "flex flex-col gap-2 border-b border-border px-4 py-4";
const CHOICE = "flex items-center gap-2 rounded-full border border-border px-3.5 py-1.5 text-xs transition hover:border-foreground/25";

export function AccountSheet({ open, onClose, user, users }: { open: boolean; onClose: () => void; user: User; users: readonly User[] }) {
  const router = useRouter();
  const { mode, setMode } = useTheme();
  const [facts, setFacts] = useState<MemoryFact[]>([]);
  const [watches, setWatches] = useState<WatchItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [pending, startTransition] = useTransition();

  const load = useCallback(() => {
    const memory = fetch(MEMORY_ENDPOINT)
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { facts?: MemoryFact[] } | null) => setFacts(payload?.facts ?? []));
    const watching = fetch(WATCHES_ENDPOINT)
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { watches?: WatchItem[] } | null) => setWatches(payload?.watches ?? []));
    Promise.allSettled([memory, watching]).then(() => setLoaded(true));
  }, []);

  useEffect(() => {
    if (open) load();
  }, [load, open]);

  const forget = useCallback(
    async (id: string) => {
      await fetch(`${MEMORY_ENDPOINT}/${id}`, { method: "DELETE" });
      load();
    },
    [load],
  );

  const unwatch = useCallback(
    async (id: string) => {
      await fetch(`${WATCHES_ENDPOINT}/${id}`, { method: "DELETE" });
      load();
    },
    [load],
  );

  const switchTo = useCallback(
    (userId: string) => {
      startTransition(async () => {
        await fetch(SESSION_ENDPOINT, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId }) });
        onClose();
        router.push("/");
        router.refresh();
      });
    },
    [onClose, router],
  );

  const signOut = useCallback(() => {
    startTransition(async () => {
      await fetch(SESSION_ENDPOINT, { method: "DELETE" });
      router.push("/login");
    });
  }, [router]);

  if (!open) return null;

  const storyCast = STORY_CAST.flatMap((id) => users.find((person) => person.id === id) ?? []);
  const others = users.filter((person) => !STORY_CAST.includes(person.id));
  const personButton = (person: User) => (
    <button
      key={person.id}
      type="button"
      disabled={pending}
      onClick={() => switchTo(person.id)}
      className={cn("flex flex-col items-start rounded-xl px-2.5 py-1.5 text-left text-sm transition hover:bg-muted", person.id === user.id ? "bg-bubble" : "")}
    >
      <span>{person.nameTh}</span>
      <span className="text-xs text-muted-foreground">{person.title}</span>
    </button>
  );

  const grouped = Object.entries(
    facts.reduce<Record<string, MemoryFact[]>>((groups, fact) => ({ ...groups, [fact.type]: [...(groups[fact.type] ?? []), fact] }), {}),
  );

  return (
    <>
      <button type="button" aria-label={TH.common.close} onClick={onClose} className="fixed inset-0 z-40 bg-foreground/10 backdrop-blur-sm" />
      <aside className={PANEL} aria-label={TH.account.open}>
        <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="flex size-9 items-center justify-center rounded-xl bg-ink text-sm font-semibold text-ink-foreground">
              {user.nameTh.replace(/^คุณ/, "").slice(0, 1)}
            </span>
            <span className="flex flex-col leading-tight">
              <span className="text-sm font-medium">{user.nameTh}</span>
              <span className="text-xs text-muted-foreground">{user.title}</span>
            </span>
          </div>
          <button type="button" onClick={onClose} aria-label={TH.common.close} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
            <X className="size-4" aria-hidden />
          </button>
        </header>

        <div className="vexa-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto">
          <section className={SECTION}>
            <h3 className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground">
              <BellRing className="size-3.5" aria-hidden />
              {TH.watch.section}
            </h3>
            <p className="text-xs text-muted-foreground">{TH.watch.sectionNote}</p>
            {loaded && watches.length === 0 ? <p className="text-sm text-muted-foreground">{TH.watch.empty}</p> : null}
            {watches.map((watch) => (
              <div key={watch.id} className="flex items-center justify-between gap-2 rounded-xl bg-muted px-2.5 py-1.5">
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm">{watch.title}</span>
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span aria-hidden className={cn("size-1.5 rounded-full", watch.state === "triggered" ? "bg-warning" : "bg-success")} />
                    {watch.state === "triggered" ? TH.watch.triggered : TH.watch.ok} · {watch.condition}
                  </span>
                </span>
                <button type="button" onClick={() => void unwatch(watch.id)} aria-label={TH.watch.remove} className="text-muted-foreground hover:text-danger">
                  <Trash2 className="size-3.5" aria-hidden />
                </button>
              </div>
            ))}
          </section>

          <section className={SECTION}>
            <h3 className="text-xs font-medium tracking-wide text-muted-foreground">{TH.account.memory}</h3>
            <p className="text-xs text-muted-foreground">{TH.account.memoryNote}</p>
            {loaded && grouped.length === 0 ? <p className="text-sm text-muted-foreground">{TH.account.memoryEmpty}</p> : null}
            {grouped.map(([type, items]) => (
              <div key={type} className="flex flex-col gap-1">
                <h4 className="text-xs text-muted-foreground">{TH.account.memoryType[type as keyof typeof TH.account.memoryType] ?? type}</h4>
                {items.map((fact) => (
                  <div key={fact.id} className="flex items-center justify-between gap-2 rounded-xl bg-muted px-2.5 py-1.5 text-sm">
                    <span className="min-w-0 truncate">{fact.value}</span>
                    <button type="button" onClick={() => void forget(fact.id)} aria-label={TH.common.delete} className="text-muted-foreground hover:text-danger">
                      <Trash2 className="size-3.5" aria-hidden />
                    </button>
                  </div>
                ))}
              </div>
            ))}
          </section>

          <section className={SECTION}>
            <h3 className="text-xs font-medium tracking-wide text-muted-foreground">{TH.account.theme}</h3>
            <div className="flex gap-2">
              <button type="button" onClick={() => setMode("dark")} className={cn(CHOICE, mode === "dark" ? "border-transparent bg-bubble text-foreground" : "text-muted-foreground")}>
                <Moon className="size-3.5" aria-hidden />
                {TH.account.themeDark}
              </button>
              <button type="button" onClick={() => setMode("light")} className={cn(CHOICE, mode === "light" ? "border-transparent bg-bubble text-foreground" : "text-muted-foreground")}>
                <Sun className="size-3.5" aria-hidden />
                {TH.account.themeLight}
              </button>
            </div>
          </section>

          <section className={SECTION}>
            <h3 className="text-xs font-medium tracking-wide text-muted-foreground">{TH.account.persona}</h3>
            <div className="flex flex-col gap-1">{storyCast.map(personButton)}</div>
            <details className="group">
              <summary className="cursor-pointer rounded-xl px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted">{TH.account.otherPeople(others.length)}</summary>
              <div className="mt-1 flex flex-col gap-1">{others.map(personButton)}</div>
            </details>
          </section>

          <section className={SECTION}>
            {user.role === "it_admin" ? (
              <Link href="/admin" onClick={onClose} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground">
                <Shield className="size-4" aria-hidden />
                {TH.account.adminLink}
              </Link>
            ) : null}
            <button type="button" onClick={signOut} disabled={pending} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-danger hover:bg-muted">
              <LogOut className="size-4" aria-hidden />
              {TH.account.signOut}
            </button>
          </section>
        </div>
      </aside>
    </>
  );
}
