import Link from "next/link";
import { ArrowRight, Check, CircleHelp, CircleDot, Sparkles, X } from "lucide-react";
import { cn } from "vexa/lib/utils";
import type { CheckVerdict, Investigation, Story, StoryKind } from "@/lib/contracts";
import { formatThaiDate } from "@/lib/data/dates";
import { TH } from "@/lib/i18n/th";

const CARD = "flex flex-col rounded-3xl border border-border bg-card shadow-lift";
const KIND_BADGE: Record<StoryKind, string> = {
  urgent: "bg-danger/10 text-danger",
  watch: "bg-warning/15 text-foreground",
  ok: "bg-success/10 text-success",
};
const VERDICT_CHIP: Record<CheckVerdict, string> = {
  confirmed: "bg-success/10 text-success",
  likely: "bg-warning/15 text-foreground",
  ruled_out: "bg-muted text-muted-foreground",
  unknown: "border border-dashed border-border text-muted-foreground",
};
const HEADLINE_TONE = { bad: "text-danger", good: "text-success", neutral: "text-foreground" } as const;
const VERDICT_ICON = { confirmed: Check, likely: CircleDot, ruled_out: X, unknown: CircleHelp } as const;
const ASK_BUTTON = "inline-flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const WHOLE_GAP_PERCENT = 100;
const LEAD_CAUSES = 3;
const SIDE_CAUSES = 2;
const BANGKOK_TIME = new Intl.DateTimeFormat("th-TH", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });

export type StoryCounts = { urgent: number; watch: number; total: number };

/** The one count every surface shows: urgent stories, stories worth watching, and both together. */
export function storyCounts(stories: readonly Story[]): StoryCounts {
  const urgent = stories.filter((story) => story.kind === "urgent").length;
  const watch = stories.filter((story) => story.kind === "watch").length;
  return { urgent, watch, total: urgent + watch };
}

/** Urgent stories first, then the ones worth watching; fine news goes to the steady list. */
export function orderStories(stories: readonly Story[]): { lead: Story | null; others: Story[]; steady: Story[] } {
  const ranked = [...stories.filter((story) => story.kind === "urgent"), ...stories.filter((story) => story.kind === "watch")];
  return { lead: ranked[0] ?? null, others: ranked.slice(1), steady: stories.filter((story) => story.kind === "ok") };
}

function shareLine(share: string): string {
  return Number.parseFloat(share) > WHOLE_GAP_PERCENT ? TH.stories.beyondGap(share) : TH.stories.shareOfGap(share);
}

function askHref(story: Story): string {
  return `/c/new?story=${encodeURIComponent(story.id)}`;
}

/** The counts as one sentence, the same words on the home page and the dashboard. */
export function countsLine(counts: StoryCounts): string {
  if (counts.urgent > 0 && counts.watch > 0) return `${TH.stories.toDecide(counts.urgent)} · ${TH.stories.toWatch(counts.watch)}`;
  if (counts.urgent > 0) return TH.stories.toDecide(counts.urgent);
  if (counts.watch > 0) return TH.stories.toWatch(counts.watch);
  return TH.stories.nothingToDecide;
}

/** The page's opening line: when Cop looked, and how many things need this person. */
export function StoryHeader({ name, investigation, asOf }: { name: string; investigation: Investigation | null; asOf: string }) {
  if (!investigation) {
    return (
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-[2rem] font-semibold leading-tight tracking-[-0.02em] sm:text-[2.5rem]">{name}</h1>
        <p className="text-sm text-muted-foreground">{TH.stories.notYet}</p>
      </header>
    );
  }
  const counts = storyCounts(investigation.stories);
  return (
    <header className="flex flex-col gap-2">
      <p className="flex items-center gap-2 text-xs text-muted-foreground sm:text-sm">
        <span aria-hidden className="size-1.5 rounded-full bg-primary" />
        {TH.stories.ranAt(BANGKOK_TIME.format(new Date(investigation.at)), formatThaiDate(asOf))} · {TH.stories.looked(investigation.checkedCount)}
      </p>
      <h1 className="font-display text-[1.75rem] font-semibold leading-tight tracking-[-0.02em] sm:text-[2.5rem]">
        {name} · <span className={cn(counts.urgent > 0 && "text-danger")}>{countsLine(counts)}</span>
      </h1>
    </header>
  );
}

function KindBadge({ kind }: { kind: StoryKind }) {
  return <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", KIND_BADGE[kind])}>{TH.stories.kind[kind]}</span>;
}

function Eyebrow({ story }: { story: Story }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <KindBadge kind={story.kind} />
      <span className="text-xs text-muted-foreground">{story.scope} · {story.period}</span>
    </div>
  );
}

function Checks({ story }: { story: Story }) {
  if (story.checked.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-xs text-muted-foreground">{TH.stories.checked}</span>
      {story.checked.map((check) => {
        const Icon = VERDICT_ICON[check.verdict];
        return (
          <span key={check.text} title={TH.stories.verdict[check.verdict]} className={cn("inline-flex max-w-full items-center gap-1 rounded-full px-2.5 py-1 text-xs", VERDICT_CHIP[check.verdict])}>
            <Icon aria-hidden className="size-3 shrink-0" />
            <span className="sr-only">{TH.stories.verdict[check.verdict]}: </span>
            <span className="truncate">{check.text}</span>
          </span>
        );
      })}
    </div>
  );
}

function Causes({ story }: { story: Story }) {
  if (story.causes.length === 0) return null;
  return (
    <ol className="divide-y divide-border border-y border-border">
      {story.causes.slice(0, LEAD_CAUSES).map((cause, index) => (
        <li key={cause.label} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold tabular-nums">{index + 1}</span>
          <div className="flex min-w-[10rem] flex-1 flex-col">
            <span className="text-sm font-semibold">{cause.label}</span>
            <span className="truncate text-xs text-muted-foreground">{cause.detail}</span>
          </div>
          <div className="ml-auto flex flex-col items-end text-right">
            <span className="font-display text-base font-semibold tabular-nums">{cause.value}</span>
            {cause.shareOfGap ? <span className="text-xs text-danger">{shareLine(cause.shareOfGap)}</span> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

function Numbers({ story, size }: { story: Story; size: "lead" | "teaser" }) {
  const value = size === "lead" ? "text-3xl sm:text-4xl" : "text-2xl";
  return (
    <div className={cn("grid gap-3", story.projection ? "grid-cols-2" : "grid-cols-1")}>
      <div className={cn("flex flex-col gap-0.5", size === "lead" && "rounded-2xl border border-border px-4 py-3")}>
        <span className="text-xs text-muted-foreground">{story.headline.label}</span>
        <span className={cn("font-display font-bold tabular-nums tracking-tight", value, HEADLINE_TONE[story.headline.tone ?? "neutral"])}>{story.headline.value}</span>
      </div>
      {story.projection ? (
        <div className={cn("flex flex-col gap-0.5", size === "lead" && "rounded-2xl border border-dashed border-primary/40 bg-primary/5 px-4 py-3")}>
          <span className="text-xs text-muted-foreground">{story.projection.label}</span>
          <span className={cn("font-display font-bold tabular-nums tracking-tight text-primary", value)}>{story.projection.value}</span>
        </div>
      ) : null}
    </div>
  );
}

function Owner({ story }: { story: Story }) {
  if (!story.owner) return null;
  return <p className="text-xs text-muted-foreground">{TH.stories.owner(story.owner.nameTh, story.owner.title)}</p>;
}

/** The one thing that most needs this person: the conclusion, where it stands and where it ends, the next step, then the causes with their share and what was ruled out. */
export function LeadStory({ story }: { story: Story }) {
  return (
    <article className={cn(CARD, "gap-5 p-6 sm:p-8")}>
      <div className="flex flex-col gap-2">
        <Eyebrow story={story} />
        <h2 className="text-xl font-bold leading-snug sm:text-2xl">{story.claim}</h2>
        <Owner story={story} />
      </div>
      <Numbers story={story} size="lead" />
      {story.recommendation ? (
        <div className="flex flex-col gap-3 rounded-2xl bg-ink px-5 py-4 text-ink-foreground sm:flex-row sm:items-center">
          <Sparkles aria-hidden className="hidden size-5 shrink-0 opacity-70 sm:block" />
          <p className="min-w-0 flex-1 text-sm font-semibold leading-relaxed sm:text-base">{story.recommendation}</p>
          <Link href={askHref(story)} className={cn(ASK_BUTTON, "self-start bg-card text-foreground hover:bg-card/90 sm:self-center")}>
            {TH.stories.ask}
            <ArrowRight aria-hidden className="size-4" />
          </Link>
        </div>
      ) : null}
      <Causes story={story} />
      <Checks story={story} />
    </article>
  );
}

/** A second story: the conclusion, its number and the two biggest causes, so the lead keeps the eye. */
export function SideStory({ story }: { story: Story }) {
  return (
    <article className={cn(CARD, "gap-3 p-5 sm:p-6")}>
      <Eyebrow story={story} />
      <h3 className="text-base font-bold leading-snug sm:text-lg">{story.claim}</h3>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs text-muted-foreground">{story.headline.label}</span>
        <span className={cn("font-display text-2xl font-bold tabular-nums tracking-tight", HEADLINE_TONE[story.headline.tone ?? "neutral"])}>{story.headline.value}</span>
      </div>
      {story.causes.length > 0 ? (
        <ul className="flex flex-col divide-y divide-border border-y border-border">
          {story.causes.slice(0, SIDE_CAUSES).map((cause) => (
            <li key={cause.label} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-2 text-sm">
              <span className="min-w-0">{cause.label}</span>
              <span className="ml-auto text-right font-semibold tabular-nums">{cause.value}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <Owner story={story} />
      {story.recommendation ? <p className="line-clamp-2 text-sm text-muted-foreground">{story.recommendation}</p> : null}
      <Link href={askHref(story)} className={cn(ASK_BUTTON, "self-start border border-border text-foreground hover:border-foreground/30")}>
        {TH.stories.ask}
        <ArrowRight aria-hidden className="size-4" />
      </Link>
    </article>
  );
}

/** Fine news in one line each. */
export function SteadyList({ stories }: { stories: readonly Story[] }) {
  if (stories.length === 0) return null;
  return (
    <section className={cn(CARD, "gap-1 px-5 py-4 shadow-card")}>
      <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold">
        <span aria-hidden className="size-1.5 rounded-full bg-success" />
        {TH.stories.steady}
      </h3>
      <ul className="divide-y divide-border">
        {stories.map((story) => (
          <li key={story.id} className="flex items-baseline justify-between gap-3 py-2.5 text-sm">
            <span className="min-w-0">{story.claim}</span>
            <span className="shrink-0 font-semibold tabular-nums">{story.headline.value}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Today's stories: the lead in two columns, the rest beside it, fine news under them. */
export function StoryBoard({ stories }: { stories: readonly Story[] }) {
  const { lead, others, steady } = orderStories(stories);
  if (!lead) return steady.length > 0 ? <SteadyList stories={steady} /> : null;
  return (
    <section aria-label={countsLine(storyCounts(stories))} className="grid gap-5 lg:grid-cols-3">
      <div className="lg:col-span-2 lg:sticky lg:top-6 lg:self-start">
        <LeadStory story={lead} />
      </div>
      <div className="flex flex-col gap-5">
        {others.map((story) => (
          <SideStory key={story.id} story={story} />
        ))}
        <SteadyList stories={steady} />
      </div>
    </section>
  );
}

/** The lead story as the home page carries it: the conclusion and its numbers, one tap to the rest or to ask. */
export function StoryTeaser({ story, counts, href }: { story: Story; counts: StoryCounts; href: string }) {
  return (
    <article className={cn(CARD, "gap-4 p-5 text-left sm:p-6")}>
      <Eyebrow story={story} />
      <h2 className="text-base font-bold leading-snug sm:text-lg">{story.claim}</h2>
      <Numbers story={story} size="teaser" />
      {story.recommendation ? <p className="line-clamp-2 text-sm text-muted-foreground">{story.recommendation}</p> : null}
      <div className="flex flex-wrap items-center gap-2">
        <Link href={href} className={cn(ASK_BUTTON, "bg-ink text-ink-foreground hover:opacity-90")}>
          {TH.stories.openAll(counts.total)}
          <ArrowRight aria-hidden className="size-4" />
        </Link>
        <Link href={askHref(story)} className={cn(ASK_BUTTON, "border border-border text-foreground hover:border-foreground/30")}>
          {TH.stories.ask}
        </Link>
      </div>
    </article>
  );
}
