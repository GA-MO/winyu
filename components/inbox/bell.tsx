"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Bell } from "lucide-react";
import { BellPopover } from "@/components/notifications/bell-popover";
import { TH } from "@/lib/i18n/th";
import { cn } from "@/components/ui/cn";
import { useInboxCounts } from "./counts";
import { InboxDrawer, focusFromParams } from "./drawer";

const INBOX_PARAM = "inbox";

/** The floating bell: how many decisions wait on the person, and the notifications popover it opens; the Inbox drawer opens from the popover, the rail, or `?inbox` on any link. */
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

  const waiting = counts.decisions;
  return (
    <>
      <button
        type="button"
        onClick={() => setPopoverOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={popoverOpen}
        aria-label={waiting > 0 ? TH.notifications.bellWaiting(waiting) : TH.notifications.bell}
        className={cn("relative", popoverOpen && "border-primary/40 text-foreground ring-4 ring-primary/10", className)}
      >
        <Bell className="size-4" aria-hidden />
        {waiting > 0 ? (
          <span data-inbox-badge={waiting} className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold tabular-nums text-card">{waiting}</span>
        ) : null}
      </button>
      {popoverOpen ? <BellPopover onClose={closePopover} onOpenInbox={openDrawer} onChanged={refresh} navigate={navigate} /> : null}
      <InboxDrawer open={drawerOpen} onClose={closeDrawer} focus={focusFromParams(params)} onChanged={refresh} />
    </>
  );
}
