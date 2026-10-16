import { isPressed } from "@/components/chat/pressed";
import type { DeliveryChannel, FallbackReason, SharedCard } from "./card";

export const MATTER_INTENTS = ["act", "fyi"] as const;
export const MATTER_URGENCIES = ["now", "today", "this_week"] as const;

/** act: the holder must answer; fyi: for information only. */
export type MatterIntent = (typeof MATTER_INTENTS)[number];
export type MatterUrgency = (typeof MATTER_URGENCIES)[number];

const URGENCY_OF_INTENT: Record<MatterIntent, MatterUrgency> = { act: "today", fyi: "this_week" };
const URGENT_WORDS = /ด่วน|urgent|asap/i;

/** How soon a matter is due when the sender did not choose: today for one that waits on an answer, this week for one sent to look at. */
export function defaultUrgency(intent: MatterIntent): MatterUrgency {
  return URGENCY_OF_INTENT[intent];
}

/** Whether a matter sent from chat waits on an answer: as asked (an answer by default), except that one waiting on an answer goes to one person, so a send to several people is for them to look at. */
export function sendIntent(asked: MatterIntent | undefined, recipients: number): MatterIntent {
  return recipients > 1 ? "fyi" : (asked ?? "act");
}

/** Whether the person's own words ask for it urgently (ด่วน, urgent, asap). */
export function saysUrgent(text: string): boolean {
  return URGENT_WORDS.test(text);
}

/** The urgency a matter sent from chat goes out with: "now" only when the person's own words say urgent, what a pressed button carried when they pressed one, a calmer one the model passed, and the intent's default otherwise; the model never makes a matter urgent by itself. */
export function matterUrgency(asked: MatterUrgency | undefined, question: string | null, intent: MatterIntent): MatterUrgency {
  if (question && isPressed(question)) return asked ?? defaultUrgency(intent);
  if (question && saysUrgent(question)) return "now";
  return asked && asked !== "now" ? asked : defaultUrgency(intent);
}
export type MatterStatus = "open" | "done" | "dropped";

export const VERDICTS = ["real", "noise"] as const;

/** What closing a matter about an alert says the alert was: a real problem, or noise. */
export type Verdict = (typeof VERDICTS)[number];
export type HopState = "sent" | "seen" | "accepted" | "asked" | "passed_on";

/** One person a matter reached, who passed it to them (null when Winyu did), when, and where they stand. */
export type Hop = { userId: string; fromUserId: string | null; at: string; state: HopState };

export const GOAL_MEASURES = ["attainment", "total"] as const;

/** What a goal reads off its query's result: attainment against target in percent, or the total of the value. */
export type GoalMeasure = (typeof GOAL_MEASURES)[number];

/** The number that closes a matter by itself: a read (its input as the card stored it, run again on the latest data day) whose measure reaches a line from below or from above. */
export type MatterGoal = { query: Record<string, unknown>; measure: GoalMeasure; line: number; reach: "at_least" | "at_most" };

export type MatterEventKind = "note" | "accepted" | "asked" | "passed_on" | "goal_met" | "done";

/** One line of a matter's thread: who did what when, the words they wrote, and for a pass-on whom it went to. */
export type MatterEvent = { userId: string | null; at: string; kind: MatterEventKind; text: string | null; toUserId: string | null };

/** How one recipient was reached: the channel the sender picked, the one that carried it, and why they differ. */
export type ShareDelivery = { userId: string; asked: DeliveryChannel; via: DeliveryChannel; fallback: FallbackReason | null };

/** A card sent to colleagues: the reads behind it (never their results) under its short code `id`, the one-line ask, whether it waits on an answer, the alerts it is about, the number that closes it, the people it went through, and which recipients opened it. */
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
  alertIds: string[];
  path: Hop[];
  thread: MatterEvent[];
  status: MatterStatus;
  card: SharedCard;
  deliveries: ShareDelivery[];
  openedBy?: string[];
  lastViewedAt: string | null;
};

type MatterFields = "ask" | "intent" | "urgency" | "goal" | "alertIds" | "path" | "thread" | "status" | "updatedAt";

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
    alertIds: stored.alertIds ?? [],
    path: stored.path ?? pathOf(stored),
    thread: stored.thread ?? [],
    status: stored.status ?? "open",
    updatedAt: stored.updatedAt ?? stored.at,
  };
}

/** The hop that holds the matter: the last one not passed on; null when every hop passed it on. */
export function holdingHop(matter: Pick<Matter, "path">): Hop | null {
  return matter.path.findLast((candidate) => candidate.state !== "passed_on") ?? null;
}

/** Whether an open matter that asks for an answer waits on this person: they hold it (the last hop not passed on) and have not answered yet. */
export function waitsOn(matter: Matter, userId: string): boolean {
  if (matter.intent !== "act" || matter.status !== "open") return false;
  const hop = holdingHop(matter);
  return hop?.userId === userId && WAITING.has(hop.state);
}

/** The path after this person opened the matter: their hop moves from sent to seen, and nothing else changes. */
export function seenBy(path: readonly Hop[], userId: string): Hop[] {
  return path.map((hop) => (hop.userId === userId && hop.state === "sent" ? { ...hop, state: "seen" } : hop));
}
