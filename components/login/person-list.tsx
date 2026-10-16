"use client";

import { ArrowRight } from "lucide-react";
import type { Persona } from "@/lib/contracts/persona";
import { TH } from "@/lib/i18n/th";
import { cn } from "@/components/ui/cn";
import { Portrait } from "@/components/ui/portrait";
import { useSignIn } from "./use-sign-in";

const CARD =
  "group flex w-full rounded-3xl border border-border bg-card p-4 text-left shadow-card transition duration-300 hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-lift disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const HOME = "/";
const ADMIN_HOME = "/admin";

export type DemoSeat = { person: Persona; opener: string };

function destinationOf(person: Persona, next: string): string {
  return person.role === "it_admin" && next === HOME ? ADMIN_HOME : next;
}

function SignInMark({ busy }: { busy: boolean }) {
  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition group-hover:border-transparent group-hover:bg-ink group-hover:text-ink-foreground">
      {busy ? <span className="size-3 animate-hero-pulse rounded-full bg-current" aria-label={TH.login.signingIn} /> : <ArrowRight className="size-4" aria-hidden />}
    </span>
  );
}

/** The people of one role as sign-in cards; picking one signs in and lands where that role starts (IT on the admin console). */
export function PersonList({ people, next }: { people: readonly Persona[]; next: string }) {
  const { signIn, pending, chosen, error } = useSignIn();
  return (
    <div className="flex flex-col gap-3">
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {people.map((person, index) => (
          <li key={person.id} className="animate-hero-rise" style={{ animationDelay: `${Math.min(index, 12) * 40}ms` }}>
            <button type="button" onClick={() => signIn(person.id, destinationOf(person, next))} disabled={pending} aria-label={`${TH.login.pick} ${person.nameTh}`} className={cn(CARD, "items-center gap-4")}>
              <Portrait name={person.nameTh} src={person.photo} className="size-12 text-lg" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{person.nameTh}</span>
                <span className="block truncate text-sm text-muted-foreground">{person.title}</span>
                <span className="mt-1.5 inline-flex rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{person.region ? TH.region[person.region] : TH.region.all}</span>
              </span>
              <SignInMark busy={pending && chosen === person.id} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The demo path as numbered sign-in cards, each naming the seat and the first question to ask there. */
export function DemoPathList({ seats, next }: { seats: readonly DemoSeat[]; next: string }) {
  const { signIn, pending, chosen, error } = useSignIn();
  return (
    <div className="flex flex-col gap-3">
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {seats.map(({ person, opener }, index) => (
          <li key={person.id} className="animate-hero-rise" style={{ animationDelay: `${index * 40}ms` }}>
            <button type="button" onClick={() => signIn(person.id, destinationOf(person, next))} disabled={pending} aria-label={`${TH.login.pick} ${person.title} ${person.nameTh}`} className={cn(CARD, "h-full flex-col gap-3")}>
              <span className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-3">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-semibold tabular-nums text-ink-foreground" aria-label={TH.login.demoPath.step(index + 1)}>
                    {index + 1}
                  </span>
                  <Portrait name={person.nameTh} src={person.photo} className="size-10 text-base" />
                </span>
                <SignInMark busy={pending && chosen === person.id} />
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="font-display text-[15px] font-semibold leading-snug tracking-tight">{person.title}</span>
                <span className="truncate text-xs text-muted-foreground">{person.nameTh}</span>
              </span>
              <span className="mt-auto flex min-w-0 items-baseline gap-1.5 rounded-2xl bg-muted px-3 py-2 text-xs">
                <span className="shrink-0 text-muted-foreground">{TH.login.demoPath.tryAsking}</span>
                <span className="truncate text-foreground">{opener}</span>
              </span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
