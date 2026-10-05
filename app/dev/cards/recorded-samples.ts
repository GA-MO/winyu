import { readRecordings, turnOf } from "@/lib/eval/recording";
import type { SampleResult } from "./run-samples";

const RECORDED_CASES = ["docs-credit-terms", "docs-hr-hidden", "docs-unanswerable"] as const;

/** Read cards drawn from recorded eval replies, so a card that reads the reply (the documents card) shows how it looks beside a real answer. */
export function recordedSamples(): SampleResult[] {
  const recordings = readRecordings();
  return RECORDED_CASES.flatMap((caseId) => {
    const recording = recordings.get(caseId);
    if (!recording) return [];
    const turn = turnOf(recording);
    return turn.calls.flatMap((call) => (call.result === undefined ? [] : [{ tool: call.tool, caption: `${call.tool} · ${caseId}`, question: recording.prompt, input: typeof call.args === "object" && call.args !== null ? { ...call.args } : {}, result: call.result, reply: turn.words }]));
  });
}
