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
