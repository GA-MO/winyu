"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronDown, Sparkles, X } from "lucide-react";
import { cn } from "vexa/lib/utils";
import type { Story, StoryCard, StoryKind } from "@/lib/contracts";
import { TH } from "@/lib/i18n/th";
import { DataCard } from "@/components/cards/data-card";

const KIND_BADGE: Record<StoryKind, string> = {
  urgent: "bg-danger/10 text-danger",
  watch: "bg-warning/15 text-foreground",
  ok: "bg-success/10 text-success",
};
const ASK = "inline-flex shrink-0 items-center gap-1 rounded-full bg-ink px-3 py-1 text-xs font-medium text-ink-foreground transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export type StoryCounts = { urgent: number; watch: number; total: number };

/** The one count every surface shows: urgent stories, stories worth watching, and both together. */
export function storyCounts(stories: readonly Story[]): StoryCounts {
  const urgent = stories.filter((story) => story.kind === "urgent").length;
  const watch = stories.filter((story) => story.kind === "watch").length;
  return { urgent, watch, total: urgent + watch };
}

/** The counts as one sentence, on the home page and in the stories drawer. */
export function countsLine(counts: StoryCounts): string {
  if (counts.urgent > 0 && counts.watch > 0) return `${TH.stories.toDecide(counts.urgent)} · ${TH.stories.toWatch(counts.watch)}`;
  if (counts.urgent > 0) return TH.stories.toDecide(counts.urgent);
  if (counts.watch > 0) return TH.stories.toWatch(counts.watch);
  return TH.stories.nothingToDecide;
}

/** Urgent stories first, then the ones worth watching; fine news goes to the steady list. */
export function orderCards(cards: readonly StoryCard[]): { ranked: StoryCard[]; steady: StoryCard[] } {
  const ofKind = (kind: StoryKind) => cards.filter((card) => card.story.kind === kind);
  return { ranked: [...ofKind("urgent"), ...ofKind("watch")], steady: ofKind("ok") };
}

function askHref(story: Story): string {
  return `/c/new?story=${encodeURIComponent(story.id)}`;
}

function RuledOut({ story }: { story: Story }) {
  if (story.ruledOut.length === 0) return null;
  return (
    <p className="flex items-start gap-1.5 text-xs leading-snug text-muted-foreground">
      <X aria-hidden className="mt-0.5 size-3 shrink-0" />
      <span>
        {TH.stories.ruledOut} {story.ruledOut.map((item) => item.text).join(" · ")}
      </span>
    </p>
  );
}

function NextStep({ story }: { story: Story }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl bg-muted px-3.5 py-3 sm:flex-row sm:items-center">
      {story.action ? (
        <>
          <Sparkles aria-hidden className="hidden size-3.5 shrink-0 text-brand-violet sm:block" />
          <p className="min-w-0 flex-1 text-sm leading-relaxed">{story.action}</p>
        </>
      ) : (
        <p className="min-w-0 flex-1 text-sm text-muted-foreground">{TH.stories.followOnly}</p>
      )}
      <Link href={askHref(story)} className={cn(ASK, "self-start sm:self-center")}>
        {TH.stories.ask}
        <ArrowRight aria-hidden className="size-3.5" />
      </Link>
    </div>
  );
}

/** One matter: the finding in a sentence; opened, what was ruled out, the evidence card Cop draws from the query the model chose, and the next step. */
export function StoryItem({ card, defaultOpen }: { card: StoryCard; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const { story, evidence } = card;
  return (
    <article className="flex flex-col gap-3 border-b border-border py-4 first:pt-0 last:border-b-0">
      <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)} className="group flex items-start gap-3 text-left focus-visible:outline-none">
        <span className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", KIND_BADGE[story.kind])}>{TH.stories.kind[story.kind]}</span>
            <span className="text-xs text-muted-foreground">{story.scope}</span>
          </span>
          <span className="text-[15px] font-semibold leading-snug tracking-tight group-focus-visible:underline">{story.finding}</span>
        </span>
        <ChevronDown aria-hidden className={cn("mt-1 size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open ? (
        <div className="flex flex-col gap-3">
          <RuledOut story={story} />
          {evidence && story.evidence ? <DataCard props={{ title: story.evidence.title, source: evidence }} /> : null}
          <NextStep story={story} />
        </div>
      ) : null}
    </article>
  );
}

/** Fine news, one line each. */
export function SteadyList({ cards }: { cards: readonly StoryCard[] }) {
  if (cards.length === 0) return null;
  return (
    <section className="flex flex-col gap-1 rounded-2xl border border-border bg-card px-4 py-3 shadow-card">
      <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold">
        <span aria-hidden className="size-1.5 rounded-full bg-success" />
        {TH.stories.steady}
      </h3>
      <ul className="divide-y divide-border">
        {cards.map(({ story }) => (
          <li key={story.id} className="py-2.5 text-sm">
            {story.finding}
          </li>
        ))}
      </ul>
    </section>
  );
}
