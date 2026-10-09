import { randomUUID } from "node:crypto";
import type { User } from "@/lib/contracts";
import { findUser } from "@/lib/data/entities/users";
import { EVAL_CASES } from "@/lib/eval/cases";
import { firstToolOf, medianRecordedUsd, readRecordings } from "@/lib/eval/recording";
import { TH } from "@/lib/i18n/th";
import { forgetThread } from "@/lib/harness/adapters/mastra/history";
import { forgetConversation } from "@/lib/harness/adapters/mastra/recall";
import { recordCase } from "@/lib/harness/adapters/mastra/record";
import { recordConnectorEvent } from "@/lib/server/audit";
import { agentModel } from "@/lib/server/models";
import { deleteThread } from "@/lib/server/threads-read";
import { MAX_CHECK_PROMPT_CHARS, MAX_CHECK_QUESTIONS, type CoreCase, type ModelCheckAnswer, type ModelCheckInput, type ModelCheckResult, type Problem, type StoredConnector } from "@/lib/connectors/spec";
import { withPreviewConnector } from "./index";
import { openSecret } from "./secrets";
import { compileStored, storedConnector, upstreamOf } from "./stored";
import type { McpConnector } from "./types";

const CHECK_CASE_ID = "model-check";

type Question = { prompt: string; caseId: string | null; expected: string | null };

/** The recorded eval questions with the tool each started with, which an admin can ask again with a console connector on the surface, and the per-question cost estimate. */
export function coreCasesForCheck(): { cases: CoreCase[]; perQuestionUsd: number } {
  const recordings = readRecordings();
  const cases = EVAL_CASES.flatMap((testCase) => {
    const recording = recordings.get(testCase.id);
    return recording && !testCase.before?.length ? [{ id: testCase.id, userId: testCase.userId, prompt: testCase.prompt, tool: firstToolOf(recording) }] : [];
  });
  return { cases, perQuestionUsd: medianRecordedUsd(recordings) };
}

function questionsOf(input: ModelCheckInput): Question[] | null {
  const typed = input.prompts.map((prompt) => prompt.trim()).filter(Boolean);
  const recorded = coreCasesForCheck().cases.filter((testCase) => input.cases.includes(testCase.id) && testCase.userId === input.asUser);
  const questions = [...typed.map((prompt) => ({ prompt, caseId: null, expected: null })), ...recorded.map((testCase) => ({ prompt: testCase.prompt, caseId: testCase.id, expected: testCase.tool }))];
  if (questions.length === 0 || questions.length > MAX_CHECK_QUESTIONS || typed.some((prompt) => prompt.length > MAX_CHECK_PROMPT_CHARS)) return null;
  return questions;
}

function previewOf(connector: StoredConnector): McpConnector | null {
  const secret = openSecret(connector.id);
  if (!secret) return null;
  try {
    return compileStored({ ...connector, activatedAt: connector.activatedAt ?? new Date().toISOString() }, secret, upstreamOf(connector.id));
  } catch {
    return null;
  }
}

async function forgetCheckThread(userId: string, threadId: string): Promise<void> {
  await forgetThread(threadId, userId);
  await forgetConversation(userId, threadId);
  deleteThread(threadId, userId);
}

async function asked(preview: McpConnector, user: User, question: Question): Promise<{ answer: ModelCheckAnswer; usd: number }> {
  const threadId = `${CHECK_CASE_ID}-${randomUUID()}`;
  try {
    const recording = await withPreviewConnector(preview, () => recordCase({ caseId: CHECK_CASE_ID, userId: user.id, prompt: question.prompt, threadId }));
    const tools = recording.steps.flatMap((step) => (step.kind === "call" ? [step.tool] : []));
    const ours = (name: string) => name.startsWith(`${preview.def.id}__`);
    const answer: ModelCheckAnswer = {
      prompt: question.prompt,
      caseId: question.caseId,
      tools,
      asked: recording.asked,
      fromConnector: [...new Set([...tools, ...recording.asked].filter(ours))],
      expected: question.expected,
      kept: question.caseId ? (tools[0] ?? null) === question.expected : null,
      error: recording.error,
    };
    return { answer, usd: recording.usage.usd };
  } finally {
    await forgetCheckThread(user.id, threadId);
  }
}

function refuse(problem: Problem["problem"]): Problem {
  return { ok: false, problem };
}

/** Asks the real agent up to three questions as the chosen person with this console connector's tested tools on the surface, as if it were live, and reports which tools the model picked; a write it picks stops at the approval and never runs. The threads are removed afterwards. IT admin only, audited. */
export async function checkConnectorWithModel(actor: User | null, input: ModelCheckInput): Promise<ModelCheckResult> {
  if (actor?.role !== "it_admin") return refuse("not_admin");
  const connector = storedConnector(input.connector);
  if (!connector) return refuse("not_found");
  const user = findUser(input.asUser);
  if (!user) return refuse("unknown_user");
  const questions = questionsOf(input);
  if (!questions) return refuse("bad_questions");
  if (!agentModel()) return refuse("no_model");
  const preview = previewOf(connector);
  if (!preview) return refuse("blocked");
  const answers: ModelCheckAnswer[] = [];
  let usd = 0;
  for (const question of questions) {
    const result = await asked(preview, user, question);
    answers.push(result.answer);
    usd += result.usd;
  }
  const picked = [...new Set(answers.flatMap((answer) => answer.fromConnector))];
  recordConnectorEvent({ userId: actor.id, event: "model_checked", connector: connector.id, tool: null, reason: TH.connectorUi.audit.model_checked(connector.labelTh, user.nameTh, questions.length), detail: { asUser: user.id, questions: questions.length, cases: input.cases, picked, usd } });
  return { ok: true, answers, usd };
}
