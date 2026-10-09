import { Lock } from "lucide-react";
import { RankList } from "@/components/ui/primitives";
import type { LockedRow, RankRow } from "@/lib/cards/present";
import { TH } from "@/lib/i18n/th";

/** The viewer's own rows as a ranked list, then the rows held back from them: a lock, the name and "ซ่อน", and a way to ask; nothing else about them is known here. */
export function LockedRank({ rows, locked, askHref }: { rows: RankRow[]; locked: LockedRow[]; askHref: string | null }) {
  return (
    <div className="flex w-full min-w-0 flex-col gap-2.5">
      <RankList props={{ items: rows, showRank: false }} />
      <ul className="flex flex-col gap-1.5 border-t border-dashed border-border pt-2.5" data-locked-rows>
        {locked.map((row) => (
          <li key={row.label} className="flex min-w-0 items-center gap-2" aria-label={TH.dash.lockedRow(row.label)}>
            <Lock className="size-3.5 shrink-0 text-muted-foreground/70" aria-hidden />
            <span className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground">{row.label}</span>
            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{TH.dash.lockedHidden}</span>
            {askHref ? (
              <a href={askHref} className="shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-medium text-primary transition hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {TH.dash.lockedAsk}
              </a>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
