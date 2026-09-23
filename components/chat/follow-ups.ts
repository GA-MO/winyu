import type { QuickAction } from "@/lib/contracts";

const QUERY_TOOL_PART = "tool-query_metric";
const MAX_CHIPS = 3;

type PartLike = { type?: string; output?: unknown };
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

/** What the chip row shows: questions that follow from the latest card first, then the user's learned chips. */
export function chipRow(followUps: readonly QuickAction[], learned: readonly QuickAction[], limit = MAX_CHIPS): QuickAction[] {
  const prompts = new Set(followUps.map((action) => action.prompt));
  return [...followUps, ...learned.filter((action) => !prompts.has(action.prompt))].slice(0, limit);
}
