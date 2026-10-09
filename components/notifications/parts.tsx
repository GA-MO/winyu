import { Bell } from "lucide-react";
import { BrandMark } from "@/components/chrome/brand-mark";
import { cn } from "@/components/ui/cn";
import { Portrait } from "@/components/ui/portrait";
import { relativeTimeTh } from "@/lib/i18n/format";
import { TH } from "@/lib/i18n/th";
import type { BellItem } from "./items";

const COPY = TH.notifications;
const WINYU_MARK = "flex shrink-0 items-center justify-center rounded-full bg-linear-135 from-primary via-brand-violet to-brand-coral text-white";
const UNKNOWN = "flex shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground";

/** Who caused the item: their portrait, Winyu's mark for a watch Winyu raised, or a plain bell when nobody is known. */
export function Face({ item, className }: { item: Pick<BellItem, "person" | "kind">; className: string }) {
  if (item.person) return <Portrait name={item.person.name} src={item.person.photo} className={cn("text-xs", className)} />;
  if (item.kind === "alert") {
    return (
      <span role="img" aria-label={COPY.winyu} className={cn(WINYU_MARK, className)}>
        <BrandMark className="size-[60%]" />
      </span>
    );
  }
  return (
    <span aria-hidden className={cn(UNKNOWN, className)}>
      <Bell className="size-[50%]" />
    </span>
  );
}

export function UnreadDot({ read, className }: { read: boolean; className?: string }) {
  if (read) return null;
  return (
    <span className={cn("size-2 shrink-0 rounded-full bg-primary", className)}>
      <span className="sr-only">{COPY.unread}</span>
    </span>
  );
}

export function When({ at, className }: { at: string; className?: string }) {
  return (
    <time dateTime={at} className={cn("shrink-0 text-[11px] tabular-nums text-muted-foreground", className)}>
      {relativeTimeTh(at)}
    </time>
  );
}
