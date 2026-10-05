import { createScorer, notScorable } from "@mastra/core/evals";
import type { EvalCase } from "@/lib/eval/cases";
import { EVAL_CHECKS, type EvalCheck, type Verdict } from "@/lib/eval/checks";
import type { EvalTurn } from "@/lib/eval/recording";

const NOT_THIS_CASE = "ไม่เกี่ยวกับเคสนี้";
const PASS = 1;
const FAIL = 0;

/** What the person asked, as a scorer reads it. */
type ScorerInput = { userId: string; prompt: string };

/** One check's result on one case. */
export type CheckScore = { id: string; ok: boolean; detail: string };

function verdictOf(value: unknown): Verdict {
  return value as Verdict;
}

function scorerOf(check: EvalCheck) {
  return createScorer<ScorerInput, EvalTurn>({ id: check.id, description: check.description })
    .preprocess(({ run }) => check.verdict(run.output, run.groundTruth as EvalCase) ?? notScorable(NOT_THIS_CASE))
    .generateScore(({ results }) => (verdictOf(results.preprocessStepResult).ok ? PASS : FAIL))
    .generateReason(({ results }) => verdictOf(results.preprocessStepResult).detail);
}

/** Every eval check as a Mastra scorer with function steps only, so scoring never calls a judge model; a check that does not apply to a case is not scorable rather than a pass. */
export const EVAL_SCORERS = EVAL_CHECKS.map(scorerOf);

/** Scores one replayed turn against its case with every scorer; checks that do not apply are left out. */
export async function scoreTurn(turn: EvalTurn, expected: EvalCase): Promise<CheckScore[]> {
  const input: ScorerInput = { userId: expected.userId, prompt: expected.prompt };
  const runs = await Promise.all(EVAL_SCORERS.map((scorer) => scorer.run({ input, output: turn, groundTruth: expected })));
  return runs.flatMap((run, index) => (run.notScorable ? [] : [{ id: EVAL_CHECKS[index].id, ok: run.score === PASS, detail: run.reason ?? "" }]));
}
