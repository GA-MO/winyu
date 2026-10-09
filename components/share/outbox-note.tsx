import Link from "next/link";
import { Inbox } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { TH } from "@/lib/i18n/th";

/** Where the demo's mail went: the in-app Outbox, since the generator mail port never sends. Shown under every receipt that says mail was sent. */
export function OutboxNote({ className }: { className?: string }) {
  return (
    <p className={cn("flex items-center gap-1.5 text-xs text-muted-foreground", className)}>
      <Inbox className="size-3.5 shrink-0" aria-hidden />
      <Link href="/outbox" className="font-medium text-primary underline-offset-2 hover:underline">
        {TH.outbox.viewLink}
      </Link>
      <span>{TH.outbox.demoNote}</span>
    </p>
  );
}
