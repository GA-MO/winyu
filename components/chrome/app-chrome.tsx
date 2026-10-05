"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { Moon, Sun } from "lucide-react";
import type { Persona } from "@/lib/contracts/persona";
import { TH } from "@/lib/i18n/th";
import { AccountSheet } from "@/components/account/sheet";
import { InboxBell } from "@/components/inbox/bell";
import { Portrait } from "@/components/ui/portrait";
import { useTheme } from "@/components/theme/theme-provider";
import { BrandMark } from "./brand-mark";

const ROUND =
  "flex size-9 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-card transition hover:border-foreground/25 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** A light top bar: the mark home on the left; theme and the person (opening the account sheet) on the right. */
export function AppChrome({ user, people }: { user: Persona; people: readonly Persona[] }) {
  const { mode, toggle } = useTheme();
  const [accountOpen, setAccountOpen] = useState(false);
  return (
    <>
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 bg-background/70 px-4 py-3 backdrop-blur-md sm:px-6">
        <Link href="/" aria-label={TH.shell.home} className="flex items-center gap-2 rounded-full px-1 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <BrandMark className="flex items-center gap-2" />
        </Link>
        <div className="flex items-center gap-2">
          <Suspense fallback={null}>
            <InboxBell className={ROUND} />
          </Suspense>
          <button type="button" onClick={toggle} aria-label={mode === "dark" ? TH.shell.themeToLight : TH.shell.themeToDark} className={ROUND}>
            {mode === "dark" ? <Sun className="size-4" aria-hidden /> : <Moon className="size-4" aria-hidden />}
          </button>
          <button type="button" onClick={() => setAccountOpen(true)} aria-label={TH.account.open} className="rounded-full shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Portrait name={user.nameTh} src={user.photo} className="size-9 text-sm ring-2 ring-card" />
          </button>
        </div>
      </header>
      <AccountSheet open={accountOpen} onClose={() => setAccountOpen(false)} user={user} people={people} />
    </>
  );
}
