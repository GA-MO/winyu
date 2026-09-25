import type { QuickAction } from "@/lib/contracts";

const QUERY_TOOL_PART = "tool-query_metric";
const MAX_CHIPS = 3;

const INTENT_SEPARATOR = "|";

type PartLike = { type?: string; input?: unknown; output?: unknown };
type MessageLike = { role?: string; parts?: PartLike[] };

function isQuickAction(value: unknown): value is QuickAction {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<QuickAction>;
  return typeof candidate.id === "string" && typeof candidate.label === "string" && typeof candidate.prompt === "string" && typeof candidate.intentKey === "string";
}

function followUpsOfPart(part: PartLike): QuickAction[] {
  if (part.type !== QUERY_TOOL_PART || typeof part.output !== "object" || part.output === null) return [];
  const followUps = (part.output as { followUps?: unknown }).followUps;
  return Array.isArray(followUps) ? followUps.filter(isQuickAction) : [];
}

/** The follow-ups of the newest card in the latest answer; empty until an answer that queried a metric has arrived. */
export function latestFollowUps(messages: readonly MessageLike[]): QuickAction[] {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index] as MessageLike;
    if (message.role === "user") return [];
    const parts = message.parts ?? [];
    for (let partIndex = parts.length - 1; partIndex >= 0; partIndex -= 1) {
      const found = followUpsOfPart(parts[partIndex] as PartLike);
      if (found.length > 0) return found;
    }
  }
  return [];
}

function metricOfPart(part: PartLike): string | null {
  if (part.type !== QUERY_TOOL_PART || typeof part.input !== "object" || part.input === null) return null;
  const metric = (part.input as { metric?: unknown }).metric;
  return typeof metric === "string" ? metric : null;
}

/** The metrics the latest answer read; a learned chip on one of them would ask again what the card just showed. */
export function answeredMetrics(messages: readonly MessageLike[]): Set<string> {
  const last = messages[messages.length - 1] as MessageLike | undefined;
  if (!last || last.role === "user") return new Set();
  return new Set((last.parts ?? []).map((part) => metricOfPart(part as PartLike)).filter((metric): metric is string => metric !== null));
}

/** What the chip row shows: questions that follow from the latest card first, then the user's learned chips that do not repeat the question just answered. */
export function chipRow(followUps: readonly QuickAction[], learned: readonly QuickAction[], limit = MAX_CHIPS, answered: ReadonlySet<string> = new Set()): QuickAction[] {
  const prompts = new Set(followUps.map((action) => action.prompt));
  const fresh = learned.filter((action) => !prompts.has(action.prompt) && !answered.has(action.intentKey.split(INTENT_SEPARATOR)[0]));
  return [...followUps, ...fresh].slice(0, limit);
}
