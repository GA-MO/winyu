"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Bell } from "lucide-react";
import { TH } from "@/lib/i18n/th";
import { cn } from "@/components/ui/cn";
import { InboxDrawer, focusFromParams } from "./drawer";

const NOTIFICATIONS_ENDPOINT = "/api/notifications";
const INBOX_PARAM = "inbox";

/** The floating bell: the unread count, and the inbox drawer it opens; `?inbox=<tab>` opens it from any link. */
export function InboxBell({ className }: { className: string }) {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (params.has(INBOX_PARAM)) setOpen(true);
  }, [params]);

  useEffect(() => {
    fetch(NOTIFICATIONS_ENDPOINT)
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { unread?: number } | null) => setUnread(payload?.unread ?? 0))
      .catch(() => undefined);
  }, [open, pathname]);

  const close = useCallback(() => {
    setOpen(false);
    if (params.has(INBOX_PARAM)) router.replace(pathname, { scroll: false });
  }, [params, pathname, router]);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={unread > 0 ? `${TH.inbox.open} · ${TH.inbox.unread(unread)}` : TH.inbox.open} className={cn("relative", className)}>
        <Bell className="size-4" aria-hidden />
        {unread > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold tabular-nums text-card">{unread}</span>
        ) : null}
      </button>
      <InboxDrawer open={open} onClose={close} focus={focusFromParams(params)} />
    </>
  );
}
