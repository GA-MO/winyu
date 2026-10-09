import { ChevronDown, ChevronUp } from "lucide-react";
import { BrandMark } from "@/components/chrome/brand-mark";
import { cn } from "@/components/ui/cn";
import { TH } from "@/lib/i18n/th";
import { Face, Frame, Landing, UnreadDot, When, type Shell } from "./frame";
import { cappedDigest, digestOf, type DigestPart, type Moments, type NotifyItem } from "./items";

const COPY = TH.notifyUi;

function Chip({ part }: { part: DigestPart }) {
  const decide = part.bucket === "decide";
  return (
    <a
      href={part.target}
      className={cn(
        "mx-0.5 inline-flex items-center gap-1.5 rounded-full py-0.5 pl-0.5 pr-2.5 align-middle text-[13px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        decide ? "bg-primary/10 text-foreground ring-1 ring-primary/30 hover:bg-primary/15" : "bg-card text-foreground ring-1 ring-border hover:bg-muted",
      )}
    >
      <Face person={part.person} className="size-5 text-[10px]" />
      {part.text}
    </a>
  );
}

function Sentence({ parts, more }: { parts: DigestPart[]; more: number }) {
  return (
    <span className="leading-[2.1]">
      {parts.map((part, index) => (
        <span key={part.key}>
          {more === 0 && index > 0 && index === parts.length - 1 ? <span className="mx-1 text-muted-foreground">{COPY.and}</span> : null}
          <Chip part={part} />
        </span>
      ))}
      {more > 0 ? <span className="mx-1 text-muted-foreground">{COPY.andMore(more)}</span> : null}
    </span>
  );
}

type SeeAll = "expand" | "popover";

function SeeAllButton({ count, open, mode }: { count: number; open: boolean; mode: SeeAll }) {
  if (mode === "popover") {
    return (
      <button type="button" aria-haspopup="dialog" aria-expanded={open} className={cn("ml-1.5 inline-flex items-center align-middle text-xs underline-offset-4 hover:text-foreground", open ? "text-foreground underline" : "text-muted-foreground")}>
        {COPY.seeAll(count)}
      </button>
    );
  }
  const Toggle = open ? ChevronUp : ChevronDown;
  return (
    <button type="button" aria-expanded={open} className="ml-1.5 inline-flex items-center gap-0.5 align-middle text-xs text-muted-foreground hover:text-foreground">
      {COPY.seeAll(count)}
      <Toggle className="size-3.5" aria-hidden />
    </button>
  );
}

/** Winyu's one sentence under the greeting; `limit` stops it after that many phrases and counts the rest, and "ดูทั้งหมด" either expands in place or opens the bell's popover. */
export function DigestLine({ items, open = false, limit = Number.POSITIVE_INFINITY, seeAll = "expand" }: { items: NotifyItem[]; open?: boolean; limit?: number; seeAll?: SeeAll }) {
  const { shown: parts, more } = cappedDigest(digestOf(items), limit);
  return (
    <div className="mt-3 flex gap-2.5">
      <span className="mt-1 flex size-6 shrink-0 items-center justify-center rounded-full bg-linear-135 from-primary via-brand-violet to-brand-coral text-white">
        <BrandMark className="size-3.5" />
      </span>
      <p className="min-w-0 flex-1 text-sm text-foreground/85">
        {parts.length === 0 ? <span className="leading-8 text-muted-foreground">{COPY.allCaughtUp}</span> : <Sentence parts={parts} more={more} />}
        {items.length > 0 ? <SeeAllButton count={items.length} open={open} mode={seeAll} /> : null}
      </p>
    </div>
  );
}

function FullList({ items }: { items: NotifyItem[] }) {
  return (
    <ul className="mt-3 flex flex-col rounded-2xl border border-border bg-card p-1 shadow-card">
      {items.map((item) => (
        <li key={item.id} className="flex items-center gap-2.5 rounded-xl px-2.5 py-2 hover:bg-muted">
          <Face person={item.person} className="size-6 text-[10px]" />
          <p className={cn("min-w-0 flex-1 truncate text-[13px]", item.read ? "text-muted-foreground" : "font-medium")}>{item.title}</p>
          <When item={item} />
          <span className="flex w-2 justify-center">
            <UnreadDot read={item.read} />
          </span>
        </li>
      ))}
    </ul>
  );
}

/** B: no list until asked; Winyu writes one sentence under the greeting and each person in it opens their item. */
export function DirectionB({ moments, shell }: { moments: Moments; shell: (items: NotifyItem[]) => Shell }) {
  const empty = shell([]);
  return (
    <>
      <Frame label={COPY.states.empty} shell={empty}>
        <Landing viewer={empty.viewer}>
          <DigestLine items={[]} />
        </Landing>
      </Frame>
      <Frame label={COPY.states.one} shell={shell(moments.one)}>
        <Landing viewer={empty.viewer}>
          <DigestLine items={moments.one} />
        </Landing>
      </Frame>
      <Frame label={COPY.states.mixOpen} shell={shell(moments.mix)}>
        <Landing viewer={empty.viewer}>
          <DigestLine items={moments.mix} open />
          <FullList items={moments.mix} />
        </Landing>
      </Frame>
      <Frame label={COPY.states.mobile} shell={shell(moments.mix)} mobile>
        <Landing viewer={empty.viewer} compact>
          <DigestLine items={moments.mix} />
        </Landing>
      </Frame>
    </>
  );
}
