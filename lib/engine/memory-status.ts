import type { MemoryFact } from "@/lib/contracts";

export const KNOWN_CONFIDENCE = 0.6;
export const SAID_CONFIDENCE = 0.45;
export const CONFIDENCE_STEP = 0.15;

export type MemoryStatus = "confirmed" | "known" | "learning";

/** Confirmed facts never decay (the user said so), known facts were seen twice or came from an action, the rest Cop is still learning. */
export function memoryStatus(fact: Pick<MemoryFact, "confidence" | "decayAt">): MemoryStatus {
  if (fact.decayAt === null) return "confirmed";
  return fact.confidence >= KNOWN_CONFIDENCE ? "known" : "learning";
}

/** Whether the persona may lean on this fact: learning facts stay out of the prompt until they are seen again. */
export function isTrusted(fact: Pick<MemoryFact, "confidence" | "decayAt">): boolean {
  return memoryStatus(fact) !== "learning";
}

/** How many times Cop has come across this fact; facts saved before the count existed are estimated from their confidence. */
export function seenCount(fact: Pick<MemoryFact, "confidence" | "seen">): number {
  if (fact.seen !== undefined) return fact.seen;
  return Math.max(1, 1 + Math.round((fact.confidence - SAID_CONFIDENCE) / CONFIDENCE_STEP));
}

/** When Cop last came across this fact. */
export function lastSeenAt(fact: Pick<MemoryFact, "createdAt" | "lastSeenAt">): string {
  return fact.lastSeenAt ?? fact.createdAt;
}
