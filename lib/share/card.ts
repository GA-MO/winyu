import { z } from "zod";
import { COMPONENT_NAMES, type ComposedComponent, type ComposedSurface } from "@/lib/compose/catalog";
import { headingWithoutNumbers } from "@/lib/compose/composer";
import { UNCOMPOSABLE_TOOLS } from "@/lib/compose/ground";
import { forecastTitle, metricTitle } from "@/lib/cards/tool-answers";
import { TH } from "@/lib/i18n/th";
import { grantDaysSchema, type GrantRefusalCode } from "@/lib/contracts/grant";
import type { MetricId } from "@/lib/contracts/semantic";
import type { Persona } from "@/lib/contracts/persona";

export const SHARE_CHANNELS = ["email", "teams", "line"] as const;

/** Where a share is delivered: email always works (the demo outbox); Teams and LINE need the recipient's linked account. */
export type ShareChannel = (typeof SHARE_CHANNELS)[number];

export const SHARE_RECIPIENTS_MAX = 10;
export const SHARE_NOTE_MAX = 300;
const READS_MAX = 12;
const COMPONENTS_MAX = 80;
const DOCUMENTS_TOOL = "search_documents";
const CHANNEL_PREFERENCE: readonly ShareChannel[] = ["teams", "line", "email"];

/** Reads that cannot be shared: the person's own memory, and the metric catalog the model browses on the way to an answer. */
export const UNSHAREABLE_TOOLS: ReadonlySet<string> = new Set(["recall_memory", "list_metrics"]);

/** One read behind a shared card: the tool and the exact input it was called with. Never its result. */
export type SharedRead = { tool: string; input: Record<string, unknown> };

/** What a share stores instead of numbers: the reads that drew the card, and for a composed card the checked block that arranged them. Opening the share re-runs the reads as the viewer. */
export type SharedCard = { kind: "tool"; reads: SharedRead[] } | { kind: "composed"; reads: SharedRead[]; components: ComposedComponent[] };

/** One channel the sheet offers for a person: `ready` false means Teams is linked but the person never wrote to the bot, so the share goes by email. */
export type ChannelOption = { channel: ShareChannel; ready: boolean };

/** A colleague the share sheet lists, with their English name and the channels that reach them. */
export type ShareContact = Persona & { name: string; channels: ChannelOption[] };

/** A card someone is about to share: the reads behind it and the question that drew it. */
export type ShareTarget = { card: SharedCard; question: string | null };

/** Why one recipient got the share on another channel than the one picked. */
export type FallbackReason = "no-teams-conversation" | "send-failed";

/** How one recipient was reached, as the sheet and the account sheet show it. */
export type ShareReceipt = { userId: string; name: string; asked: ShareChannel; via: ShareChannel; fallback: FallbackReason | null };

/** One recipient's temporary grant at share time, as the sheet reports it: given, or refused with its code. */
export type ShareGrantReceipt = { userId: string; name: string; metric: MetricId; granted: boolean; refusal: GrantRefusalCode | null };

/** A live grant the sender gave on a share, as Shared lists it with its revoke. */
export type GivenGrant = { id: string; recipientName: string; slice: string; until: string };

/** A share the person sent, as Shared lists it: who got it on which channel, how often they opened it, and the grants still live on it. */
export type SentShare = { code: string; path: string; title: string; at: string; receipts: ShareReceipt[]; opened: number; recipients: number; grants: GivenGrant[] };

/** A share sent to the person, as Shared lists it: who sent it with what note, what it hides from them, and their pending request or live grant. */
export type ReceivedShare = {
  code: string;
  path: string;
  title: string;
  at: string;
  senderName: string;
  note: string | null;
  hidden: string | null;
  request: { approverName: string } | null;
  grant: { grantorName: string; until: string } | null;
  unread: boolean;
};

/** One read call of an exchange as the chat knows it. */
export type ExchangeRead = { toolCallId: string; tool: string; args: unknown; returned: boolean };

const readSchema = z.object({ tool: z.string().min(1).max(80), input: z.record(z.string(), z.unknown()) });
const componentSchema = z.looseObject({ id: z.string().min(1), component: z.enum(COMPONENT_NAMES) });

/** A share as the browser asks for it; parsed at the route, trusted after. */
export const shareRequestSchema = z.object({
  card: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("tool"), reads: z.array(readSchema).min(1).max(READS_MAX) }),
    z.object({ kind: z.literal("composed"), reads: z.array(readSchema).min(1).max(READS_MAX), components: z.array(componentSchema).min(2).max(COMPONENTS_MAX) }),
  ]),
  question: z.string().max(500).nullable(),
  note: z.string().max(SHARE_NOTE_MAX),
  recipients: z.array(z.object({ userId: z.string().min(1), channel: z.enum(SHARE_CHANNELS) })).min(1).max(SHARE_RECIPIENTS_MAX),
  grantDays: grantDaysSchema.nullable().optional(),
});

export type ShareRequest = z.infer<typeof shareRequestSchema>;

/** What the chat agent passes to share the card on screen: who it goes to (names as the person typed them, or user ids), the channel when the person named one, and a note. */
export const shareCardInputSchema = z.object({
  to: z.array(z.string().min(1).max(80)).min(1).max(SHARE_RECIPIENTS_MAX),
  channel: z.enum(SHARE_CHANNELS).optional(),
  note: z.string().max(SHARE_NOTE_MAX).optional(),
});

export type ShareCardInput = z.infer<typeof shareCardInputSchema>;

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

/** The share behind one fixed card: its own call, or every documents search of the exchange, since the chat draws those as one card. */
export function sharedToolCard(calls: readonly ExchangeRead[], toolCallId: string): SharedCard | null {
  const call = calls.find((candidate) => candidate.toolCallId === toolCallId);
  if (!call) return null;
  if (call.tool !== DOCUMENTS_TOOL) return { kind: "tool", reads: [readOf(call)] };
  return { kind: "tool", reads: calls.filter((candidate) => candidate.tool === DOCUMENTS_TOOL && candidate.returned).map(readOf) };
}

/** The share behind a composed card: every composable read that returned, in call order (the order names the card's data paths), and the components that held. */
export function sharedComposedCard(calls: readonly ExchangeRead[], surface: ComposedSurface): SharedCard | null {
  const reads = calls.filter((call) => call.returned && !UNCOMPOSABLE_TOOLS.includes(call.tool)).map(readOf);
  if (reads.length === 0 || surface.components.length === 0) return null;
  return { kind: "composed", reads, components: surface.components };
}

function rootTitle(card: SharedCard): string | null {
  if (card.kind !== "composed") return null;
  const title = card.components[0]?.title;
  return typeof title === "string" ? headingWithoutNumbers(title) : null;
}

/** The card's name as the message shows it, from what was asked and never from what came back: the metric's name, the composed card's heading without numbers, or the tool's kind of card. */
export function shareTitle(card: SharedCard): string {
  const composed = rootTitle(card);
  if (composed) return composed;
  const [first] = card.reads;
  if (first.tool === "query_metric") return metricTitle(null, first.input);
  if (first.tool === "get_forecast") return forecastTitle(null, first.input);
  if (first.tool === "get_alerts") return TH.cards.alertsTitle;
  return TH.share.titles[first.tool] ?? TH.share.defaultTitle;
}
