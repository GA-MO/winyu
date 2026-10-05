"use client";

import { createContext, useContext, type ReactNode } from "react";
import { Forward } from "lucide-react";
import { TH } from "@/lib/i18n/th";

const PILL = "ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition hover:border-foreground/25 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** How the outermost card offers ส่งต่อ: the action and its accessible label. */
export type CardShare = { share: () => void; label: string };

const CardShareContext = createContext<CardShare | null>(null);

/** Gives the next `Card` inside its ส่งต่อ; the card hands its own children none, so nested cards stay bare. */
export function CardShareProvider({ value, children }: { value: CardShare | null; children: ReactNode }) {
  return <CardShareContext.Provider value={value}>{children}</CardShareContext.Provider>;
}

/** The card's closing row: the source line, with the ส่งต่อ pill on the right that drops under it when the row is too narrow. */
export function CardFootnote({ footnote }: { footnote: string | null | undefined }) {
  const card = useContext(CardShareContext);
  if (!footnote && !card) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border/60 pt-2.5">
      {footnote ? <p className="min-w-0 text-[11px] leading-normal text-muted-foreground/80">{footnote}</p> : null}
      {card ? (
        <button type="button" onClick={card.share} aria-label={card.label} className={PILL}>
          <Forward className="size-3.5" aria-hidden />
          {TH.share.button}
        </button>
      ) : null}
    </div>
  );
}
