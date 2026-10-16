import type { FeedAction } from "@/lib/contracts";

const FEED_ENDPOINT = "/api/feed";

export type FeedSettle = Exclude<FeedAction, "open">;

/** Tells the server what the user did with one feed item; the list hides the item right away and does not wait. */
export function postFeedAction(key: string, action: FeedAction): void {
  void fetch(FEED_ENDPOINT, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key, action }) }).catch(() => undefined);
}
