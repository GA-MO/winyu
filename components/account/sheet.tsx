"use client";

import { useCallback, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, LogOut, Moon, Shield, Sun, X } from "lucide-react";
import { ROLE_IDS } from "@/lib/contracts";
import type { Persona } from "@/lib/contracts/persona";
import { TH } from "@/lib/i18n/th";
import { cn } from "@/components/ui/cn";
import { Portrait } from "@/components/ui/portrait";
import { useTheme } from "@/components/theme/theme-provider";

const MEMORY_PAGE = "/memory";
const ADMIN_PAGE = "/admin";
const ADMIN_ROLE = "it_admin";
const SESSION_ENDPOINT = "/api/session";
const PANEL = "fixed right-0 top-0 z-50 flex h-dvh w-full max-w-[24rem] flex-col border-l border-border bg-card shadow-panel animate-panel-in";
const SECTION = "flex flex-col gap-2 border-b border-border px-4 py-4";
const CHOICE = "flex items-center gap-2 rounded-full border border-border px-3.5 py-1.5 text-xs transition hover:border-foreground/25";
const LINK = "flex items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-sm text-foreground transition hover:bg-muted";

/** The account sheet: theme, memory, the demo persona switch, admin for IT, sign out. */
export function AccountSheet({ open, onClose, user, people }: { open: boolean; onClose: () => void; user: Persona; people: readonly Persona[] }) {
  const router = useRouter();
  const { mode, setMode } = useTheme();
  const [pending, startTransition] = useTransition();

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

  const byRole = ROLE_IDS.map((role) => ({ role, people: people.filter((person) => person.role === role) })).filter((group) => group.people.length > 0);

  return (
    <>
      <button type="button" aria-label={TH.common.close} onClick={onClose} className="fixed inset-0 z-40 bg-foreground/10 backdrop-blur-sm" />
      <aside className={PANEL} aria-label={TH.account.open}>
        <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <Portrait name={user.nameTh} src={user.photo} className="size-10 text-sm" />
            <span className="flex min-w-0 flex-col leading-tight">
              <span className="truncate text-sm font-medium">{user.nameTh}</span>
              <span className="truncate text-xs text-muted-foreground">{user.title}</span>
            </span>
          </div>
          <button type="button" onClick={onClose} aria-label={TH.common.close} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
            <X className="size-4" aria-hidden />
          </button>
        </header>

        <div className="ui-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto">
          <section className={SECTION}>
            <Link href={MEMORY_PAGE} onClick={onClose} className={LINK}>
              {TH.account.memory}
              <ArrowRight className="size-3.5 text-muted-foreground" aria-hidden />
            </Link>
            {user.role === ADMIN_ROLE ? (
              <Link href={ADMIN_PAGE} onClick={onClose} className={LINK}>
                <span className="flex items-center gap-2">
                  <Shield className="size-4 text-muted-foreground" aria-hidden />
                  {TH.account.adminLink}
                </span>
                <ArrowRight className="size-3.5 text-muted-foreground" aria-hidden />
              </Link>
            ) : null}
          </section>

          <section className={SECTION}>
            <h3 className="text-xs font-medium tracking-wide text-muted-foreground">{TH.account.theme}</h3>
            <div className="flex gap-2">
              <button type="button" onClick={() => setMode("light")} className={cn(CHOICE, mode === "light" ? "border-transparent bg-bubble text-foreground" : "text-muted-foreground")}>
                <Sun className="size-3.5" aria-hidden />
                {TH.account.themeLight}
              </button>
              <button type="button" onClick={() => setMode("dark")} className={cn(CHOICE, mode === "dark" ? "border-transparent bg-bubble text-foreground" : "text-muted-foreground")}>
                <Moon className="size-3.5" aria-hidden />
                {TH.account.themeDark}
              </button>
            </div>
          </section>

          <section className={SECTION}>
            <h3 className="text-xs font-medium tracking-wide text-muted-foreground">{TH.account.persona}</h3>
            {byRole.map((group) => (
              <details key={group.role} className="group" open={group.role === user.role}>
                <summary className="flex cursor-pointer items-center justify-between rounded-xl px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted">
                  {TH.role[group.role]}
                  <span className="tabular-nums">{group.people.length}</span>
                </summary>
                <div className="mt-1 flex flex-col gap-1">
                  {group.people.map((person) => (
                    <button
                      key={person.id}
                      type="button"
                      disabled={pending}
                      onClick={() => switchTo(person.id)}
                      aria-current={person.id === user.id}
                      className={cn("flex items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-left text-sm transition hover:bg-muted", person.id === user.id && "bg-bubble")}
                    >
                      <Portrait name={person.nameTh} src={person.photo} className="size-7 text-xs" />
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate">{person.nameTh}</span>
                        <span className="truncate text-xs text-muted-foreground">{person.title}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </details>
            ))}
          </section>

          <section className={SECTION}>
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
