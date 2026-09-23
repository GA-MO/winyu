import { z } from "zod";
import { extendCatalog } from "vexa/core";

const sourceSchema = z.record(z.string(), z.unknown());

/** Cop's own catalog components, on top of Vexa's. The model picks and names a card; Cop's presenter draws it. */
export const COP_COMPONENTS = {
  DataCard: {
    props: z.object({
      title: z.string(),
      source: sourceSchema,
      view: z.enum(["auto", "metric", "bar", "line", "table", "kv", "alert_list"]).nullable(),
      sortBy: z.enum(["value_desc", "value_asc", "delta_asc", "delta_desc"]).nullable(),
      description: z.string().nullable(),
    }),
    description:
      "THE default answer to any question about a metric. `source` is bound to the tool result — { \"$state\": \"/tools/query_metric\" }, or \"/tools/query_metric.1\", \".2\" for the first and second call of the same turn. Cop renders the headline number, the rows or the chart, the source line and the next-action buttons from that result; never assemble those out of Card + Metric + RankList yourself. `view` auto picks the body from the data shape; override only when the user asked for a specific one. `sortBy` orders the rows — delta_asc for a question about what dropped.",
    example: {
      title: "เอเย่นต์ที่ยอดตกเทียบงวดก่อน",
      source: { $state: "/tools/query_metric" },
      view: "auto",
      sortBy: "delta_asc",
      description: null,
    },
  },
  ActionStrip: {
    props: z.object({
      actions: z.array(
        z.object({
          id: z.string(),
          kind: z.string(),
          label: z.string(),
          reason: z.string(),
          tool: z.string().nullable(),
          input: z.record(z.string(), z.unknown()).nullable(),
          prompt: z.string().nullable(),
        }),
      ),
    }),
    description: "The next-action buttons of a card. Cop fills it from the tool result; never write one by hand.",
    example: { actions: [] },
  },
  AlertsCard: {
    props: z.object({
      title: z.string(),
      source: sourceSchema,
      description: z.string().nullable(),
    }),
    description:
      "The anomalies a get_alerts call returned, as severity rows with their numbers and next-action buttons. `source` binds to { \"$state\": \"/tools/get_alerts\" }. Use it instead of a Card full of Alert elements.",
    example: {
      title: "ความผิดปกติที่ระบบตรวจพบ",
      source: { $state: "/tools/get_alerts" },
      description: null,
    },
  },
};

export const copCatalog = extendCatalog({ components: COP_COMPONENTS });
