"use client";

import { createContext, useContext, type ReactNode } from "react";
import { Check, Forward } from "lucide-react";
import { cn } from "./cn";
import { TH } from "@/lib/i18n/th";

const PILL = "ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const PILL_IDLE = "border-border text-muted-foreground hover:border-foreground/25 hover:text-foreground";
const PILL_SENT = "border-success/30 bg-success/[0.08] text-success hover:border-success/50";

/** How the outermost card offers ส่งต่อ: the action, its accessible label, and once the card went out, the receipt to draw under it (null once the person folded it away) and who holds it now. */
export type CardShare = { share: () => void; label: string; sent: { note: ReactNode; heldBy: readonly string[] } | null };

const CardShareContext = createContext<CardShare | null>(null);

/** The ส่งต่อ of the card being drawn, read before the card hands its children none: whether it went out and to whom. */
export function useCardShare(): CardShare | null {
  return useContext(CardShareContext);
}

/** Gives the next `Card` inside its ส่งต่อ; the card hands its own children none, so nested cards stay bare. */
export function CardShareProvider({ value, children }: { value: CardShare | null; children: ReactNode }) {
  return <CardShareContext.Provider value={value}>{children}</CardShareContext.Provider>;
}

function Pill({ card }: { card: CardShare }) {
  const Icon = card.sent ? Check : Forward;
  return (
    <button type="button" onClick={card.share} aria-label={card.label} className={cn(PILL, card.sent ? PILL_SENT : PILL_IDLE)} data-share-pill={card.sent ? "sent" : "idle"}>
      <Icon className="size-3.5" aria-hidden />
      {card.sent ? TH.share.sentButton : TH.share.button}
    </button>
  );
}

/** The ส่งต่อ pill of the outermost card (ส่งแล้ว once it went out, still tappable to send again) with the receipt under it, or nothing outside a surface that can share. */
export function SharePill() {
  const card = useContext(CardShareContext);
  if (!card) return null;
  return (
    <>
      <Pill card={card} />
      {card.sent?.note ?? null}
    </>
  );
}

/** The card's closing row: the source line, with the ส่งต่อ pill on the right that drops under it when the row is too narrow, and the receipt of a send under both. */
export function CardFootnote({ footnote }: { footnote: string | null | undefined }) {
  const card = useContext(CardShareContext);
  if (!footnote && !card) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border/60 pt-2.5">
      {footnote ? <p className="min-w-0 text-[11px] leading-normal text-muted-foreground/80">{footnote}</p> : null}
      {card ? <Pill card={card} /> : null}
      {card?.sent?.note ?? null}
    </div>
  );
}
