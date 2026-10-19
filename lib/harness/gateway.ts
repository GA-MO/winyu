import { randomUUID } from "node:crypto";
import type { AccessContext, RuleRef } from "@/lib/contracts";
import { TH } from "@/lib/i18n/th";
import { recordToolCall, type AuditedCall } from "@/lib/server/audit";
import { currentAccess } from "@/lib/server/request-context";
import { PortUnavailable, portDownOf } from "@/lib/server/ports/unavailable";
import { spendYes } from "./approvals";
import { observe, type Attempt } from "./observation";
import { authorize, type CallContext } from "./policy";
import { failureOf, recover } from "./recovery";
import { currentInitiator, currentRun, emit } from "./runtime";
import type { Capability, Denial, Observation, Unready, Verdict } from "./types";
import type { Run } from "./runtime";

const MS_PER_SECOND = 1000;
const NOT_READY = "NOT_READY";

/** What the engine passes along with a tool call; a call from server code passes nothing. */
export type ToolCallOptions = { toolCallId?: string };

/** What a refused, withheld or not-ready call returns to its caller, in the shape every tool already uses for a refusal: a gateway code (a deny code, VERIFICATION_FAILED, TIMEOUT) or the code a write's own readiness check gave. */
export type Refusal = { ok: false; code: string; error: string };

type Held = { code: string; reason: string; rule?: RuleRef };

/** A write that is not ready to ask about, under the gateway's own code unless its check names a sharper one (PERMISSION_DENIED for a scope it may not touch). */
export function notReady(fix: string, code: string = NOT_READY): Unready {
  return { code, fix };
}

export type GatedTool<Input, Output = unknown> = (input: Input, options?: ToolCallOptions) => Promise<Output | Refusal>;

type Ref = { toolCallId: string; tool: string };

/** What a tool's run is told about the call it carries out: the id the engine gave it, the same one the audit and the approval card know it by. */
export type CallRef = { toolCallId: string };

class ToolTimeout extends Error {}

function thrownAttempt(thrown: unknown): Attempt {
  return thrown instanceof PortUnavailable ? { returned: portDownOf(thrown) } : { thrown };
}

async function attemptOnce<Input>(run: (input: Input, call: CallRef) => Promise<unknown>, input: Input, call: CallRef, timeoutMs: number | null): Promise<Attempt> {
  if (timeoutMs === null) return run(input, call).then((returned) => ({ returned }), thrownAttempt);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new ToolTimeout()), timeoutMs);
  });
  try {
    return { returned: await Promise.race([run(input, call), timeout]) };
  } catch (error) {
    if (error instanceof ToolTimeout) return { returned: { ok: false, code: "TIMEOUT", error: TH.harness.timeout(timeoutMs / MS_PER_SECOND) } };
    return thrownAttempt(error);
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

function heldOf(denial: Denial): Held {
  return denial.code === "POLICY_RULE" ? { code: denial.code, reason: denial.reason, rule: denial.rule } : { code: denial.code, reason: denial.reason };
}

function refused(call: AuditedCall, ref: Ref, { code, reason, rule }: Held): Refusal {
  emit("gateway", { type: "tool.denied", payload: { ...ref, code, reason, ...(rule ? { rule } : {}) } });
  const refusal: Refusal = { ok: false, code, error: reason };
  recordToolCall({ ...call, ...(rule ? { rule } : {}) }, observe(ref.toolCallId, ref.tool, { returned: refusal }));
  return refusal;
}

function callContextOf(owner: Run | null, input: unknown): CallContext {
  return { input, initiator: currentInitiator(), used: owner?.toolCalls ?? 0, limit: owner?.toolBudget ?? Number.POSITIVE_INFINITY };
}

async function unready(capability: Capability, input: unknown): Promise<Unready | null> {
  if (!capability.ready) return null;
  try {
    return await capability.ready(input);
  } catch (thrown) {
    if (!(thrown instanceof PortUnavailable)) return notReady(TH.harness.notReady);
    const down = portDownOf(thrown);
    return notReady(down.error, down.code);
  }
}

/** Whether the person is asked before this call: only when its risk needs a yes, the policy would let it through and the call names everything it needs, so nobody approves a call the gateway then refuses or the tool cannot carry out. */
export async function asksApproval(capability: Capability, input: unknown): Promise<boolean> {
  if (authorize(currentAccess(), capability, callContextOf(currentRun(), input)).decision !== "require_approval") return false;
  return (await unready(capability, input)) === null;
}

async function heldBackOrSpendYes(capability: Capability, input: unknown, userId: string, toolCallId: string): Promise<Held | null> {
  const missing = await unready(capability, input);
  if (missing) return { code: missing.code, reason: missing.fix };
  return spendYes(userId, toolCallId, capability.name) ? null : { code: "NOT_APPROVED", reason: TH.harness.notApproved };
}

/** The one door every tool call goes through, whoever asks (the model, a pressed button, server code): policy, the tool under a timeout, what it showed, whether that holds, and what to do when it does not; one audit row per call. Fails closed on approval: a call whose risk needs a yes runs its tool only when it is ready and the person's recorded yes to this very tool call id is there to spend (a pressed button reaches a write only through the model and that same card; server code and jobs hold no yes, so their writes are refused); a call that is not ready returns its fix and acts on nothing. */
export function gated<Input, Output>(capability: Capability, run: (input: Input, call: CallRef) => Promise<Output>): GatedTool<Input, Output> {
  return async (input, options) => {
    const access = currentAccess();
    const ref = { toolCallId: options?.toolCallId ?? randomUUID(), tool: capability.name };
    const owner = currentRun();
    const context = callContextOf(owner, input);
    const call = { tool: capability.name, connector: capability.connector, userId: access.userId, args: input, redact: capability.redact, startedAt: Date.now(), toolCallId: ref.toolCallId, runId: owner?.id ?? null, initiator: context.initiator };
    const decision = authorize(access, capability, context);
    if (owner) owner.toolCalls += 1;
    if (decision.decision === "deny") return refused(call, ref, heldOf(decision));
    const held = decision.decision === "require_approval" ? await heldBackOrSpendYes(capability, input, access.userId, ref.toolCallId) : null;
    if (held) return refused(call, ref, held);
    emit("gateway", { type: "tool.authorized", payload: { ...ref, approval: decision.decision === "require_approval" ? "required" : "never" } });
    for (let attempt = 1; ; attempt += 1) {
      emit("gateway", { type: "tool.started", payload: { ...ref, attempt } });
      const startedAt = Date.now();
      const outcome = await attemptOnce(run, input, { toolCallId: ref.toolCallId }, capability.tier === "read" ? capability.timeoutMs : null);
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
