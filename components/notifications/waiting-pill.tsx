import Link from "next/link";
import { Inbox } from "lucide-react";
import { TH } from "@/lib/i18n/th";

const INBOX_HREF = "/?inbox";

/** "ต้องตัดสินใจ N", linking to the Inbox; nothing when nothing waits. */
export function WaitingPill({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <Link href={INBOX_HREF} data-waiting-pill={count} className="mt-1 flex items-center gap-2 self-start rounded-full bg-primary/[0.07] px-3 py-1.5 text-xs text-foreground transition hover:bg-primary/[0.12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <Inbox className="size-3.5 text-primary" aria-hidden />
      <span>{TH.notifications.decide}</span>
      <span className="font-semibold tabular-nums">{count}</span>
    </Link>
  );
}
