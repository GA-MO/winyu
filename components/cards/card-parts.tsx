"use client";

import { useId, useState, type KeyboardEvent, type ReactNode } from "react";
import { BadgeCheck, ChevronDown, Ellipsis } from "lucide-react";
import { Alert } from "@/components/ui/primitives";
import { CardShareProvider, SharePill } from "@/components/ui/card-share";
import { cn } from "@/components/ui/cn";
import type { NextAction } from "@/lib/contracts";
import type { CardHero, CardParts } from "@/lib/cards/present";
import type { CardFooter, Tile } from "@/lib/cards/reading";
import type { Tone } from "@/lib/dashboard/metric-display";
import { TH } from "@/lib/i18n/th";
import { useRunAction } from "./card-actions";
import { CardBodyView } from "./charts/card-body";
import { ChangeChip } from "./charts/strip";

const TONE_TEXT: Record<Tone, string> = { bad: "text-danger", good: "text-success", neutral: "text-foreground" };
const PRIMARY = "inline-flex min-h-10 items-center rounded-full bg-ink px-4 text-[13px] font-medium text-ink-foreground transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const SECONDARY = "inline-flex min-h-9 items-center rounded-full border border-border bg-card px-3.5 text-[12px] font-medium text-muted-foreground transition hover:border-foreground/25 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const MORE = "inline-flex size-10 items-center justify-center rounded-full border border-border text-muted-foreground transition hover:border-foreground/25 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const TILE_COLUMNS = ["grid-cols-1", "grid-cols-2", "grid-cols-3"] as const;

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="@container/ui w-full min-w-0">
      <section className="flex w-full min-w-0 flex-col gap-4 rounded-2xl border border-border/70 bg-card p-4 shadow-[0_1px_2px_var(--ui-card-edge),0_14px_34px_-22px_var(--ui-glow-soft)]">
        {children}
      </section>
    </div>
  );
}

function Headline({ title, verdict }: { title: string; verdict: string | null }) {
  if (!verdict) return <h3 className="text-[15px] font-semibold leading-snug tracking-tight text-foreground">{title}</h3>;
  return (
    <header className="flex min-w-0 flex-col gap-1">
      <p className="truncate text-[12px] text-muted-foreground">{title}</p>
      <h3 className="text-[19px] font-semibold leading-[1.35] tracking-tight text-foreground text-balance">{verdict}</h3>
    </header>
  );
}

/** The hero number with what it is of and its one coloured change; the value itself takes the colour when there is no change to carry it. */
function HeroLine({ hero }: { hero: CardHero }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className={cn("break-words text-[30px] font-semibold leading-none tracking-tight tabular-nums", hero.delta ? "text-foreground" : TONE_TEXT[hero.tone])}>{hero.value}</span>
        {hero.unit ? <span className="text-[14px] text-muted-foreground">{hero.unit}</span> : null}
        {hero.delta ? <ChangeChip text={hero.delta} tone={hero.tone} /> : null}
      </div>
      <p className="break-words text-[13px] text-muted-foreground">
        {hero.label}
        {hero.detail ? ` · ${hero.detail}` : ""}
      </p>
    </div>
  );
}

function TileView({ tile, lead }: { tile: Tile; lead: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-xl bg-muted/60 px-2.5 py-2.5">
      <dt className="truncate text-[11px] text-muted-foreground">{tile.label}</dt>
      <dd className={cn("break-words font-semibold leading-tight tracking-tight tabular-nums", lead ? "text-[20px]" : "text-[17px]", tile.delta ? "text-foreground" : TONE_TEXT[tile.tone])}>{tile.value}</dd>
      {tile.delta ? (
        <dd>
          <ChangeChip text={tile.delta} tone={tile.tone} />
        </dd>
      ) : null}
      {tile.sub ? <dd className="line-clamp-2 text-[11px] leading-snug text-muted-foreground">{tile.sub}</dd> : null}
    </div>
  );
}

/** Style C: the hero as the first tile, then the one or two other facts about the same scope. */
function Tiles({ hero, tiles }: { hero: CardHero; tiles: Tile[] }) {
  const lead: Tile = { label: hero.label, value: hero.value, delta: hero.delta, tone: hero.tone, sub: hero.unit };
  const all = [lead, ...tiles];
  return (
    <dl className={cn("grid gap-2", TILE_COLUMNS[Math.min(all.length, TILE_COLUMNS.length) - 1])}>
      {all.map((tile, index) => (
        <TileView key={tile.label} tile={tile} lead={index === 0} />
      ))}
    </dl>
  );
}

/** One primary next step as a button; the others behind a small ⋯ that opens them in place, reachable by keyboard and touch. */
function Actions({ primary, more }: { primary: NextAction | null; more: NextAction[] }) {
  const run = useRunAction();
  const [open, setOpen] = useState(false);
  const id = useId();
  if (!primary) return null;
  const closeOnEscape = (event: KeyboardEvent) => {
    if (event.key === "Escape") setOpen(false);
  };
  return (
    <div className="flex flex-col gap-2" onKeyDown={closeOnEscape}>
      <div className="flex items-center gap-2">
        <button type="button" title={primary.reason} onClick={() => run(primary)} className={PRIMARY}>
          {primary.label}
        </button>
        {more.length > 0 ? (
          <button type="button" aria-label={TH.read.more} aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)} className={MORE}>
            <Ellipsis className="size-4" aria-hidden />
          </button>
        ) : null}
      </div>
      {open ? (
        <div id={id} className="flex flex-wrap gap-2">
          {more.map((action) => (
            <button key={action.id} type="button" title={action.reason} onClick={() => run(action)} className={SECONDARY}>
              {action.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** The closing line: date span, scope and source, a check when the numbers are certified, and the rest of the provenance one tap away. */
function Footer({ footer }: { footer: CardFooter | null }) {
  return (
    <div className="-mt-1 flex flex-wrap items-center gap-x-3 gap-y-2">
      {footer ? (
        <details className="group min-w-0 flex-1">
          <summary className="flex min-h-8 cursor-pointer list-none items-center gap-1 rounded text-[11px] tabular-nums text-muted-foreground/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
            <span className="min-w-0">{footer.line}</span>
            {footer.verified ? <BadgeCheck className="size-3.5 shrink-0 text-success" aria-label={TH.read.verified} /> : null}
            {footer.details ? <ChevronDown aria-hidden className="size-3 shrink-0 transition-transform group-open:rotate-180" /> : null}
          </summary>
          {footer.details ? <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{footer.details}</p> : null}
        </details>
      ) : null}
      <SharePill />
    </div>
  );
}

function Face({ parts }: { parts: CardParts }) {
  const { hero, body } = parts;
  if (parts.style === "picture") return <CardBodyView body={body} />;
  if (parts.style === "scorecard" && hero) {
    return (
      <>
        <Tiles hero={hero} tiles={parts.tiles} />
        <CardBodyView body={body} />
      </>
    );
  }
  return (
    <>
      {hero ? <HeroLine hero={hero} /> : null}
      <CardBodyView body={body} />
    </>
  );
}

/** One `CardParts` rendered as React, in the chat and on the dashboard alike: verdict, hero, body by style, one next step, one footer line. */
export function CardPartsView({ parts }: { parts: CardParts }) {
  return (
    <Shell>
      <Headline title={parts.title} verdict={parts.denied ? null : parts.verdict} />
      <CardShareProvider value={null}>
        {parts.denied ? <Alert props={{ title: parts.denied.title, body: parts.denied.body, tone: "warning", meta: null }} /> : null}
        <Face parts={parts} />
        <Actions primary={parts.primary} more={parts.more} />
      </CardShareProvider>
      <Footer footer={parts.footer} />
    </Shell>
  );
}
