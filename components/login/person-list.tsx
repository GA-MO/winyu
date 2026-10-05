"use client";

import { ArrowRight } from "lucide-react";
import type { Persona } from "@/lib/contracts/persona";
import { TH } from "@/lib/i18n/th";
import { Portrait } from "@/components/ui/portrait";
import { useSignIn } from "./use-sign-in";

const CARD =
  "group flex w-full items-center gap-4 rounded-3xl border border-border bg-card p-4 text-left shadow-card transition duration-300 hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-lift disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const HOME = "/";
const ADMIN_HOME = "/admin";

function destinationOf(person: Persona, next: string): string {
  return person.role === "it_admin" && next === HOME ? ADMIN_HOME : next;
}

/** The people of one role as sign-in cards; picking one signs in and lands where that role starts (IT on the admin console). */
export function PersonList({ people, next }: { people: readonly Persona[]; next: string }) {
  const { signIn, pending, chosen, error } = useSignIn();
  return (
    <div className="flex flex-col gap-3">
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {people.map((person, index) => {
          const busy = pending && chosen === person.id;
          return (
            <li key={person.id} className="animate-hero-rise" style={{ animationDelay: `${Math.min(index, 12) * 40}ms` }}>
              <button type="button" onClick={() => signIn(person.id, destinationOf(person, next))} disabled={pending} aria-label={`${TH.login.pick} ${person.nameTh}`} className={CARD}>
                <Portrait name={person.nameTh} src={person.photo} className="size-12 text-lg" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{person.nameTh}</span>
                  <span className="block truncate text-sm text-muted-foreground">{person.title}</span>
                  <span className="mt-1.5 inline-flex rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{person.region ? TH.region[person.region] : TH.region.all}</span>
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
