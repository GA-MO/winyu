"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Bell } from "lucide-react";
import { TH } from "@/lib/i18n/th";
import { cn } from "@/components/ui/cn";
import { useInboxCounts } from "./counts";
import { InboxDrawer, focusFromParams } from "./drawer";

const INBOX_PARAM = "inbox";

/** The floating bell: how many decisions wait on the person, and the Inbox drawer it opens; `?inbox` opens it from any link. */
export function InboxBell({ className }: { className: string }) {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { counts, refresh } = useInboxCounts(open);

  useEffect(() => {
    if (params.has(INBOX_PARAM)) setOpen(true);
  }, [params]);

  const close = useCallback(() => {
    setOpen(false);
    if (params.has(INBOX_PARAM)) router.replace(pathname, { scroll: false });
  }, [params, pathname, router]);

  const waiting = counts.decisions;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={waiting > 0 ? `${TH.inbox.open} · ${TH.inbox.waiting(waiting)}` : TH.inbox.open} className={cn("relative", className)}>
        <Bell className="size-4" aria-hidden />
        {waiting > 0 ? (
          <span data-inbox-badge={waiting} className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold tabular-nums text-card">{waiting}</span>
        ) : null}
      </button>
      <InboxDrawer open={open} onClose={close} focus={focusFromParams(params)} onChanged={refresh} />
    </>
  );
}
