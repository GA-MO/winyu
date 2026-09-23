"use client";

import { ArrowRight } from "lucide-react";
import type { User } from "@/lib/contracts";
import { TH } from "@/lib/i18n/th";
import { useSignIn } from "./use-sign-in";

const CARD =
  "group flex w-full items-center gap-4 rounded-3xl border border-border bg-card p-4 text-left shadow-card transition duration-300 hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-lift disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const ADMIN_HOME = "/admin";

function initialOf(user: User): string {
  return user.nameTh.replace(/^คุณ/, "").slice(0, 1);
}

function destinationOf(user: User): string {
  return user.role === "it_admin" ? ADMIN_HOME : "/";
}

/** The people of one role as sign-in cards; picking one signs in and lands where that role starts. */
export function PersonList({ users }: { users: readonly User[] }) {
  const { signIn, pending, chosen, error } = useSignIn();
  return (
    <div className="flex flex-col gap-3">
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {users.map((user, index) => {
          const busy = pending && chosen === user.id;
          return (
            <li key={user.id} className="animate-hero-rise" style={{ animationDelay: `${Math.min(index, 12) * 40}ms` }}>
              <button type="button" onClick={() => signIn(user.id, destinationOf(user))} disabled={pending} aria-label={`${TH.login.pick} ${user.nameTh}`} className={CARD}>
                <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-bubble text-lg font-semibold text-accent-foreground">{initialOf(user)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{user.nameTh}</span>
                  <span className="block truncate text-sm text-muted-foreground">{user.title}</span>
                  <span className="mt-1.5 inline-flex rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{user.region ? TH.region[user.region] : TH.region.all}</span>
                </span>
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition group-hover:border-transparent group-hover:bg-ink group-hover:text-ink-foreground">
                  {busy ? <span className="size-3 animate-hero-pulse rounded-full bg-current" aria-label={TH.login.signingIn} /> : <ArrowRight className="size-4" aria-hidden />}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
