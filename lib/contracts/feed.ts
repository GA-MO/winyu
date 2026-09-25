import type { NextAction } from "./actions";

export const FEED_ACTIONS = ["open", "done", "snooze", "mute"] as const;
export type FeedAction = (typeof FEED_ACTIONS)[number];
export type FeedSource = "alert" | "packet" | "visit" | "person" | "opening" | "watch";
export type FeedTone = "danger" | "warning" | "info" | "brand" | "success" | "neutral";

/** One thing a user should look at or act on today, from any source; `key` stays the same while the matter does, so a state set on it holds until the matter changes; items with the same `story` tell one story and a surface shows the first. */
export type FeedItem = {
  key: string;
  source: FeedSource;
  kind: string;
  story: string | null;
  rank: number;
  tone: FeedTone;
  label: string;
  reason: string;
  detail: string | null;
  prompt: string;
  alertId: string | null;
  packetId: string | null;
  canFinish: boolean;
  actions: NextAction[];
  because: string | null;
};

/** What one user did with one feed item: finished it, put it off until a date, or said it is not theirs. */
export type FeedStateRecord = { id: string; userId: string; key: string; state: "done" | "snoozed" | "muted"; until: string | null; at: string };
