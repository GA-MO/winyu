"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Bell } from "lucide-react";
import type { User } from "@/lib/contracts";
import { TH } from "@/lib/i18n/th";
import { InboxDrawer, focusFromParams } from "@/components/inbox/drawer";
import { AccountSheet } from "@/components/account/sheet";

const NOTIFICATIONS_ENDPOINT = "/api/notifications";
const BUTTON = "flex size-9 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-card transition hover:-translate-y-0.5 hover:border-foreground/25 hover:text-foreground hover:shadow-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function ChromeInner({ user, users }: { user: User; users: readonly User[] }) {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [inboxOpen, setInboxOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (params.has("inbox")) setInboxOpen(true);
  }, [params]);

  useEffect(() => {
    fetch(NOTIFICATIONS_ENDPOINT)
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { unread?: number } | null) => setUnread(payload?.unread ?? 0))
      .catch(() => undefined);
  }, [inboxOpen]);

  const closeInbox = useCallback(() => {
    setInboxOpen(false);
    if (params.has("inbox")) router.replace(pathname, { scroll: false });
  }, [params, pathname, router]);

  return (
    <>
      <div className="fixed right-4 top-4 z-30 flex items-center gap-2">
        <button type="button" onClick={() => setInboxOpen(true)} aria-label={TH.inbox.open} className={`relative ${BUTTON}`}>
          <Bell className="size-4" aria-hidden />
          {unread > 0 ? (
            <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-danger text-[10px] font-semibold text-card">{unread}</span>
          ) : null}
        </button>
        <button type="button" onClick={() => setAccountOpen(true)} aria-label={TH.account.open} className={BUTTON}>
          <span className="text-xs font-semibold text-foreground">{user.nameTh.replace(/^คุณ/, "").slice(0, 1)}</span>
        </button>
      </div>
      <InboxDrawer open={inboxOpen} onClose={closeInbox} focus={focusFromParams(params)} />
      <AccountSheet open={accountOpen} onClose={() => setAccountOpen(false)} user={user} users={users} />
    </>
  );
}

export function AppChrome({ user, users }: { user: User; users: readonly User[] }) {
  return (
    <Suspense fallback={null}>
      <ChromeInner user={user} users={users} />
    </Suspense>
  );
}
