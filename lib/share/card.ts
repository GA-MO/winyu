import { z } from "zod";
import { COMPONENT_NAMES, type ComposedComponent, type ComposedSurface } from "@/lib/compose/catalog";
import { UNCOMPOSABLE_TOOLS } from "@/lib/compose/ground";

export const SHARE_CHANNELS = ["email", "teams", "line"] as const;

/** Where a share is delivered: email always works (the demo outbox); Teams and LINE need the recipient's linked account. */
export type ShareChannel = (typeof SHARE_CHANNELS)[number];

export const SHARE_RECIPIENTS_MAX = 10;
export const SHARE_NOTE_MAX = 300;
const READS_MAX = 12;
const COMPONENTS_MAX = 80;
const DOCUMENTS_TOOL = "search_documents";

/** One read behind a shared card: the tool and the exact input it was called with. Never its result. */
export type SharedRead = { tool: string; input: Record<string, unknown> };

/** What a share stores instead of numbers: the reads that drew the card, and for a composed card the checked block that arranged them. Opening the share re-runs the reads as the viewer. */
export type SharedCard = { kind: "tool"; reads: SharedRead[] } | { kind: "composed"; reads: SharedRead[]; components: ComposedComponent[] };

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
});

export type ShareRequest = z.infer<typeof shareRequestSchema>;

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
