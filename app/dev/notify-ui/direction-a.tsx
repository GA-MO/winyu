import { Check } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { TH } from "@/lib/i18n/th";
import { Face, Frame, Landing, PrimaryButton, QuietButton, UnreadDot, When, type Shell } from "./frame";
import { bucketOf, type Moments, type NotifyItem } from "./items";

const COPY = TH.notifyUi;

function DecisionRow({ item, lead }: { item: NotifyItem; lead: boolean }) {
  return (
    <li className={cn("flex gap-3 rounded-xl px-2.5 py-2.5", !item.read && "bg-primary/[0.05]")}>
      <Face person={item.person} className="size-8" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p className={cn("line-clamp-2 text-[13px] leading-snug", item.read ? "text-foreground/80" : "font-medium text-foreground")}>{item.title}</p>
        <div className="flex items-center gap-2">
          {lead ? <PrimaryButton>{COPY.actions[item.kind]}</PrimaryButton> : <QuietButton>{COPY.actions[item.kind]}</QuietButton>}
          <span className="flex-1" />
          <When item={item} />
        </div>
      </div>
      <UnreadDot read={item.read} className="mt-1.5" />
    </li>
  );
}

function UpdateRow({ item }: { item: NotifyItem }) {
  return (
    <li className="flex items-center gap-3 rounded-xl px-2.5 py-2 hover:bg-muted">
      <Face person={item.person} className="size-7" />
      <p className={cn("min-w-0 flex-1 truncate text-[13px]", item.read ? "text-muted-foreground" : "font-medium text-foreground")}>{item.title}</p>
      <When item={item} />
      <span className="flex w-2 justify-center">
        <UnreadDot read={item.read} />
      </span>
    </li>
  );
}

function Empty() {
  return (
    <div className="flex flex-col items-center gap-1 px-6 py-8 text-center">
      <span className="mb-2 flex size-10 items-center justify-center rounded-full bg-success/10 text-success">
        <Check className="size-5" aria-hidden />
      </span>
      <p className="text-sm font-medium">{COPY.allCaughtUp}</p>
      <p className="text-xs text-muted-foreground">{COPY.allCaughtUpHint}</p>
    </div>
  );
}

function List({ items }: { items: NotifyItem[] }) {
  if (items.length === 0) return <Empty />;
  const decide = items.filter((item) => bucketOf(item) === "decide");
  const updates = items.filter((item) => bucketOf(item) === "update");
  return (
    <div className="flex flex-col gap-2 px-1.5 pb-1.5">
      {decide.length > 0 ? (
        <section className="flex flex-col">
          <h4 className="px-2.5 pb-1 pt-1 text-[11px] font-medium text-muted-foreground">{COPY.decide}</h4>
          <ul className="flex flex-col gap-0.5">
            {decide.map((item, index) => (
              <DecisionRow key={item.id} item={item} lead={index === 0} />
            ))}
          </ul>
        </section>
      ) : null}
      {updates.length > 0 ? (
        <section className="flex flex-col">
          <h4 className="px-2.5 pb-1 pt-1 text-[11px] font-medium text-muted-foreground">{COPY.updates}</h4>
          <ul className="flex flex-col">
            {updates.map((item) => (
              <UpdateRow key={item.id} item={item} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function Panel({ items }: { items: NotifyItem[] }) {
  return (
    <>
      <header className="flex items-center gap-2 px-4 pb-1.5 pt-3">
        <h3 className="flex-1 text-sm font-semibold tracking-tight">{COPY.rail.bell}</h3>
        {items.some((item) => !item.read) ? <button type="button" className="text-xs text-muted-foreground hover:text-foreground">{COPY.markAllRead}</button> : null}
      </header>
      <List items={items} />
      <footer className="flex items-center justify-between border-t border-border px-4 py-2.5 text-xs">
        <a className="font-medium text-primary hover:underline">{COPY.openInbox}</a>
        <a className="text-muted-foreground hover:text-foreground">{COPY.openShared}</a>
      </footer>
    </>
  );
}

function Popover({ items }: { items: NotifyItem[] }) {
  return (
    <div role="dialog" aria-label={COPY.rail.bell} className="absolute right-3 top-14 z-20 w-[21.5rem] rounded-2xl border border-border bg-popover text-popover-foreground shadow-lift">
      <span aria-hidden className="absolute -top-1.5 right-[3.6rem] size-3 rotate-45 border-l border-t border-border bg-popover" />
      <Panel items={items} />
    </div>
  );
}

function Sheet({ items }: { items: NotifyItem[] }) {
  return (
    <>
      <div aria-hidden className="absolute inset-0 z-20 bg-foreground/15 backdrop-blur-[2px]" />
      <div role="dialog" aria-label={COPY.rail.bell} className="absolute inset-x-0 bottom-0 z-30 rounded-t-[26px] border-t border-border bg-popover pb-4 text-popover-foreground shadow-lift">
        <span aria-hidden className="mx-auto mt-2 block h-1 w-10 rounded-full bg-border" />
        <Panel items={items} />
      </div>
    </>
  );
}

/** A: the bell opens a small popover; decisions on top with one primary action, updates as single lines below. */
export function DirectionA({ moments, shell }: { moments: Moments; shell: (items: NotifyItem[]) => Shell }) {
  const empty = shell([]);
  return (
    <>
      <Frame label={COPY.states.empty} shell={empty} bellPressed overlay={<Popover items={[]} />}>
        <Landing viewer={empty.viewer} />
      </Frame>
      <Frame label={COPY.states.one} shell={shell(moments.one)} bellPressed overlay={<Popover items={moments.one} />}>
        <Landing viewer={empty.viewer} />
      </Frame>
      <Frame label={COPY.states.mix} shell={shell(moments.mix)} bellPressed overlay={<Popover items={moments.mix} />}>
        <Landing viewer={empty.viewer} />
      </Frame>
      <Frame label={COPY.states.mobile} shell={shell(moments.mix)} mobile bellPressed overlay={<Sheet items={moments.mix} />}>
        <Landing viewer={empty.viewer} compact />
      </Frame>
    </>
  );
}
