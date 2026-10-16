import { randomUUID } from "node:crypto";
import { liveAccessFor } from "@/lib/access/enforce";
import type { User } from "@/lib/contracts";
import { newRun, runWithRun, saveRun } from "@/lib/harness/runtime";
import { winyuTools } from "@/lib/server/agent/tools";
import { runWithAccess, runWithTurn } from "@/lib/server/request-context";
import type { ReadSample } from "./samples";

/** A read sample with what the tool returned for this user; JSON-safe so it can cross to the client gallery. */
export type SampleResult = ReadSample & { result: unknown };

function refusal(error: string) {
  return { ok: false, error };
}

async function runSample(user: User, sample: ReadSample): Promise<SampleResult> {
  const tool = winyuTools()[sample.tool];
  if (!tool) return { ...sample, result: refusal(`no tool ${sample.tool}`) };
  const parsed = tool.inputSchema().safeParse(sample.input);
  if (!parsed.success) return { ...sample, result: refusal(parsed.error.message) };
  const access = liveAccessFor(user);
  const run = newRun(access.userId, null, { initiator: "system" });
  const turn = { turnId: run.id, threadId: null, preloadPacketId: null, question: sample.question, queries: [] };
  const output = await runWithAccess(access, () => runWithTurn(turn, () => runWithRun(run, () => tool.execute(parsed.data, { toolCallId: randomUUID() }))));
  saveRun(run);
  return { ...sample, result: JSON.parse(JSON.stringify(output ?? null)) };
}

/** Runs every read sample for one user through the gateway, the same nesting a chat turn uses, one after another. */
export async function runSamples(user: User, samples: readonly ReadSample[]): Promise<SampleResult[]> {
  const results: SampleResult[] = [];
  for (const sample of samples) results.push(await runSample(user, sample));
  return results;
}
