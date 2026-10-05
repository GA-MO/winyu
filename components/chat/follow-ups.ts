import type { QuickAction } from "@/lib/contracts";
import type { Exchange, ToolStep } from "./timeline";

const QUERY_TOOL = "query_metric";
const INTENT_SEPARATOR = "|";
const ANSWER_CHIPS = 3;

function isQuickAction(value: unknown): value is QuickAction {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<QuickAction>;
  return typeof candidate.id === "string" && typeof candidate.label === "string" && typeof candidate.prompt === "string" && typeof candidate.intentKey === "string";
}

function queryStepsOf(exchange: Exchange | undefined): ToolStep[] {
  return (exchange?.steps ?? []).filter((step): step is ToolStep => step.kind === "tool" && step.name === QUERY_TOOL);
}

function followUpsOfStep(step: ToolStep): QuickAction[] {
  if (step.outcome.state !== "returned" || typeof step.outcome.result !== "object" || step.outcome.result === null) return [];
  const followUps = (step.outcome.result as { followUps?: unknown }).followUps;
  return Array.isArray(followUps) ? followUps.filter(isQuickAction) : [];
}

/** The follow-ups of the newest metric card in the latest answer; empty until an answer that queried a metric has arrived. */
export function latestFollowUps(exchanges: readonly Exchange[]): QuickAction[] {
  const steps = queryStepsOf(exchanges[exchanges.length - 1]);
  for (let index = steps.length - 1; index >= 0; index -= 1) {
    const found = followUpsOfStep(steps[index]);
    if (found.length > 0) return found;
  }
  return [];
}

/** The metrics the latest answer read; a learned chip on one of them would ask again what the card just showed. */
export function answeredMetrics(exchanges: readonly Exchange[]): Set<string> {
  return new Set(
    queryStepsOf(exchanges[exchanges.length - 1]).flatMap((step) => {
      const metric = typeof step.args === "object" && step.args !== null ? (step.args as { metric?: unknown }).metric : null;
      return typeof metric === "string" ? [metric] : [];
    }),
  );
}

/** What the chip row shows: questions that follow from the latest card first, then the user's learned chips that do not repeat the question just answered. */
export function chipRow(followUps: readonly QuickAction[], learned: readonly QuickAction[], limit = ANSWER_CHIPS, answered: ReadonlySet<string> = new Set()): QuickAction[] {
  const prompts = new Set(followUps.map((action) => action.prompt));
  const fresh = learned.filter((action) => !prompts.has(action.prompt) && !answered.has(action.intentKey.split(INTENT_SEPARATOR)[0]));
  return [...followUps, ...fresh].slice(0, limit);
}
