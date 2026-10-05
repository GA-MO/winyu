import type { ActionEvent, FeedAction, FeedItem } from "@/lib/contracts";
import { liveAccessFor } from "@/lib/access/enforce";
import { findUser } from "@/lib/data/entities/users";
import { feedIntentKey } from "@/lib/engine/feed-learning";
import { actionEvents } from "./agent/collections";
import { feedFor } from "./feed";

const DAY_MS = 86_400_000;
const ID_PREFIX = "ev_demo_feed";

type Habit = { userId: string; pick: (items: readonly FeedItem[]) => FeedItem[]; action: Extract<FeedAction, "open" | "snooze">; daysAgo: number[]; tag?: string };

const ofKind = (kind: string) => (items: readonly FeedItem[]) => items.filter((item) => item.kind === kind);
const ofSource = (source: FeedItem["source"]) => (items: readonly FeedItem[]) => items.filter((item) => item.source === source);

/** Two weeks of how two people read their feed: HR opens licences and puts openings off; the north-east sales manager opens his alerts, market share on three separate days. */
const HABITS: readonly Habit[] = [
  { userId: "u_may", pick: ofKind("person:cert"), action: "open", daysAgo: [2, 4, 6, 9, 12] },
  { userId: "u_may", pick: ofKind("opening"), action: "snooze", daysAgo: [3, 8] },
  { userId: "u_anucha", pick: ofSource("alert"), action: "open", daysAgo: [1, 3, 5, 10] },
  { userId: "u_anucha", pick: ofKind("alert:market_share"), action: "open", daysAgo: [2, 6, 11], tag: "share" },
];

function eventOf(habit: Habit, item: FeedItem, daysAgo: number, index: number, now: number): ActionEvent {
  return {
    id: [ID_PREFIX, habit.userId, habit.action, habit.tag, index].filter((part) => part !== undefined).join("_"),
    userId: habit.userId,
    at: new Date(now - daysAgo * DAY_MS).toISOString(),
    kind: `feed_${habit.action}`,
    intentKey: feedIntentKey(item.kind, item.key),
    metric: null,
    dims: [],
    prompt: item.prompt,
    threadId: null,
  };
}

/** Adds the demo's reading habits once, against today's feed, so the learned order is visible without weeks of use; safe to run again. */
export async function ensureFeedHistory(now = Date.now()): Promise<number> {
  let added = 0;
  for (const habit of HABITS) {
    const user = findUser(habit.userId);
    if (!user) continue;
    const items = habit.pick(await feedFor(liveAccessFor(user), now));
    if (items.length === 0) continue;
    habit.daysAgo.forEach((daysAgo, index) => {
      const event = eventOf(habit, items[index % items.length], daysAgo, index, now);
      if (actionEvents().get(event.id)) return;
      actionEvents().put(event);
      added += 1;
    });
  }
  return added;
}
