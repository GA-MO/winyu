import Link from "next/link";
import { Inbox } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { TH } from "@/lib/i18n/th";
import { activityGroups, type BellItem } from "./items";
import { Face, UnreadDot, When } from "./parts";
import { ReadingLink } from "./reading-link";

const COPY = TH.notifications;
const INBOX_HREF = "/?inbox";

function Empty() {
  return (
    <div className="flex flex-col items-start gap-1 rounded-2xl border border-dashed border-border px-4 py-6">
      <p className="text-sm font-medium">{COPY.activityEmpty}</p>
      <p className="text-xs text-muted-foreground">{COPY.activityEmptyHint}</p>
    </div>
  );
}

/** "ต้องตัดสินใจ N", linking to the Inbox; nothing when nothing waits. */
export function WaitingPill({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <Link href={INBOX_HREF} data-waiting-pill={count} className="mt-1 flex items-center gap-2 self-start rounded-full bg-primary/[0.07] px-3 py-1.5 text-xs text-foreground transition hover:bg-primary/[0.12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <Inbox className="size-3.5 text-primary" aria-hidden />
      <span>{COPY.decide}</span>
      <span className="font-semibold tabular-nums">{count}</span>
    </Link>
  );
}

/** ความเคลื่อนไหว: every update the person was told, grouped by the chat rail's day groups, each opening its target. */
export function Activity({ items }: { items: readonly BellItem[] }) {
  const groups = activityGroups(items);
  return (
    <section aria-label={COPY.activity} className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold tracking-tight">{COPY.activity}</h2>
      {groups.length === 0 ? (
        <Empty />
      ) : (
        <div className="flex flex-col gap-3">
          {groups.map(({ group, items: rows }) => (
            <section key={group} aria-label={TH.conversation.rail.groups[group]} className="flex flex-col">
              <h3 className="pb-1.5 text-[11px] font-medium text-muted-foreground">{TH.conversation.rail.groups[group]}</h3>
              <ol className="relative flex flex-col gap-1 before:absolute before:bottom-3 before:left-[0.95rem] before:top-3 before:w-px before:bg-border">
                {rows.map((item) => (
                  <li key={item.key} className="relative">
                    <ReadingLink href={item.target} notificationId={item.read ? null : item.notificationId} data-activity={item.kind} className="flex items-start gap-3 rounded-xl px-1 py-1.5 transition hover:bg-muted focus-visible:bg-muted focus-visible:outline-none">
                      <Face item={item} className="size-6 text-[10px] ring-2 ring-background" />
                      <span className={cn("min-w-0 flex-1 text-[13px] leading-snug", item.read ? "text-muted-foreground" : "font-medium text-foreground")}>{item.title}</span>
                      <When at={item.at} className="pt-0.5" />
                      <span className="flex w-2 justify-center pt-1.5">
                        <UnreadDot read={item.read} />
                      </span>
                    </ReadingLink>
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}
