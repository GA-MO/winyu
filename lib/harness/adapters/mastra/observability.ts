import { SpanType, type AnySpan, type ObservabilityExporter, type SpanOutputProcessor } from "@mastra/core/observability";
import { Observability, MastraStorageExporter } from "@mastra/observability";
import { OtelExporter } from "@mastra/otel-exporter";
import { traceIdOfRun } from "@/lib/harness/trace-link";
import { withoutPersonalFields } from "@/lib/server/audit";
import { winyuTool } from "@/lib/server/tools/registry";

/** The request-context key that carries the harness run id onto the Mastra trace as metadata. */
export const HARNESS_RUN_KEY = "harnessRunId";

const SERVICE_NAME = "winyu";
const OTEL_ENDPOINT_ENV = "WINYU_OTEL_ENDPOINT";

function otelExporters(): ObservabilityExporter[] {
  const endpoint = process.env[OTEL_ENDPOINT_ENV];
  if (!endpoint) return [];
  return [new OtelExporter({ provider: { custom: { endpoint, protocol: "http/json" } }, signals: { traces: true, logs: false } })];
}

/** Hides a tool's personal fields (its `redact` list) in the tool call's span input, as the audit hides them in its args. */
export const personalFieldsHidden: SpanOutputProcessor = {
  name: "winyu-personal-fields-hidden",
  process(span?: AnySpan) {
    if (!span || span.type !== SpanType.TOOL_CALL) return span;
    const redact = winyuTool(span.entityName ?? "")?.capability.redact ?? [];
    if (redact.length > 0) span.input = withoutPersonalFields(span.input, new Set(redact)) as typeof span.input;
    return span;
  },
  shutdown: async () => undefined,
};

/** Mastra tracing kept on this machine: spans go to the agent's own LibSQL store for Studio, and to an OpenTelemetry collector only when `WINYU_OTEL_ENDPOINT` names one. Nothing goes to a hosted platform. */
export function winyuObservability(userIdKey: string): Observability {
  return new Observability({
    configs: {
      default: {
        serviceName: SERVICE_NAME,
        exporters: [new MastraStorageExporter(), ...otelExporters()],
        requestContextKeys: [userIdKey, HARNESS_RUN_KEY],
        spanOutputProcessors: [personalFieldsHidden],
      },
    },
  });
}

/** The tracing options of one chat run: its Mastra trace id follows from the harness run id. */
export function tracingOptionsOf(runId: string) {
  return { traceId: traceIdOfRun(runId) };
}
