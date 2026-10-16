import { randomUUID } from "node:crypto";
import { liveAccessFor } from "@/lib/access/enforce";
import type { User } from "@/lib/contracts";
import { newRun, runWithRun, saveRun } from "@/lib/harness/runtime";
import { winyuTools } from "@/lib/server/agent/tools";
import { runWithAccess, runWithTurn } from "@/lib/server/request-context";
import type { ReadSample } from "./samples";

/** A read sample with what the tool returned for this user, and what its paired call returned (a second answer the card draws with it); JSON-safe so it can cross to the client gallery. */
export type SampleResult = ReadSample & { result: unknown; paired: unknown[] };

function refusal(error: string) {
  return { ok: false, error };
}

async function runCall(user: User, tool: string, question: string, input: Record<string, unknown>): Promise<unknown> {
  const definition = winyuTools()[tool];
  if (!definition) return refusal(`no tool ${tool}`);
  const parsed = definition.inputSchema().safeParse(input);
  if (!parsed.success) return refusal(parsed.error.message);
  const access = liveAccessFor(user);
  const run = newRun(access.userId, null, { initiator: "system" });
  const turn = { turnId: run.id, threadId: null, question, queries: [] };
  const output = await runWithAccess(access, () => runWithTurn(turn, () => runWithRun(run, () => definition.execute(parsed.data, { toolCallId: randomUUID() }))));
  saveRun(run);
  return JSON.parse(JSON.stringify(output ?? null));
}

async function runSample(user: User, sample: ReadSample): Promise<SampleResult> {
  const result = await runCall(user, sample.tool, sample.question, sample.input);
  const paired = sample.with ? [await runCall(user, sample.tool, sample.question, sample.with)] : [];
  return { ...sample, result, paired };
}

/** Runs every read sample for one user through the gateway, the same nesting a chat turn uses, one after another. */
export async function runSamples(user: User, samples: readonly ReadSample[]): Promise<SampleResult[]> {
  const results: SampleResult[] = [];
  for (const sample of samples) results.push(await runSample(user, sample));
  return results;
}
