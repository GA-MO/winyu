import Link from "next/link";
import type { NotificationKind } from "@/lib/contracts";
import { cn } from "@/components/ui/cn";

/** One notification as a list draws it: `when` is already written for people, `href` is where pressing it opens. */
export type NotificationListItem = { id: string; kind: NotificationKind; title: string; when: string; read: boolean; href: string };

/** A plain list of notifications, unread ones marked; kept minimal so a chosen design can replace it whole. */
export function NotificationList({ items, label }: { items: readonly NotificationListItem[]; label: string }) {
  if (items.length === 0) return null;
  return (
    <section aria-label={label} className="flex flex-col gap-1">
      <h2 className="text-xs font-medium text-muted-foreground">{label}</h2>
      <ul className="flex flex-col">
        {items.map((item) => (
          <li key={item.id}>
            <Link href={item.href} data-notification={item.id} data-kind={item.kind} className="flex items-start gap-2.5 rounded-lg px-2 py-2 transition hover:bg-muted">
              <span aria-hidden className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", item.read ? "bg-transparent" : "bg-primary")} />
              <span className="flex min-w-0 flex-col">
                <span className={cn("text-sm", item.read ? "text-muted-foreground" : "font-medium text-foreground")}>{item.title}</span>
                <span className="text-xs text-muted-foreground">{item.when}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
