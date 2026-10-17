import { z } from "zod";
import { COMPONENT_NAMES, type ComposedComponent, type ComposedSurface } from "@/lib/compose/catalog";
import { headingWithoutNumbers } from "@/lib/compose/composer";
import { UNCOMPOSABLE_TOOLS } from "@/lib/compose/ground";
import { forecastTitle, gapTitle, metricTitle } from "@/lib/cards/tool-answers";
import { TH } from "@/lib/i18n/th";
import { grantDaysSchema, type GrantRefusalCode } from "@/lib/contracts/grant";
import type { DimValues, MetricId } from "@/lib/contracts/semantic";
import type { Persona } from "@/lib/contracts/persona";
import { MATTER_INTENTS, MATTER_URGENCIES } from "./matter";
import type { CardHero } from "@/lib/cards/present";
import type { CardFigures, RowFigure } from "./figures";
import type { MatterSuggestions } from "./matter-actions";

export const SHARE_CHANNELS = ["email", "teams", "line"] as const;

/** Where a share is delivered: email always works (the demo outbox); Teams and LINE need the recipient's linked account. */
export type ShareChannel = (typeof SHARE_CHANNELS)[number];

export const DELIVERY_CHANNELS = ["winyu", ...SHARE_CHANNELS] as const;

/** How a matter reaches someone: inside Winyu only (the bell and Shared), or also on an outside channel. */
export type DeliveryChannel = (typeof DELIVERY_CHANNELS)[number];

export const SHARE_RECIPIENTS_MAX = 10;
export const SHARE_NOTE_MAX = 300;
/** One line: the ask a matter carries, drafted from the card and edited by the sender. */
export const MATTER_ASK_MAX = SHARE_NOTE_MAX;
const READS_MAX = 12;
const ALERTS_MAX = 10;
const COMPONENTS_MAX = 80;
const CHANNEL_PREFERENCE: readonly ShareChannel[] = ["teams", "line", "email"];
const CARD_REF_MAX = 40;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const CARD_REF_PREFIX = "c";
const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;
const BASE36 = 36;
const SUBJECT_PART_SEPARATOR = " · ";
const SUBJECT_VALUE_SEPARATOR = ", ";

/** Reads that cannot be shared: the person's own memory, the metric catalog the model browses on the way to an answer, the lookups that find a person, an owner or a master-data record, and people data (profiles, candidates, training, the inbox, the audit). */
export const UNSHAREABLE_TOOLS: ReadonlySet<string> = new Set([
  "recall_memory",
  "list_metrics",
  "describe_entity",
  "find_people",
  "get_person",
  "resolve_owner",
  "list_candidates",
  "training_history",
  "inbox",
  "admin_audit",
]);

/** One read behind a shared card: the tool and the exact input it was called with. Never its result. */
export type SharedRead = { tool: string; input: Record<string, unknown> };

/** What a share stores instead of numbers: the reads that drew the card, and for a composed card the checked block that arranged them. Opening the share re-runs the reads as the viewer. */
export type SharedCard = { kind: "tool"; reads: SharedRead[] } | { kind: "composed"; reads: SharedRead[]; components: ComposedComponent[] };

/** One channel the sheet offers for a person: `ready` false means Teams is linked but the person never wrote to the bot, so the share goes by email. */
export type ChannelOption = { channel: ShareChannel; ready: boolean };

/** A colleague the share sheet lists, with their English name and the channels that reach them. */
export type ShareContact = Persona & { name: string; channels: ChannelOption[] };

/** A card someone is about to share: the reads behind it and the question that drew it. */
export type ShareTarget = { card: SharedCard; question: string | null; draftAsk?: string };

/** A card the conversation drew that may be sent, as the model and the send sheet name it: `ref` comes from what the card is (its reads and layout), so the server and the browser give the same card the same ref; `hero` is its headline figure when it has one. */
export type CardOnScreen = { ref: string; exchangeId: string; target: ShareTarget; title: string; hero: string | null };

/** The sendable cards of a conversation up to the exchange a send was asked in (`exchangeId`), oldest first, whether an earlier exchange held a send back because its words contradicted its card, and what the person typed there and in the exchange before, newest first (a send confirmed after a hold-back still knows whom the person named), and whether an earlier send was pointed at another card that shows what the person named. */
export type ScreenCards = { exchangeId: string | null; cards: CardOnScreen[]; warned: boolean; said: string[]; redirected: boolean };

/** The send_card refusal code for a card that shows none of the rows the person named while another card on screen does, given once. */
export const CARD_MISSES_SUBJECT = "CARD_MISSES_SUBJECT";

/** The send_card refusal code for an ask the card's numbers contradict, given once before the person has seen the figure. */
export const ASK_CONTRADICTS_CARD = "ASK_CONTRADICTS_CARD";

/** The rows of a card the sender's words single out ("ขอนแก่นมหาชัย" on the region's agents card): their labels, the figure the card draws for them (as words, and as the hero with its coloured change), the one row's own change, and the line code writes when the words that named one row claim what that row does not show. */
export type CardFocus = { labels: string[]; hero: string | null; figure?: CardHero | null; row?: RowFigure | null; claim: string | null };

/** What a send shows before it leaves, worked out by the server: the matter's title with what the card is about, whom to put first, what the card's numbers say for the sender (to check the ask against), the goal that would close the matter, the rows the sender's words single out, and the card's own subject (what a pointing ask names when they single out none). */
export type SendPreview = MatterSuggestions & { title: string | null; figures: CardFigures | null; goal: string | null; focus?: CardFocus | null; subject?: string | null };

/** Why one recipient got the share on another channel than the one picked. */
export type FallbackReason = "no-teams-conversation" | "send-failed";

/** How one recipient was reached, as the sheet and the account sheet show it. */
export type ShareReceipt = { userId: string; name: string; asked: DeliveryChannel; via: DeliveryChannel; fallback: FallbackReason | null };

/** One recipient's temporary grant at share time, as the sheet reports it: given, or refused with its code. */
export type ShareGrantReceipt = { userId: string; name: string; metric: MetricId; granted: boolean; refusal: GrantRefusalCode | null };

/** A live grant the sender gave on a share, as Shared lists it with its revoke. */
export type GivenGrant = { id: string; recipientName: string; slice: string; until: string };

/** Someone on the other side of a share: the sender of a received one, a recipient of a sent one. */
export type SharePerson = { id: string; name: string; photo: string | null };

/** Where a received share stands for its reader: a live grant, a pending request, a declined one, a part hidden by name, or nothing hidden. */
export type ReceivedState =
  | { kind: "granted"; until: string }
  | { kind: "pending"; approverName: string }
  | { kind: "declined" }
  | { kind: "hidden"; slice: string }
  | { kind: "full" };

/** Where a sent share stands for its sender: someone asks for more, or how many recipients opened it. */
export type SentState = { kind: "asked"; requesterName: string } | { kind: "delivered"; opened: number; recipients: number };

/** One share as Shared lists it: the card, the other side, when it was sent, when it last moved (a request, grant, decision or opening), its state, whether anything about it is unread, and the live grants the viewer gave on it. */
export type ShareLine<S extends ReceivedState | SentState> = { code: string; path: string; title: string; people: SharePerson[]; sentAt: string; activityAt: string; state: S; unread: boolean; grants: GivenGrant[] };

export type ReceivedLine = ShareLine<ReceivedState>;
export type SentLine = ShareLine<SentState>;

/** One read call of an exchange as the chat knows it. */
export type ExchangeRead = { toolCallId: string; tool: string; args: unknown; returned: boolean };

const readSchema = z.object({ tool: z.string().min(1).max(80), input: z.record(z.string(), z.unknown()) });
const componentSchema = z.looseObject({ id: z.string().min(1), component: z.enum(COMPONENT_NAMES) });

/** The card the browser sends: its reads, and for a composed card the components that held. */
export const sharedCardSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("tool"), reads: z.array(readSchema).min(1).max(READS_MAX) }),
  z.object({ kind: z.literal("composed"), reads: z.array(readSchema).min(1).max(READS_MAX), components: z.array(componentSchema).min(2).max(COMPONENTS_MAX) }),
]);

/** A matter as the browser asks for it; parsed at the route, trusted after. One that asks for an answer goes to one person with an ask. */
export const shareRequestSchema = z.object({
  card: sharedCardSchema,
  question: z.string().max(500).nullable(),
  ask: z.string().max(MATTER_ASK_MAX),
  intent: z.enum(MATTER_INTENTS),
  urgency: z.enum(MATTER_URGENCIES).optional(),
  due: z.string().regex(ISO_DAY).nullable().optional(),
  recipients: z.array(z.object({ userId: z.string().min(1), channel: z.enum(DELIVERY_CHANNELS) })).min(1).max(SHARE_RECIPIENTS_MAX),
  grantDays: grantDaysSchema.nullable().optional(),
  alertIds: z.array(z.string().min(1).max(120)).max(ALERTS_MAX).optional(),
  closeOnGoal: z.boolean().optional(),
}).refine((request) => request.intent === "fyi" || (request.recipients.length === 1 && request.ask.trim().length > 0), { message: "a matter that asks for an answer goes to one person with an ask" });

export type ShareRequest = z.infer<typeof shareRequestSchema>;

/** What the chat agent passes to send a card on screen as a matter: which card (`cardRef`, the ref the cards-on-screen list gives it; left out for the one card this reply drew), who it goes to (names as the person typed them, or user ids; none means the card's owner), the ask in the person's words, whether it waits on an answer, how soon (only from the person's words), and the card itself only when a pressed button carried it. */
export const sendCardInputSchema = z.object({
  cardRef: z.string().min(1).max(CARD_REF_MAX).optional(),
  to: z.array(z.string().min(1).max(80)).max(SHARE_RECIPIENTS_MAX).optional(),
  ask: z.string().max(MATTER_ASK_MAX).optional(),
  intent: z.enum(MATTER_INTENTS).optional(),
  urgency: z.enum(MATTER_URGENCIES).optional(),
  card: z.object({ reads: z.array(readSchema).min(1).max(READS_MAX), alertIds: z.array(z.string().min(1).max(120)).max(ALERTS_MAX).optional() }).optional(),
});

export type SendCardInput = z.infer<typeof sendCardInputSchema>;

/** The channel a share goes by when nobody picked one: Teams once the person writes to the bot there, then LINE, then email. */
export function preferredChannel(options: readonly ChannelOption[]): ShareChannel {
  return CHANNEL_PREFERENCE.find((channel) => options.some((option) => option.channel === channel && option.ready)) ?? "email";
}

/** The channel a share will actually go by: the one asked for when it reaches the person now, email when it does not, and the preferred one when none was asked. */
export function channelFor(options: readonly ChannelOption[], asked: ShareChannel | null): ShareChannel {
  if (!asked) return preferredChannel(options);
  return options.some((option) => option.channel === asked && option.ready) ? asked : "email";
}

function inputOf(args: unknown): Record<string, unknown> {
  return typeof args === "object" && args !== null && !Array.isArray(args) ? (args as Record<string, unknown>) : {};
}

function readOf(call: ExchangeRead): SharedRead {
  return { tool: call.tool, input: inputOf(call.args) };
}

/** The share behind one fixed card: its own call and the calls a paired card draws with it, or null when the server refuses to share that tool. */
export function sharedToolCard(calls: readonly ExchangeRead[], toolCallId: string, partners: readonly string[] = []): SharedCard | null {
  const call = calls.find((candidate) => candidate.toolCallId === toolCallId);
  if (!call || UNSHAREABLE_TOOLS.has(call.tool)) return null;
  const paired = calls.filter((candidate) => partners.includes(candidate.toolCallId) && !UNSHAREABLE_TOOLS.has(candidate.tool));
  return { kind: "tool", reads: [call, ...paired].map(readOf) };
}

/** The share behind a composed card: every composable, shareable read that returned, in call order (the order names the card's data paths), and the components that held; null when no shareable read remains. */
export function sharedComposedCard(calls: readonly ExchangeRead[], surface: ComposedSurface): SharedCard | null {
  const reads = calls.filter((call) => call.returned && !UNCOMPOSABLE_TOOLS.includes(call.tool) && !UNSHAREABLE_TOOLS.has(call.tool)).map(readOf);
  if (reads.length === 0 || surface.components.length === 0) return null;
  return { kind: "composed", reads, components: surface.components };
}

function rootTitle(card: SharedCard): string | null {
  if (card.kind !== "composed") return null;
  const title = card.components[0]?.title;
  return typeof title === "string" ? headingWithoutNumbers(title) : null;
}

function askedDims(read: SharedRead): string[] {
  const dims = read.input.dims;
  return Array.isArray(dims) ? dims.filter((dim): dim is string => typeof dim === "string") : [];
}

/** What a card is about, in Thai: the names of the filters its read asked for (the first read unless `read` names the one the send is about: "ภาคอีสาน · ลีโอ"), except a dimension whose several values the card's rows name one by one; null when it asked for none. */
export function shareSubject(card: SharedCard, names: DimValues, read: SharedRead = card.reads[0]): string | null {
  const dims = askedDims(read);
  const parts = Object.entries(names)
    .filter(([dim, labels]) => labels && labels.length > 0 && !(dims.includes(dim) && labels.length > 1))
    .map(([, labels]) => (labels ?? []).join(SUBJECT_VALUE_SEPARATOR));
  return parts.length > 0 ? parts.join(SUBJECT_PART_SEPARATOR) : null;
}

function breakdownOnly(read: SharedRead, names: DimValues): Record<string, unknown> {
  const pinned = (Object.entries(names) as [string, string[] | undefined][]).filter(([, labels]) => labels?.length === 1).map(([dim]) => dim);
  return { ...read.input, dims: askedDims(read).filter((dim) => !pinned.includes(dim)) };
}

function baseTitle(read: SharedRead, names: DimValues): string {
  if (read.tool === "query_metric") return metricTitle(null, breakdownOnly(read, names));
  if (read.tool === "get_forecast") return forecastTitle(null, read.input);
  if (read.tool === "explain_gap") return gapTitle(read.input);
  if (read.tool === "get_alerts") return TH.cards.alertsTitle;
  return TH.share.titles[read.tool] ?? TH.share.defaultTitle;
}

/** The card's name as the message shows it, from what was asked and never from what came back: the metric's name with what it is about (`names`, the Thai names of the filters `read` asked for, which the server looks up; `read` is the first unless the send is about another of the card's reads), the composed card's heading without numbers, or the tool's kind of card. */
export function shareTitle(card: SharedCard, names: DimValues = {}, read: SharedRead = card.reads[0]): string {
  const composed = rootTitle(card);
  if (composed) return composed;
  const base = baseTitle(read, names);
  const subject = read.tool === "get_alerts" ? null : shareSubject(card, names, read);
  return subject ? `${base}${SUBJECT_PART_SEPARATOR}${subject}` : base;
}

/** A title or subject with the rows the sender singled out added once, after what it already names ("… · ภาคอีสาน · ขอนแก่นมหาชัย"); unchanged when it names them already. */
export function withFocus(text: string, focus: readonly string[]): string {
  const added = focus.filter((label) => !text.includes(label));
  if (added.length === 0) return text;
  const named = added.join(SUBJECT_VALUE_SEPARATOR);
  return text ? `${text}${SUBJECT_PART_SEPARATOR}${named}` : named;
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (typeof value !== "object" || value === null) return value;
  const entries = Object.entries(value).filter(([, entry]) => entry !== undefined && entry !== null);
  return Object.fromEntries(entries.sort(([left], [right]) => left.localeCompare(right)).map(([key, entry]) => [key, canonical(entry)]));
}

function fnv1a(text: string): number {
  let hash = FNV_OFFSET;
  for (let index = 0; index < text.length; index += 1) hash = Math.imul(hash ^ text.charCodeAt(index), FNV_PRIME) >>> 0;
  return hash;
}

/** Whether two tool inputs ask the same thing, keys in any order and empty arguments dropped. */
export function sameInput(left: unknown, right: unknown): boolean {
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}

/** The short ref a card goes by in the cards-on-screen list: a hash of its reads and layout with keys sorted and empty arguments dropped, so the same card has the same ref wherever it is worked out. */
export function cardRefOf(card: SharedCard): string {
  return `${CARD_REF_PREFIX}${fnv1a(JSON.stringify(canonical(card))).toString(BASE36)}`;
}
