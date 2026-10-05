import type { ObservabilityExporter } from "@mastra/core/observability";
import { Observability, MastraStorageExporter } from "@mastra/observability";
import { OtelExporter } from "@mastra/otel-exporter";
import { traceIdOfRun } from "@/lib/harness/trace-link";

/** The request-context key that carries the harness run id onto the Mastra trace as metadata. */
export const HARNESS_RUN_KEY = "harnessRunId";

const SERVICE_NAME = "mascop";
const OTEL_ENDPOINT_ENV = "MASCOP_OTEL_ENDPOINT";

function otelExporters(): ObservabilityExporter[] {
  const endpoint = process.env[OTEL_ENDPOINT_ENV];
  if (!endpoint) return [];
  return [new OtelExporter({ provider: { custom: { endpoint, protocol: "http/json" } }, signals: { traces: true, logs: false } })];
}

/** Mastra tracing kept on this machine: spans go to the agent's own LibSQL store for Studio, and to an OpenTelemetry collector only when `MASCOP_OTEL_ENDPOINT` names one. Nothing goes to a hosted platform. */
export function mascopObservability(userIdKey: string): Observability {
  return new Observability({
    configs: {
      default: {
        serviceName: SERVICE_NAME,
        exporters: [new MastraStorageExporter(), ...otelExporters()],
        requestContextKeys: [userIdKey, HARNESS_RUN_KEY],
      },
    },
  });
}

/** The tracing options of one chat run: its Mastra trace id follows from the harness run id. */
export function tracingOptionsOf(runId: string) {
  return { traceId: traceIdOfRun(runId) };
}
