import type { Dim, MetricId } from "./semantic";

export type Alert = { id: string; at: string; severity: "P1" | "P2" | "P3"; metric: MetricId; dims: Partial<Record<Dim, string>>;
  window: { from: string; to: string }; observed: number; expected: number; zScore: number; direction: "up" | "down";
  hypothesis: string; verifySteps: [string, string]; ownerUserId: string; status: "open" | "dismissed" | "handed_off" | "resolved"; dismissCount: number;
  parentId?: string | null; relatedIds?: string[]; campaignId?: string | null; alsoOwnerIds?: string[] };
export type Forecast = { id: string; metric: MetricId; dims: Partial<Record<Dim, string>>; horizon: { from: string; to: string };
  points: { date: string; value: number; lo: number; hi: number }[]; mape: number; method: "holt_winters" };

export type AlertRow = { id: string; severity: Alert["severity"]; severityLabel: string; metric: MetricId; metricLabel: string;
  scope: Partial<Record<Dim, string>>; scopeLabel: string; window: string; observedLabel: string; expectedLabel: string;
  gapLabel: string | null; yearOverYear: boolean; direction: "up" | "down"; hypothesis: string; verifySteps: readonly string[]; ownerUserId: string };
