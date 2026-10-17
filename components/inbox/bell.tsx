"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Bell } from "lucide-react";
import { BellPopover } from "@/components/notifications/bell-popover";
import { bellSignal } from "@/components/notifications/items";
import { cn } from "@/components/ui/cn";
import { useInboxCounts } from "./counts";
import { InboxDrawer, focusFromParams } from "./drawer";

const INBOX_PARAM = "inbox";

/** The floating bell: how many decisions wait on the person (a dot for unread news when none does), and the notifications popover it opens; the Inbox drawer opens from the popover, the rail, or `?inbox` on any link. */
export function InboxBell({ className }: { className: string }) {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { counts, refresh } = useInboxCounts(`${popoverOpen}:${drawerOpen}`);

  useEffect(() => {
    if (params.has(INBOX_PARAM)) setDrawerOpen(true);
  }, [params]);

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
    if (params.has(INBOX_PARAM)) router.replace(pathname, { scroll: false });
  }, [params, pathname, router]);

  const closePopover = useCallback(() => setPopoverOpen(false), []);
  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  const navigate = useCallback((href: string) => router.push(href), [router]);

  const signal = bellSignal(counts);
  return (
    <>
      <button
        type="button"
        onClick={() => setPopoverOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={popoverOpen}
        aria-label={signal.label}
        className={cn("relative", popoverOpen && "border-primary/40 text-foreground ring-4 ring-primary/10", className)}
      >
        <Bell className="size-4" aria-hidden />
        {typeof signal.badge === "number" ? (
          <span data-inbox-badge={signal.badge} className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold tabular-nums text-card">{signal.badge}</span>
        ) : null}
        {signal.badge === "dot" ? <span data-inbox-badge="dot" className="absolute right-0 top-0 size-2.5 rounded-full bg-danger ring-2 ring-card" /> : null}
      </button>
      {popoverOpen ? <BellPopover counts={counts} onClose={closePopover} onOpenInbox={openDrawer} onChanged={refresh} navigate={navigate} /> : null}
      <InboxDrawer open={drawerOpen} onClose={closeDrawer} focus={focusFromParams(params)} onChanged={refresh} />
    </>
  );
}
