import type { MetricId, Dim } from "@/lib/contracts";

/** What the audit and the reply should show for one simulated question. */
export type SimDecision = "allow" | "masked" | "deny" | "scoped" | "refuse";

/** A topic one simulated user keeps coming back to; `slice` is the card a good suggestion would build, null when no metric tells it. */
export type SimInterest = { key: string; label: string; slice: { metric: MetricId; dims: Dim[] } | null };

/** Press a next-action button the previous answer offered, by its kind (pin, handoff, request_access, verify, drill). */
export type SimPress = { press: string };

export type SimTurn = (
  | { say: string }
  | SimPress
) & {
  interest: string | null;
  expectTools: string[];
  expectDecision: SimDecision;
  approve?: boolean;
  note?: string;
};

/** One chat thread on one simulated day; `daysAgo` 0 is today, 13 is the start of the two-week window. */
export type SimSession = { daysAgo: number; turns: SimTurn[] };

export type SimPersona = { userId: string; interests: SimInterest[]; sessions: SimSession[] };
