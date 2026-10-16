import { isPressed } from "@/components/chat/pressed";
import { daysBetween } from "@/lib/data/dates";
import { TH } from "@/lib/i18n/th";
import type { DeliveryChannel, FallbackReason, SharedCard } from "./card";
import { writtenDeadline } from "./deadline";

export const MATTER_INTENTS = ["act", "fyi"] as const;
export const MATTER_URGENCIES = ["now", "today", "this_week"] as const;

/** act: the holder must answer; fyi: for information only. */
export type MatterIntent = (typeof MATTER_INTENTS)[number];
export type MatterUrgency = (typeof MATTER_URGENCIES)[number];

const URGENCY_OF_INTENT: Record<MatterIntent, MatterUrgency> = { act: "today", fyi: "this_week" };
const URGENT_WORDS = /ด่วน|urgent|asap/i;
const POINTING = /(?:เจ้า|ร้าน|เอเย่นต์|ราย|ตัว|อัน|เรื่อง|งาน|การ์ด|ที่|คน|ภาค|จังหวัด|แบรนด์|สินค้า|ยี่ห้อ|เคส|จุด|ส่วน|ตรง)\s*(?:นี้|นั้น|นี่|นั่น)/;
const SUBJECT_PARTS = / · |, /;
const SPACES = /\s+/g;
const WHEN_AND_POLITE_WORDS = new RegExp(
  [
    "ด่วนที่สุด", "ด่วนมาก", "ด่วน", "urgent", "asap", "ตอบกลับ", "กลับมา", "ตอบ", "ช่วย", "ให้", "ด้วย", "หน่อย", "เลย", "นะ", "ครับ", "ค่ะ", "คะ", "จ้า",
    "ภายใน", "ก่อน", "ไม่เกิน", "ให้ทัน", "เลิกงาน", "วันนี้", "เย็นนี้", "บ่ายนี้", "คืนนี้", "พรุ่งนี้", "มะรืน", "สัปดาห์", "อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "พฤหัส", "ศุกร์", "เสาร์", "วันที่", "วัน", "นี้", "หน้า",
    "[\\s\\d.,!?:;~-]",
  ].join("|"),
  "g",
);

/** How soon a matter is due when the sender did not choose: today for one that waits on an answer, this week for one sent to look at. */
export function defaultUrgency(intent: MatterIntent): MatterUrgency {
  return URGENCY_OF_INTENT[intent];
}

/** Whether a matter sent from chat waits on an answer: as asked (an answer by default), except that one waiting on an answer goes to one person, so a send to several people is for them to look at. */
export function sendIntent(asked: MatterIntent | undefined, recipients: number): MatterIntent {
  return recipients > 1 ? "fyi" : (asked ?? "act");
}

/** Whether an ask says what to do, once the words that only say how soon, ask for a reply or soften it are taken out ("ด่วน ให้ตอบกลับภายในวันนี้" says nothing). */
export function askSaysWhat(ask: string): boolean {
  return /[\p{L}]/u.test(ask.toLowerCase().replace(WHEN_AND_POLITE_WORDS, ""));
}

/** The ask a matter carries: the sender's words when they say what to do; one that waits on an answer and says nothing (empty, or only how soon) leads with the drafted ask that names the card, keeping the sender's words after it. */
export function matterAsk(typed: string, intent: MatterIntent, title: string): string {
  const ask = typed.trim();
  if (intent !== "act" || askSaysWhat(ask)) return ask;
  return ask ? `${TH.share.askDraft(title)} ${ask}` : TH.share.askDraft(title);
}

/** What a matter's ask is about, for naming it: the rows the sender singled out on the card (`singled`), else the card's own subject; null when there is nothing to name. */
export type AskAbout = { subject: string | null; singled: boolean };

function namesAny(ask: string, subject: string): boolean {
  const text = ask.replace(SPACES, "");
  return subject.split(SUBJECT_PARTS).some((part) => part.trim().length > 0 && text.includes(part.replace(SPACES, "")));
}

/** Where the first words that only point at a thing end ("เจ้านี้", "เรื่องนี้"; never "สัปดาห์นี้" or the นี้ inside "หนี้"); null when the ask points at nothing. */
function pointingEnd(ask: string): number | null {
  const match = POINTING.exec(ask);
  return match ? match.index + match[0].length : null;
}

/** The ask with what it is about named once, so whoever gets it knows which agent, brand or region it means: right after the first word that only points ("เข้าไปคุยกับเอเย่นต์เจ้านี้ (ขอนแก่นมหาชัย)"), or at the end when the sender singled out rows the ask leaves out; unchanged when it names them already or there is nothing to name. */
export function askNaming(ask: string, about: AskAbout): string {
  const { subject } = about;
  if (!ask || !subject || namesAny(ask, subject)) return ask;
  const named = TH.share.askAbout(subject);
  const at = pointingEnd(ask);
  if (at === null) return about.singled ? `${ask} ${named}` : ask;
  const rest = ask.slice(at).trimStart();
  return rest ? `${ask.slice(0, at)} ${named} ${rest}` : `${ask.slice(0, at)} ${named}`;
}

/** Whether the person's own words ask for it urgently (ด่วน, urgent, asap). */
export function saysUrgent(text: string): boolean {
  return URGENT_WORDS.test(text);
}

/** When a matter is due: how urgent it is, and the day it is due by when the sender named one (Bangkok, YYYY-MM-DD). */
export type MatterDeadline = { urgency: MatterUrgency; due: string | null };

function deadlineOfDay(today: string, due: string, urgent: boolean): MatterDeadline {
  if (urgent) return { urgency: "now", due };
  return { urgency: daysBetween(today, due) <= 0 ? "today" : "this_week", due };
}

/** When a matter sent from chat is due, from the person's own words counted from `today`: "now" only when they say urgent, the day they wrote (พรุ่งนี้, ภายในศุกร์นี้, ภายในวันที่ 20) with today's urgency only when that day is today, what a pressed button carried when they pressed one, a calmer urgency the model passed, and the intent's default otherwise; the model never makes a matter urgent by itself. */
export function matterDeadline(asked: MatterUrgency | undefined, question: string | null, intent: MatterIntent, today: string): MatterDeadline {
  if (question && isPressed(question)) return { urgency: asked ?? defaultUrgency(intent), due: null };
  const urgent = question !== null && saysUrgent(question);
  const written = question ? writtenDeadline(question, today) : null;
  if (written?.kind === "day") return deadlineOfDay(today, written.day, urgent);
  if (urgent) return { urgency: "now", due: null };
  if (written?.kind === "this_week") return { urgency: "this_week", due: null };
  return { urgency: asked && asked !== "now" ? asked : defaultUrgency(intent), due: null };
}
export type MatterStatus = "open" | "done" | "dropped";

export const VERDICTS = ["real", "noise"] as const;

/** What closing a matter about an alert says the alert was: a real problem, or noise. */
export type Verdict = (typeof VERDICTS)[number];
export type HopState = "sent" | "seen" | "accepted" | "asked" | "passed_on";

/** One person a matter reached, who passed it to them (null when Winyu did), when, and where they stand. */
export type Hop = { userId: string; fromUserId: string | null; at: string; state: HopState };

/** What closes a matter by itself: a card against target whose read (its input as the card stored it, run again on the latest data day) reaches a share of target, or the alert it is about found back within what was expected (the anomaly engine resolves it). */
export type MatterGoal = { kind: "attainment"; query: Record<string, unknown>; atLeast: number } | { kind: "alert"; alertId: string };

export type MatterEventKind = "note" | "accepted" | "asked" | "passed_on" | "goal_met" | "done";

/** One line of a matter's thread: who did what when, the words they wrote, and for a pass-on whom it went to. */
export type MatterEvent = { userId: string | null; at: string; kind: MatterEventKind; text: string | null; toUserId: string | null };

/** How one recipient was reached: the channel the sender picked, the one that carried it, and why they differ. */
export type ShareDelivery = { userId: string; asked: DeliveryChannel; via: DeliveryChannel; fallback: FallbackReason | null };

/** A card sent to colleagues: the reads behind it (never their results) under its short code `id`, the one-line ask, whether it waits on an answer, the alerts it is about, the number that closes it, the rows of the card the sender singled out (`focus`, "ขอนแก่นมหาชัย" on the region's card), the people it went through, and which recipients opened it. */
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
  due?: string | null;
  goal: MatterGoal | null;
  alertIds: string[];
  path: Hop[];
  thread: MatterEvent[];
  status: MatterStatus;
  card: SharedCard;
  focus?: string[];
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
    due: stored.due ?? null,
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
