import { Inbox, X } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { threadGroupOf, type ThreadGroup } from "@/lib/i18n/format";
import { TH } from "@/lib/i18n/th";
import { Face, Frame, Landing, PrimaryButton, QuietButton, UnreadDot, When, type Shell } from "./frame";
import { bucketOf, type Moments, type NotifyItem } from "./items";

const COPY = TH.notifyUi;
const GROUP_ORDER: ThreadGroup[] = ["today", "yesterday", "week", "older"];
const TIMER_LEFT = "w-[62%]";

function Toast({ item, placement }: { item: NotifyItem; placement: "corner" | "top" }) {
  const decide = bucketOf(item) === "decide";
  return (
    <div
      role="status"
      className={cn(
        "absolute z-20 overflow-hidden rounded-2xl border border-border bg-popover text-popover-foreground shadow-lift",
        placement === "corner" ? "bottom-[5.5rem] right-4 w-[19.5rem]" : "inset-x-3 top-[3.75rem]",
      )}
    >
      <div className="flex gap-3 p-3 pr-2">
        <Face person={item.person} className="size-9" />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <p className="line-clamp-2 text-[13px] font-medium leading-snug">{item.title}</p>
          <div className="flex items-center gap-2">
            {decide ? <PrimaryButton>{COPY.actions[item.kind]}</PrimaryButton> : <QuietButton>{COPY.actions[item.kind]}</QuietButton>}
            {decide ? <button type="button" className="px-1 text-xs text-muted-foreground hover:text-foreground">{COPY.later}</button> : null}
            <span className="flex-1" />
            <When item={item} />
          </div>
        </div>
        <button type="button" aria-label={COPY.dismiss} className="flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground">
          <X className="size-3.5" aria-hidden />
        </button>
      </div>
      <span aria-hidden className="block h-0.5 bg-muted">
        <span className={cn("block h-full bg-primary/60", TIMER_LEFT)} />
      </span>
    </div>
  );
}

function ActivityEmpty() {
  return (
    <div className="flex flex-col items-start gap-1 rounded-2xl border border-dashed border-border px-4 py-6">
      <p className="text-sm font-medium">{COPY.activityEmpty}</p>
      <p className="text-xs text-muted-foreground">{COPY.activityEmptyHint}</p>
    </div>
  );
}

function Activity({ items }: { items: NotifyItem[] }) {
  const updates = items.filter((item) => bucketOf(item) === "update");
  if (updates.length === 0) return <ActivityEmpty />;
  const groups = GROUP_ORDER.map((group) => ({ group, rows: updates.filter((item) => threadGroupOf(item.at) === group) })).filter((entry) => entry.rows.length > 0);
  return (
    <div className="flex flex-col gap-3">
      {groups.map(({ group, rows }) => (
        <section key={group} className="flex flex-col">
          <h5 className="pb-1.5 text-[11px] font-medium text-muted-foreground">{TH.conversation.rail.groups[group]}</h5>
          <ol className="relative flex flex-col gap-3 before:absolute before:bottom-2 before:left-3 before:top-2 before:w-px before:bg-border">
            {rows.map((item) => (
              <li key={item.id} className="relative flex items-start gap-3">
                <Face person={item.person} className="size-6 text-[10px] ring-2 ring-background" />
                <p className={cn("min-w-0 flex-1 text-[13px] leading-snug", item.read ? "text-muted-foreground" : "font-medium text-foreground")}>{item.title}</p>
                <When item={item} className="pt-0.5" />
                <span className="flex w-2 justify-center pt-1.5">
                  <UnreadDot read={item.read} />
                </span>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

function SharedPage({ items, waiting }: { items: NotifyItem[]; waiting: number }) {
  return (
    <div className="flex h-full flex-col gap-4 px-6 pb-5 pt-16">
      <header>
        <h3 className="font-display text-[22px] font-semibold tracking-tight">{COPY.sharedTitle}</h3>
        <p className="text-xs text-muted-foreground">{COPY.sharedLead}</p>
      </header>
      {waiting > 0 ? (
        <a className="flex items-center gap-2 rounded-full bg-primary/[0.07] px-3 py-1.5 text-xs text-foreground">
          <Inbox className="size-3.5 text-primary" aria-hidden />
          <span className="flex-1">{COPY.decide}</span>
          <span className="font-semibold tabular-nums">{waiting}</span>
        </a>
      ) : null}
      <section className="flex flex-col gap-2">
        <h4 className="text-sm font-semibold tracking-tight">{COPY.activity}</h4>
        <Activity items={items} />
      </section>
    </div>
  );
}

/** C: a new item rises in the corner for a moment with one action, then leaves; updates settle quietly into an activity list on Shared. */
export function DirectionC({ moments, shell }: { moments: Moments; shell: (items: NotifyItem[]) => Shell }) {
  const empty = shell([]);
  const [decision] = moments.one;
  const newestUpdate = moments.mix.find((item) => bucketOf(item) === "update" && !item.read);
  const mix = shell(moments.mix);
  return (
    <>
      <Frame label={COPY.states.empty} shell={empty} on="shared">
        <SharedPage items={[]} waiting={0} />
      </Frame>
      <Frame label={COPY.states.one} shell={shell(moments.one)} overlay={decision ? <Toast item={decision} placement="corner" /> : null}>
        <Landing viewer={empty.viewer} />
      </Frame>
      <Frame label={COPY.states.mixShared} shell={mix} on="shared">
        <SharedPage items={moments.mix} waiting={mix.bell} />
      </Frame>
      <Frame label={COPY.states.mobile} shell={mix} mobile overlay={newestUpdate ? <Toast item={newestUpdate} placement="top" /> : null}>
        <Landing viewer={empty.viewer} compact />
      </Frame>
    </>
  );
}
