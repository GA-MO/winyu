import type { ToolTier } from "@/lib/contracts";
import { LIMITS } from "./limits";
import { THROWN_CODE } from "./observation";
import type { FailureKind, Observation, RecoveryAction, Verdict } from "./types";

const DENIED_CODES: ReadonlySet<string> = new Set(["PERMISSION_DENIED", "TOOL_NOT_ALLOWED"]);

type RecoveryRule = { read: RecoveryAction; change: RecoveryAction; correctable: { read: boolean; change: boolean }; why: string };

const NEVER = { read: false, change: false };

/** What the harness does about each kind of failure: a read is idempotent and may run again, a change never runs twice on its own. */
const RECOVERY: Record<FailureKind, RecoveryRule> = {
  thrown: { read: "retry", change: "return", correctable: NEVER, why: "the tool threw" },
  timeout: { read: "retry", change: "return", correctable: NEVER, why: "the tool did not answer in time" },
  unavailable: { read: "retry", change: "return", correctable: NEVER, why: "the system behind the tool was unreachable" },
  denied: { read: "return", change: "return", correctable: NEVER, why: "the scope refused it; retrying cannot change that, the model tells the person" },
  rejected: { read: "return", change: "return", correctable: { read: true, change: true }, why: "the tool refused the arguments; the model may correct them or ask the person" },
  retryable_verification: { read: "retry", change: "withhold", correctable: NEVER, why: "the result did not hold up but may on a second read" },
  unverified: { read: "withhold", change: "withhold", correctable: { read: true, change: false }, why: "the result broke a post-condition, so it never reaches the model as a success" },
};

/** The kind of failure an attempt ended in, or null when it observed a success that verified. */
export function failureOf(observation: Observation, verdict: Verdict | null): FailureKind | null {
  if (observation.status === "failed") {
    const code = observation.evidence.code;
    if (code === THROWN_CODE) return "thrown";
    if (code === "TIMEOUT") return "timeout";
    if (code === "CONNECTOR_UNAVAILABLE") return "unavailable";
    if (code !== null && DENIED_CODES.has(code)) return "denied";
    return "rejected";
  }
  if (verdict?.status === "needs_retry") return "retryable_verification";
  if (verdict?.status === "failed") return "unverified";
  return null;
}

/** The next move after a failed attempt: a retry while the per-call budget lasts, a fix for the model when it can correct the call and still has corrections left, otherwise the rule's own move. */
export function recover(failure: FailureKind, tier: ToolTier, attempt: number, fixable: { hasFix: boolean; correctionsSoFar: number }): { action: RecoveryAction; why: string; outOfCorrections: boolean } {
  const rule = RECOVERY[failure];
  const action = tier === "read" ? rule.read : rule.change;
  if (action === "retry" && attempt > LIMITS.maxRetries) return { action: failure === "retryable_verification" ? "withhold" : "return", why: `${rule.why}; out of retries`, outOfCorrections: false };
  if (action === "retry") return { action, why: rule.why, outOfCorrections: false };
  const fixesThisCall = (tier === "read" ? rule.correctable.read : rule.correctable.change) && fixable.hasFix;
  if (fixesThisCall && fixable.correctionsSoFar < LIMITS.maxCorrections) return { action: "correct", why: `${rule.why}; the model gets the values that would work`, outOfCorrections: false };
  return { action, why: fixesThisCall ? `${rule.why}; out of corrections` : rule.why, outOfCorrections: fixesThisCall };
}
