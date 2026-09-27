import Link from "next/link";
import { ArrowRight, Check, CircleHelp, CircleDot, Sparkles, X } from "lucide-react";
import { cn } from "vexa/lib/utils";
import type { CheckVerdict, Story, StoryKind } from "@/lib/contracts";
import { TH } from "@/lib/i18n/th";

const CARD = "flex flex-col rounded-2xl border border-border bg-card shadow-card";
const KIND_BADGE: Record<StoryKind, string> = {
  urgent: "bg-danger/10 text-danger",
  watch: "bg-warning/15 text-foreground",
  ok: "bg-success/10 text-success",
};
const SHOWN_VERDICTS: readonly CheckVerdict[] = ["ruled_out", "likely", "unknown"];
const VERDICT_TEXT: Record<CheckVerdict, string> = {
  confirmed: "text-success",
  likely: "text-foreground",
  ruled_out: "text-muted-foreground",
  unknown: "text-muted-foreground",
};
const HEADLINE_TONE = { bad: "text-danger", good: "text-success", neutral: "text-foreground" } as const;
const VERDICT_ICON = { confirmed: Check, likely: CircleDot, ruled_out: X, unknown: CircleHelp } as const;
export const STORY_ASK = "inline-flex shrink-0 items-center gap-1 rounded-full bg-ink px-3 py-1 text-xs font-medium text-ink-foreground transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const WHOLE_GAP_PERCENT = 100;
const LEAD_CAUSES = 3;

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

/** The counts as one sentence, on the home page and in the stories drawer. */
export function countsLine(counts: StoryCounts): string {
  if (counts.urgent > 0 && counts.watch > 0) return `${TH.stories.toDecide(counts.urgent)} · ${TH.stories.toWatch(counts.watch)}`;
  if (counts.urgent > 0) return TH.stories.toDecide(counts.urgent);
  if (counts.watch > 0) return TH.stories.toWatch(counts.watch);
  return TH.stories.nothingToDecide;
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
  const shown = story.checked.filter((check) => SHOWN_VERDICTS.includes(check.verdict));
  if (shown.length === 0) return null;
  return (
    <div className="flex flex-col gap-3 p-4">
      {SHOWN_VERDICTS.map((verdict) => {
        const rows = story.checked.filter((check) => check.verdict === verdict);
        if (rows.length === 0) return null;
        const Icon = VERDICT_ICON[verdict];
        return (
          <div key={verdict} className="flex flex-col gap-1">
            <span className={cn("inline-flex items-center gap-1 text-xs font-medium", VERDICT_TEXT[verdict])}>
              <Icon aria-hidden className="size-3" />
              {TH.stories.verdict[verdict]}
            </span>
            <ul className="flex flex-col gap-1 pl-4">
              {rows.map((check) => (
                <li key={check.text} className="text-xs leading-snug">{check.text}</li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function Causes({ story }: { story: Story }) {
  if (story.causes.length === 0) return null;
  return (
    <ol className="divide-y divide-border">
      {story.causes.slice(0, LEAD_CAUSES).map((cause, index) => (
        <li key={cause.label} className="flex items-baseline gap-3 px-4 py-3">
          <span className="w-4 shrink-0 text-xs tabular-nums text-muted-foreground">{index + 1}</span>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="text-sm font-medium">{cause.label}</span>
            <span className="truncate text-xs text-muted-foreground">{cause.detail}</span>
          </div>
          <div className="flex shrink-0 flex-col items-end text-right">
            <span className="text-sm font-semibold tabular-nums">{cause.value}</span>
            {cause.shareOfGap ? <span className="text-xs text-danger">{shareLine(cause.shareOfGap)}</span> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

function Numbers({ story }: { story: Story }) {
  return (
    <div className={cn("grid gap-3", story.projection ? "grid-cols-2" : "grid-cols-1")}>
      <div className="flex flex-col gap-0.5">
        <span className="text-[11px] font-medium text-muted-foreground">{story.headline.label}</span>
        <span className={cn("font-display text-2xl font-semibold tabular-nums tracking-tight", HEADLINE_TONE[story.headline.tone ?? "neutral"])}>{story.headline.value}</span>
      </div>
      {story.projection ? (
        <div className="flex flex-col gap-0.5">
          <span className="text-[11px] font-medium text-muted-foreground">{story.projection.label}</span>
          <span className="font-display text-2xl font-semibold tabular-nums tracking-tight text-primary">{story.projection.value}</span>
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
    <article className={cn(CARD, "divide-y divide-border")}>
      <div className="flex flex-col gap-4 p-4">
        <div className="flex flex-col gap-2">
          <Eyebrow story={story} />
          <h2 className="text-[15px] font-semibold leading-snug tracking-tight">{story.claim}</h2>
          <Owner story={story} />
        </div>
        <Numbers story={story} />
      </div>
      {story.recommendation ? (
        <div className="p-4">
          <div className="flex flex-col gap-3 rounded-xl bg-muted px-3.5 py-3 sm:flex-row sm:items-center">
            <Sparkles aria-hidden className="hidden size-3.5 shrink-0 text-brand-violet sm:block" />
            <p className="min-w-0 flex-1 text-sm leading-relaxed">{story.recommendation}</p>
            <Link href={askHref(story)} className={cn(STORY_ASK, "self-start sm:self-center")}>
              {TH.stories.ask}
              <ArrowRight aria-hidden className="size-3.5" />
            </Link>
          </div>
        </div>
      ) : null}
      <Causes story={story} />
      <Checks story={story} />
    </article>
  );
}

/** Fine news in one line each. */
export function SteadyList({ stories }: { stories: readonly Story[] }) {
  if (stories.length === 0) return null;
  return (
    <section className={cn(CARD, "gap-1 px-4 py-3")}>
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

