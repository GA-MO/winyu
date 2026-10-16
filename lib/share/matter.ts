import type { DeliveryChannel, FallbackReason, SharedCard } from "./card";

export const MATTER_INTENTS = ["act", "fyi"] as const;
export const MATTER_URGENCIES = ["now", "today", "this_week"] as const;

/** act: the holder must answer; fyi: for information only. */
export type MatterIntent = (typeof MATTER_INTENTS)[number];
export type MatterUrgency = (typeof MATTER_URGENCIES)[number];
export type MatterStatus = "open" | "done" | "dropped";
export type HopState = "sent" | "seen" | "accepted" | "asked" | "passed_on";

/** One person a matter reached, who passed it to them (null when Winyu did), when, and where they stand. */
export type Hop = { userId: string; fromUserId: string | null; at: string; state: HopState };

/** The number that closes a matter by itself: one read's field at least or at most a value. */
export type MatterGoal = { read: number; field: string; atLeast: number } | { read: number; field: string; atMost: number };

export type MatterEvent = { userId: string | null; at: string; kind: "note" | "accepted" | "asked" | "passed_on" | "goal_met" | "done"; text: string | null };

/** How one recipient was reached: the channel the sender picked, the one that carried it, and why they differ. */
export type ShareDelivery = { userId: string; asked: DeliveryChannel; via: DeliveryChannel; fallback: FallbackReason | null };

/** A card sent to colleagues: the reads behind it (never their results) under its short code `id`, the one-line ask, whether it waits on an answer, the people it went through, and which recipients opened it. */
export type Matter = {
  id: string;
  at: string;
  updatedAt: string;
  senderId: string;
  title: string;
  question: string | null;
  ask: string;
  intent: MatterIntent;
  urgency: MatterUrgency;
  goal: MatterGoal | null;
  path: Hop[];
  thread: MatterEvent[];
  status: MatterStatus;
  card: SharedCard;
  deliveries: ShareDelivery[];
  openedBy?: string[];
  lastViewedAt: string | null;
};

type MatterFields = "ask" | "intent" | "urgency" | "goal" | "path" | "thread" | "status" | "updatedAt";

/** A matter as the store may hold it: shares written before matters lack the workflow fields and carry their message as `note`. */
export type StoredMatter = Omit<Matter, MatterFields> & Partial<Pick<Matter, MatterFields>> & { note?: string | null };

const WAITING: ReadonlySet<HopState> = new Set(["sent", "seen"]);

function pathOf(stored: StoredMatter): Hop[] {
  const openers = new Set(stored.openedBy ?? []);
  return stored.deliveries.map((delivery) => ({ userId: delivery.userId, fromUserId: stored.senderId, at: stored.at, state: openers.has(delivery.userId) ? "seen" : "sent" }));
}

/** Reads a stored record as a matter; an older share is for information, open, one hop per recipient, with an empty thread. */
export function matterOf(stored: StoredMatter): Matter {
  const { note, ...rest } = stored;
  return {
    ...rest,
    ask: stored.ask ?? note ?? "",
    intent: stored.intent ?? "fyi",
    urgency: stored.urgency ?? "this_week",
    goal: stored.goal ?? null,
    path: stored.path ?? pathOf(stored),
    thread: stored.thread ?? [],
    status: stored.status ?? "open",
    updatedAt: stored.updatedAt ?? stored.at,
  };
}

/** Whether an open matter that asks for an answer waits on this person: they hold it (the last hop not passed on) and have not answered yet. */
export function waitsOn(matter: Matter, userId: string): boolean {
  if (matter.intent !== "act" || matter.status !== "open") return false;
  const hop = matter.path.findLast((candidate) => candidate.state !== "passed_on");
  return hop?.userId === userId && WAITING.has(hop.state);
}

/** The path after this person opened the matter: their hop moves from sent to seen, and nothing else changes. */
export function seenBy(path: readonly Hop[], userId: string): Hop[] {
  return path.map((hop) => (hop.userId === userId && hop.state === "sent" ? { ...hop, state: "seen" } : hop));
}
