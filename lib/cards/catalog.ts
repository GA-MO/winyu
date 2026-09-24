import { z } from "zod";
import { extendCatalog } from "vexa/core";

const sourceSchema = z.record(z.string(), z.unknown());

/** Cop's own catalog components, on top of Vexa's. The model picks and names a card; Cop's presenter draws it. */
export const COP_COMPONENTS = {
  DataCard: {
    props: z.object({
      title: z.string(),
      source: sourceSchema,
      with: z.array(sourceSchema).max(3).nullable(),
      view: z.enum(["auto", "metric", "bar", "line", "table", "kv", "alert_list", "share", "stacked", "area", "heatmap"]).nullable(),
      sortBy: z.enum(["value_desc", "value_asc", "delta_asc", "delta_desc"]).nullable(),
      description: z.string().nullable(),
    }),
    description:
      "THE default answer to any question about a metric. `source` is bound to the tool result — { \"$state\": \"/tools/query_metric\" }, or \"/tools/query_metric.1\", \".2\" for the first and second call of the same turn. Cop renders the headline number, the rows or the chart, the source line and the next-action buttons from that result; never assemble those out of Card + Metric + RankList yourself. `with` binds the other query_metric calls of the same turn (\"/tools/query_metric.2\", \".3\") when one card should show several metrics together: the same things measured two ways (scatter), stages of one flow in the same unit (funnel), or the same months (lines together); otherwise null. `view` auto picks the body from the data shape — donut, stacked bars, heatmap and multi-line included; override only when the user asked for a specific one (a view the data cannot fill falls back to auto). `sortBy` orders the rows — delta_asc for a question about what dropped.",
    example: {
      title: "เอเย่นต์ที่ยอดตกเทียบงวดก่อน",
      source: { $state: "/tools/query_metric" },
      with: null,
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
  SignalList: {
    props: z.object({
      items: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          place: z.string(),
          gap: z.string().nullable(),
          gapTone: z.enum(["good", "bad", "neutral"]),
          gapCaption: z.string().nullable(),
          numbers: z.string(),
          severity: z.enum(["info", "success", "warning", "danger"]),
          severityLabel: z.string(),
          why: z.string().nullable(),
        }),
      ),
    }),
    description: "The anomaly rows inside an alert card. Cop fills it from get_alerts; never write one by hand, use AlertsCard.",
    example: { items: [] },
  },
  CardBody: {
    props: z.object({ body: z.record(z.string(), z.unknown()) }),
    description: "The chart inside a pinned dashboard card (donut, stacked bars, heatmap, scatter, funnel). Cop fills it from the widget's query; never write one by hand, use DataCard.",
    example: { body: { kind: "none" } },
  },
  LeaveForm: {
    props: z.object({
      kinds: z.array(z.object({ value: z.string(), label: z.string() })),
      earliest: z.string().nullable(),
      approver: z.string().nullable(),
      note: z.string().nullable(),
      kind: z.string().nullable(),
      from: z.string().nullable(),
      to: z.string().nullable(),
      reason: z.string().nullable(),
    }),
    description:
      "The leave form (kind, from, to, reason, ยื่นใบลา button). Copy get_policy(leave).data.form: kinds = form.kinds, earliest = form.earliest, approver = form.approver, note = form.note. kind / from (YYYY-MM-DD) / to / reason prefill what the user already typed, else null. Submitting presses request_leave with the filled values behind the user's approval.",
    example: {
      kinds: [{ value: "annual", label: "ลาพักร้อน (เหลือ 7 วัน)" }],
      earliest: "2026-09-25",
      approver: "คุณอนุชา พรหมศรี",
      note: "ลาพักร้อนได้ตั้งแต่ 25 ก.ย. 2569 (ยื่นล่วงหน้า 3 วันทำการ)",
      kind: null,
      from: null,
      to: null,
      reason: null,
    },
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
