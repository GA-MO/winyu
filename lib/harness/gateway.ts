import { randomUUID } from "node:crypto";
import type { AccessContext } from "@/lib/contracts";
import { TH } from "@/lib/i18n/th";
import { recordToolCall, type AuditedCall } from "@/lib/server/audit";
import { currentAccess } from "@/lib/server/request-context";
import { observe, type Attempt } from "./observation";
import { authorize, type CallContext } from "./policy";
import { failureOf, recover } from "./recovery";
import { currentRun, emit } from "./runtime";
import type { Capability, Denial, DenyCode, Observation, Verdict } from "./types";
import type { Run } from "./runtime";

const MS_PER_SECOND = 1000;

/** What the engine passes along with a tool call; a call from server code passes nothing. */
export type ToolCallOptions = { toolCallId?: string };

export type RefusalCode = DenyCode | "VERIFICATION_FAILED" | "TIMEOUT";

/** What a refused or withheld call returns to its caller, in the shape every tool already uses for a refusal. */
export type Refusal = { ok: false; code: RefusalCode; error: string };

export type GatedTool<Input, Output = unknown> = (input: Input, options?: ToolCallOptions) => Promise<Output | Refusal>;

type Ref = { toolCallId: string; tool: string };

class ToolTimeout extends Error {}

async function attemptOnce<Input>(run: (input: Input) => Promise<unknown>, input: Input, timeoutMs: number | null): Promise<Attempt> {
  if (timeoutMs === null) return run(input).then((returned) => ({ returned }), (thrown: unknown) => ({ thrown }));
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new ToolTimeout()), timeoutMs);
  });
  try {
    return { returned: await Promise.race([run(input), timeout]) };
  } catch (error) {
    if (error instanceof ToolTimeout) return { returned: { ok: false, code: "TIMEOUT", error: TH.harness.timeout(timeoutMs / MS_PER_SECOND) } };
    return { thrown: error };
  } finally {
    clearTimeout(timer);
  }
}

async function verdictOf(capability: Capability, input: unknown, observation: Observation, access: AccessContext): Promise<Verdict | null> {
  if (observation.status === "failed" || !capability.verify) return null;
  try {
    return await capability.verify({ input, observation, access });
  } catch (error) {
    return { status: "failed", reason: `verifier threw: ${error instanceof Error ? error.message : String(error)}` };
  }
}

function observed(ref: Ref, attempt: number, startedAt: number, observation: Observation): void {
  const latencyMs = Date.now() - startedAt;
  if (observation.status === "failed") emit("gateway", { type: "tool.failed", payload: { ...ref, attempt, code: observation.evidence.code ?? "FAILED", latencyMs } });
  else emit("gateway", { type: "tool.completed", payload: { ...ref, attempt, latencyMs } });
  emit("gateway", { type: "observation.created", payload: { ...ref, observationId: observation.id, status: observation.status, evidence: observation.evidence } });
}

function verified(ref: Ref, verdict: Verdict | null): void {
  if (!verdict) return;
  if (verdict.status === "passed") emit("gateway", { type: "verification.passed", payload: { ...ref, checks: verdict.checks } });
  else emit("gateway", { type: "verification.failed", payload: { ...ref, reason: verdict.reason, retry: verdict.status === "needs_retry" } });
}

function withheld(capability: Capability, verdict: Verdict | null): Refusal {
  const reason = verdict && verdict.status !== "passed" ? verdict.reason : "";
  return { ok: false, code: "VERIFICATION_FAILED", error: capability.tier === "read" ? TH.harness.withheld : TH.harness.unverified(reason) };
}

function fixOf(capability: Capability, input: unknown, observation: Observation, verdict: Verdict | null, access: AccessContext): string | null {
  if (!capability.correct) return null;
  try {
    return capability.correct({ input, observation, verdict, access });
  } catch {
    return null;
  }
}

function withFix<Output>(capability: Capability, observation: Observation, verdict: Verdict | null, fix: string): Output {
  const base = observation.status === "failed" ? observation.data : withheld(capability, verdict);
  return { ...(base as object), fix } as Output;
}

function spendCorrection(owner: Run | null, tool: string): void {
  if (owner) owner.corrections[tool] = (owner.corrections[tool] ?? 0) + 1;
}

function refused(call: AuditedCall, ref: Ref, denial: Denial): Refusal {
  const rule = denial.code === "POLICY_RULE" ? denial.rule : undefined;
  emit("gateway", { type: "tool.denied", payload: { ...ref, code: denial.code, reason: denial.reason, ...(rule ? { rule } : {}) } });
  const refusal: Refusal = { ok: false, code: denial.code, error: denial.reason };
  recordToolCall({ ...call, ...(rule ? { rule } : {}) }, observe(ref.toolCallId, ref.tool, { returned: refusal }));
  return refusal;
}

function callContextOf(owner: Run | null, input: unknown): CallContext {
  return { input, initiator: owner?.initiator ?? "system", used: owner?.toolCalls ?? 0, limit: owner?.toolBudget ?? Number.POSITIVE_INFINITY };
}

/** Whether the person is asked before this call: only when its risk needs a yes and the policy would let it through, so nobody approves a call the gateway then refuses. */
export function asksApproval(capability: Capability, input: unknown): boolean {
  return authorize(currentAccess(), capability, callContextOf(currentRun(), input)).decision === "require_approval";
}

/** The one door every tool call goes through, whoever asks (the model, a pressed button, server code): policy, the tool under a timeout, what it showed, whether that holds, and what to do when it does not; one audit row per call. */
export function gated<Input, Output>(capability: Capability, run: (input: Input) => Promise<Output>): GatedTool<Input, Output> {
  return async (input, options) => {
    const access = currentAccess();
    const ref = { toolCallId: options?.toolCallId ?? randomUUID(), tool: capability.name };
    const owner = currentRun();
    const context = callContextOf(owner, input);
    const call = { tool: capability.name, connector: capability.connector, userId: access.userId, args: input, redact: capability.redact, startedAt: Date.now(), toolCallId: ref.toolCallId, runId: owner?.id ?? null, initiator: context.initiator };
    const decision = authorize(access, capability, context);
    if (owner) owner.toolCalls += 1;
    if (decision.decision === "deny") return refused(call, ref, decision);
    emit("gateway", { type: "tool.authorized", payload: { ...ref, approval: decision.decision === "require_approval" ? "required" : "never" } });
    for (let attempt = 1; ; attempt += 1) {
      emit("gateway", { type: "tool.started", payload: { ...ref, attempt } });
      const startedAt = Date.now();
      const outcome = await attemptOnce(run, input, capability.tier === "read" ? capability.timeoutMs : null);
      const observation = observe(ref.toolCallId, capability.name, outcome);
      observed(ref, attempt, startedAt, observation);
      const verdict = await verdictOf(capability, input, observation, access);
      verified(ref, verdict);
      const failure = failureOf(observation, verdict);
      if (!failure) {
        recordToolCall(call, observation);
        return observation.data as Output;
      }
      const fix = fixOf(capability, input, observation, verdict, access);
      const { action, why, outOfCorrections } = recover(failure, capability.tier, attempt, { hasFix: fix !== null, correctionsSoFar: owner?.corrections[capability.name] ?? 0 });
      const told = action === "correct" ? fix : outOfCorrections ? TH.harness.stopCorrecting : null;
      emit("gateway", { type: "recovery.decided", payload: { ...ref, action, reason: why, ...(told ? { fix: told } : {}) } });
      if (action === "retry") continue;
      if (told) {
        if (action === "correct") spendCorrection(owner, capability.name);
        const answer = withFix<Output>(capability, observation, verdict, told);
        recordToolCall(call, observe(ref.toolCallId, capability.name, { returned: answer }));
        return answer;
      }
      if (action === "withhold") {
        const refusal = withheld(capability, verdict);
        recordToolCall(call, observe(ref.toolCallId, capability.name, { returned: refusal }));
        return refusal;
      }
      recordToolCall(call, observation);
      if ("thrown" in outcome) throw outcome.thrown;
      return observation.data as Output;
    }
  };
}
