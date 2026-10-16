"use client";

import { Suspense, useState } from "react";
import type { Persona } from "@/lib/contracts/persona";
import { TH } from "@/lib/i18n/th";
import { AccountSheet } from "@/components/account/sheet";
import { InboxBell } from "@/components/inbox/bell";
import { Portrait } from "@/components/ui/portrait";

const ROUND =
  "flex size-9 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-card transition hover:-translate-y-0.5 hover:border-foreground/25 hover:text-foreground hover:shadow-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** The inbox bell and the person (opening the account sheet, which holds the theme) at the top right: floating from md up, on a frosted bar the content is inset under on a phone, so they never sit over a number. */
export function AppChrome({ user }: { user: Persona }) {
  const [accountOpen, setAccountOpen] = useState(false);
  return (
    <>
      <div aria-hidden data-header-bar className="fixed inset-x-0 top-0 z-20 h-(--winyu-header-inset) border-b border-border bg-background/85 backdrop-blur md:hidden" />
      <div className="fixed right-4 top-2.5 z-30 flex items-center gap-2 md:top-4">
        <Suspense fallback={null}>
          <InboxBell className={ROUND} />
        </Suspense>
        <button type="button" onClick={() => setAccountOpen(true)} aria-label={TH.account.open} title={user.nameTh} className="rounded-full shadow-card transition hover:-translate-y-0.5 hover:shadow-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Portrait name={user.nameTh} src={user.photo} className="size-9 text-sm ring-2 ring-card" />
        </button>
      </div>
      <AccountSheet open={accountOpen} onClose={() => setAccountOpen(false)} user={user} />
    </>
  );
}
