import type { AccessContext, Alert, VerifyStep } from "@/lib/contracts";

function carriesMetrics(step: unknown): step is VerifyStep {
  return typeof step === "object" && step !== null && Array.isArray((step as { metrics?: unknown }).metrics);
}

/** The checks of an alert one viewer can run, as the text the chat asks: only checks whose every metric the viewer sees in full; a check stored before checks named their metrics is offered to no one. */
export function verifyStepsFor(access: Pick<AccessContext, "metricAcl">, alert: Pick<Alert, "verifySteps">): string[] {
  return alert.verifySteps
    .filter(carriesMetrics)
    .filter((step) => step.metrics.every((metric) => access.metricAcl[metric] === "full"))
    .map((step) => step.text);
}
