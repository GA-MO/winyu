import type { Exchange, ReplyStep } from "@/components/chat/timeline";
import { readRecordings, turnOf } from "@/lib/eval/recording";

const ENROLL_TOOL = "enroll_course";

function recordedExchange(caseId: string): Exchange | null {
  const recording = readRecordings().get(caseId);
  if (!recording) return null;
  const turn = turnOf(recording);
  const calls: ReplyStep[] = turn.calls.map((call, index) => ({
    kind: "tool",
    toolCallId: `${caseId}-call-${index}`,
    name: call.tool,
    args: call.args,
    outcome: "result" in call ? { state: "returned", result: call.result } : { state: "pending" },
  }));
  const words: ReplyStep[] = turn.words.trim() ? [{ kind: "text", id: `${caseId}-text`, text: turn.words.trim() }] : [];
  const composed: ReplyStep[] = turn.composed ? [{ kind: "composed", id: `${caseId}-card`, surface: { surfaceId: `${caseId}-card`, components: turn.composed.components, dataModel: turn.composed.dataModel, done: true } }] : [];
  return { id: caseId, question: { kind: "typed", text: recording.prompt }, steps: [...calls, ...words, ...composed] };
}

function enrolledExchange(courseId: string): Exchange {
  const input = { courseId };
  return { id: `enroll-${courseId}`, question: { kind: "pressed", tool: ENROLL_TOOL, input }, steps: [{ kind: "tool", toolCallId: `enroll-${courseId}`, name: ENROLL_TOOL, args: input, outcome: { state: "returned", result: { ok: true } } }] };
}

/** Recorded eval replies laid out as chat exchanges, optionally followed by an approved enrolment, so the chat's own exchange view can be checked without a model call. */
export function replayExchanges(caseIds: readonly string[], enrolled: string | null): Exchange[] {
  const exchanges = caseIds.flatMap((caseId) => recordedExchange(caseId) ?? []);
  return enrolled ? [...exchanges, enrolledExchange(enrolled)] : exchanges;
}

function pending(step: ReplyStep): ReplyStep {
  return step.kind === "tool" ? { ...step, outcome: { state: "pending" } } : step;
}

function groupsOf(calls: readonly ReplyStep[], parallel: boolean): ReplyStep[][] {
  return parallel ? [[...calls]] : calls.map((call) => [call]);
}

/** One recorded exchange as the live stream would show it at each moment, for a frame-by-frame look at the trail: before any call, each group of calls running (with `parallel` every call starts together and they finish one by one), the results read, then the whole finished exchange as the last frame. */
export function streamFramesOf(exchange: Exchange, parallel: boolean): Exchange[] {
  const calls = exchange.steps.filter((step) => step.kind === "tool");
  const frames: ReplyStep[][] = [[]];
  let finished: ReplyStep[] = [];
  for (const group of groupsOf(calls, parallel)) {
    frames.push([...finished, ...group.map(pending)]);
    for (let done = 1; done < group.length; done += 1) frames.push([...finished, ...group.slice(0, done), ...group.slice(done).map(pending)]);
    finished = [...finished, ...group];
    frames.push(finished);
  }
  return [...frames.map((steps) => ({ ...exchange, steps })), exchange];
}
