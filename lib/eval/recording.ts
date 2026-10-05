import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { ComposedComponent } from "@/lib/compose/catalog";
import { UNCOMPOSABLE_TOOLS } from "@/lib/compose/ground";
import type { ToolStep } from "@/components/chat/timeline";
import { cardPlanOf, isEmptyAnswer } from "@/components/chat/tool-view";
import { ReplyCards, type ComposedCardRecord, type StreamEvent } from "@/lib/harness/adapters/mastra/card-stream";
import { toolTiers } from "@/lib/server/agent/tools";

/** Where recorded cases live: one committed JSON file per case, the fixtures every scorer reads. */
export const RECORDINGS_DIR = path.join(process.cwd(), "evals", "recordings");

const RECORDING_VERSION = 1;
const READ_TIER = "read";

/** One step of the reply in the order the model wrote it: a text part (card block included, as Mastra memory stored it) or a tool call with its arguments and, once it returned, its result. A write call that paused for approval has no result. */
export type RecordedStep = { kind: "text"; text: string } | { kind: "call"; tool: string; args: unknown; result?: unknown };

/** What one case cost when it was recorded, as the usage meter counted it. */
export type RecordedUsage = { calls: number; inputTokens: number; outputTokens: number; reasoningTokens: number; usd: number };

/** What the person saw when the case was recorded: the fixed cards by tool, and the composed card's verdict and components. Kept for reading a diff; scorers derive both again from the steps. */
export type RecordedDrawing = { cards: string[]; composed: { accepted: number; rejected: number; problems: string[]; components: ComposedComponent[] } | null };

/** Everything needed to score one case without the model: who asked what, the model's reply as steps, the approvals it raised, what it cost (earlier questions included), the earlier questions and the trusted facts memory held when the case was asked, and the fingerprints that tell when the prompt or the tools have changed since. */
export type Recording = {
  version: typeof RECORDING_VERSION;
  caseId: string;
  userId: string;
  prompt: string;
  model: string;
  promptHash: string;
  toolsHash: string;
  today: string;
  recordedAt: string;
  steps: RecordedStep[];
  asked: string[];
  error: string | null;
  usage: RecordedUsage;
  drawn: RecordedDrawing;
  before?: RecordedBefore[];
  remembered?: string[];
};

/** A question the same person asked earlier in its own thread, and the reply it got, recorded before the case question. */
export type RecordedBefore = { prompt: string; steps: RecordedStep[] };

/** A fixed card the chat draws for one read call. */
export type DrawnCard = { tool: string; args: unknown; result: unknown };

/** One recorded reply as the chat would draw it now: the words the person reads, the composed card the current composer accepts from the recorded block, and the fixed cards left beside it. */
export type EvalTurn = {
  recording: Recording;
  calls: Extract<RecordedStep, { kind: "call" }>[];
  words: string;
  composed: (ComposedCardRecord & { components: ComposedComponent[]; dataModel: Record<string, unknown> }) | null;
  cards: DrawnCard[];
};

type Snapshot = { components?: ComposedComponent[]; dataModel?: Record<string, unknown> };

/** The recording's file path for one case id. */
export function recordingPath(caseId: string): string {
  return path.join(RECORDINGS_DIR, `${caseId}.json`);
}

/** Every committed recording by case id. */
export function readRecordings(): Map<string, Recording> {
  if (!existsSync(RECORDINGS_DIR)) return new Map();
  const files = readdirSync(RECORDINGS_DIR).filter((file) => file.endsWith(".json"));
  return new Map(files.map((file) => {
    const recording = JSON.parse(readFileSync(path.join(RECORDINGS_DIR, file), "utf8")) as Recording;
    return [recording.caseId, recording];
  }));
}

/** Writes one recording as its committed fixture. */
export function writeRecording(recording: Recording): void {
  mkdirSync(RECORDINGS_DIR, { recursive: true });
  writeFileSync(recordingPath(recording.caseId), `${JSON.stringify(recording, null, 1)}\n`);
}

function textEvents(messageId: string, text: string): StreamEvent[] {
  return [{ type: "TEXT_MESSAGE_CONTENT", messageId, delta: text }, { type: "TEXT_MESSAGE_END", messageId }];
}

function callEvents(toolCallId: string, step: Extract<RecordedStep, { kind: "call" }>): StreamEvent[] {
  const start: StreamEvent = { type: "TOOL_CALL_START", toolCallId, toolCallName: step.tool };
  return "result" in step ? [start, { type: "TOOL_CALL_RESULT", toolCallId, content: step.result }] : [start];
}

function eventsOf(steps: readonly RecordedStep[]): StreamEvent[] {
  return [{ type: "RUN_STARTED" }, ...steps.flatMap((step, index) => (step.kind === "text" ? textEvents(`text-${index}`, step.text) : callEvents(`call-${index}`, step))), { type: "RUN_FINISHED" }];
}

function toolStepOf(call: EvalTurn["calls"][number], index: number): ToolStep {
  return { kind: "tool", toolCallId: `call-${index}`, name: call.tool, args: call.args, outcome: "result" in call ? { state: "returned", result: call.result } : { state: "pending" } };
}

function fixedCards(calls: EvalTurn["calls"], composedHolds: boolean): DrawnCard[] {
  const tiers = toolTiers();
  const readTools = new Set(Object.keys(tiers).filter((tool) => tiers[tool] === READ_TIER));
  const steps = calls.map(toolStepOf);
  const composed = new Set(composedHolds ? steps.flatMap((step) => (UNCOMPOSABLE_TOOLS.includes(step.name) ? [] : [step.toolCallId])) : []);
  const plan = cardPlanOf(steps, composed, readTools);
  return steps.flatMap((step) => {
    if (step.outcome.state !== "returned" || !readTools.has(step.name) || plan.hidden.has(step.toolCallId)) return [];
    const result = plan.results.has(step.toolCallId) ? plan.results.get(step.toolCallId) : step.outcome.result;
    if (isEmptyAnswer(result)) return [];
    return [{ tool: step.name, args: step.args, result }];
  });
}

/** Replays a recording through the same card stream the live chat and history restore use, so a scorer sees what the current code would draw from the recorded model output. */
export function turnOf(recording: Recording): EvalTurn {
  const tiers = toolTiers();
  const records: ComposedCardRecord[] = [];
  const reader = new ReplyCards((tool) => tiers[tool] === READ_TIER, (record) => records.push(record));
  const out = eventsOf(recording.steps).flatMap((event) => reader.next(event));
  const words = out.flatMap((event) => (event.type === "TEXT_MESSAGE_CONTENT" && typeof event.delta === "string" ? [event.delta] : [])).join("");
  const finals = out.filter((event) => event.type === "ACTIVITY_SNAPSHOT").map((event) => event.content as Snapshot);
  const last = finals.at(-1);
  const record = records.at(-1);
  const components = last?.components ?? [];
  const composed = record ? { ...record, components, dataModel: last?.dataModel ?? {} } : null;
  const calls = recording.steps.filter((step): step is EvalTurn["calls"][number] => step.kind === "call");
  return { recording, calls, words, composed, cards: fixedCards(calls, components.length > 0) };
}

/** What a turn draws, in the compact form a recording keeps for its reader. */
export function drawingOf(turn: EvalTurn): RecordedDrawing {
  const composed = turn.composed ? { accepted: turn.composed.accepted, rejected: turn.composed.rejected, problems: turn.composed.problems, components: turn.composed.components } : null;
  return { cards: turn.cards.map((card) => card.tool), composed };
}
