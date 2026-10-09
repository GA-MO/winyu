import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { TH } from "@/lib/i18n/th";
import { Activity, WaitingPill } from "./activity";
import type { BellItem } from "./items";

const DAY_MS = 86_400_000;

function update(key: string, daysAgo: number, read: boolean): BellItem {
  return { key, kind: "share", refId: key, title: `การ์ด ${key}`, person: null, at: new Date(Date.now() - daysAgo * DAY_MS - 60_000).toISOString(), read, target: `/s/${key}`, notificationId: key };
}

describe("Shared's timeline", () => {
  test("updates sit under the rail's day headings, newest day first, each linking to its target with unread ones marked", () => {
    const html = renderToStaticMarkup(<Activity items={[update("a", 0, false), update("b", 1, true), update("c", 20, true)]} />);
    const groups = TH.conversation.rail.groups;
    const order = [groups.today, groups.yesterday, groups.older].map((label) => html.indexOf(`>${label}<`));
    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((left, right) => left - right)).toEqual(order);
    expect(html).toContain('href="/s/a"');
    expect(html.match(new RegExp(TH.notifications.unread, "g"))?.length).toBe(1);
  });

  test("with nothing told yet it says so", () => {
    expect(renderToStaticMarkup(<Activity items={[]} />)).toContain(TH.notifications.activityEmpty);
  });

  test("the waiting pill links to the Inbox with its count, and is absent when nothing waits", () => {
    const html = renderToStaticMarkup(<WaitingPill count={2} />);
    expect(html).toContain('href="/?inbox"');
    expect(html).toContain(`${TH.notifications.decide}</span><span class="font-semibold tabular-nums">2`);
    expect(renderToStaticMarkup(<WaitingPill count={0} />)).toBe("");
  });
});
