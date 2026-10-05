import type { GuardFinding } from "./guard";
import type { AccessContext, RuleRef, ToolSurfaceEntry } from "@/lib/contracts";

export type GoalStatus = "active" | "completed" | "failed" | "cancelled";

/** What the person asked for, held in the run state rather than the transcript; the runs an approval splits one question into share it. */
export type Goal = { id: string; userMessage: string; intent: string | null; status: GoalStatus };

export type ApprovalRule = "never" | "required";

export type ObservationStatus = "success" | "partial" | "failed";

/** What a tool result showed, in the terms the harness reasons about: the code it returned and why, how many rows, which fields came back masked. */
export type Evidence = { code: string | null; reason: string | null; rows: number; masked: string[] };

/** One tool result as the harness saw it; `data` is the raw output and never leaves the run. */
export type Observation = { id: string; actionId: string; source: string; status: ObservationStatus; data: unknown; evidence: Evidence };

export type Verdict = { status: "passed"; checks: string[] } | { status: "failed" | "needs_retry"; reason: string };

export type VerifyInput = { input: unknown; observation: Observation; access: AccessContext };

/** A post-condition on a tool result: what must be true for the call to count as done, beyond the tool saying so. */
export type Verifier = (check: VerifyInput) => Verdict | Promise<Verdict>;

export type CorrectInput = { input: unknown; observation: Observation; verdict: Verdict | null; access: AccessContext };

/** How the model can fix a call the tool refused or the harness did not trust: one instruction with the values that would work, or null when the model cannot fix it. */
export type Corrector = (check: CorrectInput) => string | null;

/** Whether a write call names everything it needs (its people, its subject) so the person can be asked; a call that does not runs at once, does nothing and returns the fix. It reads the input alone, so the call that runs unasked fails the same check and can never act. */
export type Readiness = (input: unknown) => boolean;

/** One tool as the harness governs it: its surface entry (connector, tier = risk, roles) plus how long a read may take, whether a write is complete enough to ask about, what must hold afterwards, how the model can fix a failed call, and which arguments are personal text the audit never keeps. */
export type Capability = ToolSurfaceEntry & { timeoutMs: number; ready: Readiness | null; verify: Verifier | null; correct: Corrector | null; redact: readonly string[] };

export type DenyCode = "TOOL_NOT_ALLOWED" | "POLICY_RULE" | "RUN_LIMIT";

/** A refusal: its code, the reason the model is told, and the admin rule when one refused. */
export type Denial = { decision: "deny"; code: Exclude<DenyCode, "POLICY_RULE">; reason: string } | { decision: "deny"; code: "POLICY_RULE"; reason: string; rule: RuleRef };

export type PolicyDecision = { decision: "allow" } | { decision: "require_approval" } | Denial;

export type FailureKind = "thrown" | "timeout" | "unavailable" | "denied" | "rejected" | "unverified" | "retryable_verification";

export type RecoveryAction = "retry" | "correct" | "return" | "withhold";

export type ContextKind = "identity" | "role" | "scope" | "date" | "vocabulary" | "memory" | "switch" | "packet" | "story" | "suggestion";

/** One piece of what the model is told, with where it came from, how much it matters, and whose data it is. */
export type ContextItem = { id: string; kind: ContextKind; content: string; priority: number; source: string; scope: string | null; guarded?: GuardFinding };
