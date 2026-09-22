import type { MockScript, MockStep } from "vexa/mock";
import type { Spec, SpecElement } from "vexa/protocol";
import { formatDateTh } from "@/lib/i18n/format";

const TODAY = "2026-09-22";
const MONTH_START = "2026-09-01";
const MAX_METRICS = 3;
const MAX_TABLE_ROWS = 8;

type Row = Record<string, string | number | null>;
type MetricOutput = {
  ok?: boolean;
  rows?: Row[];
  summary?: string;
  error?: string;
  provenance?: { sourceSystem?: string; certified?: boolean; asOf?: string; masked?: string[] };
};
type OwnerOutput = { ok?: boolean; data?: { userId?: string; nameTh?: string; reason?: string } };

const REGION_CODES: [RegExp, string][] = [
  [/ใต้/, "south"],
  [/อีสาน|ตะวันออกเฉียงเหนือ/, "northeast"],
  [/เหนือ/, "north"],
  [/ตะวันออก/, "east"],
  [/กลาง/, "central"],
  [/กรุงเทพ|กทม/, "bkk"],
];

function regionFilter(prompt: string): Record<string, string[]> {
  const hit = REGION_CODES.find(([pattern]) => pattern.test(prompt));
  return hit ? { region: [hit[1]] } : {};
}

function rowsOf(output: unknown): Row[] {
  const rows = (output as MetricOutput).rows;
  return Array.isArray(rows) ? rows : [];
}

function textOf(row: Row, key: string): string {
  const value = row[key];
  if (value === null || value === undefined) return "-";
  return typeof value === "number" ? value.toLocaleString("th-TH", { maximumFractionDigits: 1 }) : String(value);
}

function deltaTextOf(row: Row): string {
  const value = row.delta_pct;
  if (typeof value !== "number") return "-";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function numberOf(row: Row, key: string): number {
  const value = Number(row[key]);
  return Number.isFinite(value) ? value : 0;
}

function summaryOf(output: unknown): string {
  return (output as MetricOutput).summary ?? "";
}

function provenanceText(output: unknown): string {
  const provenance = (output as MetricOutput).provenance;
  if (!provenance?.asOf) return "แหล่งข้อมูล: ไม่ระบุ";
  return `แหล่งข้อมูล: ${provenance.sourceSystem} · ${provenance.certified ? "รับรองแล้ว" : "คำนวณ"} · ณ ${formatDateTh(provenance.asOf)}`;
}

function maskedCount(output: unknown): number {
  return (output as MetricOutput).provenance?.masked?.length ?? 0;
}

function trendOf(row: Row): "up" | "down" | "neutral" {
  const delta = numberOf(row, "delta_pct");
  if (delta > 1) return "up";
  if (delta < -1) return "down";
  return "neutral";
}

function sourceElement(output: unknown): SpecElement {
  return { type: "Text", props: { content: provenanceText(output), muted: true }, children: [] };
}

function salesSpec(output: unknown): Spec {
  const rows = rowsOf(output);
  const metrics = rows.slice(0, MAX_METRICS);
  const elements: Record<string, SpecElement> = {
    card: { type: "Card", props: { title: "ยอดขายสุทธิเทียบเป้า", description: summaryOf(output) }, children: ["grid", "chart", "source"] },
    grid: { type: "Grid", props: { columns: "3", gap: "sm" }, children: metrics.map((unused, index) => `metric${index}`) },
    chart: {
      type: "BarChart",
      props: {
        title: "ยอดขายรายภาค (HL)",
        labels: rows.map((row) => textOf(row, "region")),
        series: [{ name: "ยอดขาย", values: rows.map((row) => numberOf(row, "value")) }],
        horizontal: true,
        showValues: true,
        format: "number",
        height: "md",
      },
      children: [],
    },
    source: sourceElement(output),
  };
  metrics.forEach((row, index) => {
    elements[`metric${index}`] = {
      type: "Metric",
      props: { label: textOf(row, "region"), value: textOf(row, "value"), detail: `เทียบเป้า ${deltaTextOf(row)}`, trend: trendOf(row) },
      children: [],
    };
  });
  return { root: "card", elements };
}

function agentSpec(output: unknown): Spec {
  const rows = rowsOf(output)
    .slice(0, MAX_TABLE_ROWS)
    .map((row) => ({ agent: textOf(row, "agent"), volume: textOf(row, "value"), delta: deltaTextOf(row) }));
  return {
    root: "card",
    elements: {
      card: { type: "Card", props: { title: "เอเย่นต์ที่ยอดตกเทียบงวดก่อน", description: summaryOf(output) }, children: ["table", "source"] },
      table: {
        type: "Table",
        props: {
          columns: [
            { key: "agent", label: "เอเย่นต์" },
            { key: "volume", label: "ยอดขาย (HL)" },
            { key: "delta", label: "เทียบงวดก่อน" },
          ],
          rows,
        },
        children: [],
      },
      source: sourceElement(output),
    },
  };
}

function salarySpec(output: unknown): Spec {
  const count = maskedCount(output);
  const rows = rowsOf(output)
    .slice(0, MAX_TABLE_ROWS)
    .map((row) => ({ department: textOf(row, "department"), salary: textOf(row, "value") }));
  return {
    root: "card",
    elements: {
      card: { type: "Card", props: { title: "เงินเดือนเฉลี่ยรายฝ่าย", description: summaryOf(output) }, children: ["alert", "table", "source"] },
      alert: {
        type: "Alert",
        props: {
          title: "ข้อมูลถูกปิดบางส่วน",
          body: `มี ${count} ฟิลด์ถูกปิดตามสิทธิ์ของคุณ ค่าที่แสดงเป็น *** ขอสิทธิ์เพิ่มได้จากเจ้าของเมตริก`,
          tone: "warning",
        },
        children: [],
      },
      table: {
        type: "Table",
        props: {
          columns: [
            { key: "department", label: "ฝ่าย" },
            { key: "salary", label: "เงินเดือนเฉลี่ย" },
          ],
          rows,
        },
        children: [],
      },
      source: sourceElement(output),
    },
  };
}

function deniedSteps(output: unknown): MockStep[] {
  const reason = (output as MetricOutput).error ?? "ไม่มีสิทธิ์เข้าถึง";
  return [
    { text: `ข้อมูลชุดนี้อยู่นอกขอบเขตสิทธิ์ของคุณครับ (${reason}) ผมส่งเรื่องให้ผู้รับผิดชอบพื้นที่นั้นแทนได้` },
  ];
}

function salesSteps(prompt: string): MockStep[] {
  return [
    {
      tool: "query_metric",
      input: {
        metric: "net_sales_volume",
        dims: ["region"],
        filters: regionFilter(prompt),
        range: { from: MONTH_START, to: TODAY },
        grain: "month",
        compare: "target",
        limit: 10,
      },
      then: (output) => [{ text: "ยอดขายสุทธิเดือนนี้เทียบเป้าครับ ดูรายละเอียดในการ์ด" }, { spec: salesSpec(output) }],
      onError: deniedSteps,
    },
  ];
}

const AGENT_STEPS: MockStep[] = [
  {
    tool: "query_metric",
    input: {
      metric: "net_sales_volume",
      dims: ["agent"],
      filters: {},
      range: { from: MONTH_START, to: TODAY },
      grain: "month",
      compare: "prev_period",
      limit: 10,
    },
    then: (output) => [{ text: "นี่คือเอเย่นต์เรียงตามยอดขายพร้อมส่วนต่างเทียบงวดก่อนครับ" }, { spec: agentSpec(output) }],
    onError: deniedSteps,
  },
];

const SALARY_STEPS: MockStep[] = [
  {
    tool: "query_metric",
    input: {
      metric: "avg_salary",
      dims: ["department"],
      filters: {},
      range: { from: MONTH_START, to: TODAY },
      grain: "month",
      compare: "none",
      limit: 10,
    },
    then: (output) => [{ text: "เงินเดือนเฉลี่ยเป็นข้อมูลที่ถูกปิดตามสิทธิ์ของคุณครับ" }, { spec: salarySpec(output) }],
    onError: deniedSteps,
  },
];

const HANDOFF_STEPS: MockStep[] = [
  {
    tool: "resolve_owner",
    input: { metric: "campaign_uplift", dims: { region: "northeast" } },
    then: (output) => {
      const owner = (output as OwnerOutput).data;
      return [
        { text: `ผู้รับผิดชอบคือ ${owner?.nameTh ?? "ไม่ทราบ"} ครับ ผมจะส่งงานนี้ให้ กดอนุมัติเพื่อยืนยัน` },
        {
          tool: "create_handoff",
          input: {
            toUserId: owner?.userId ?? "u_pim",
            title: "ยอดขายภาคอีสานต่ำกว่าเป้า",
            ask: "ช่วยตรวจสอบเอเย่นต์ที่ยอดตกในภาคอีสานและเสนอแผนแก้ไขภายในสัปดาห์นี้",
            urgency: "high",
            evidence: [
              {
                metric: "net_sales_volume",
                dims: ["agent"],
                filters: { region: ["northeast"] },
                range: { from: MONTH_START, to: TODAY },
                grain: "month",
                compare: "prev_period",
                limit: 10,
              },
            ],
            alertIds: [],
          },
          then: (result) => [{ text: `ส่งงานเรียบร้อยครับ (${(result as { summary?: string }).summary ?? "สร้างแพ็กเกจงานแล้ว"})` }],
          onError: (result) => [{ text: `ส่งงานไม่สำเร็จครับ: ${(result as { error?: string }).error ?? "ไม่ทราบสาเหตุ"}` }],
        },
      ];
    },
  },
];

export const COP_MOCK_PROMPTS = [
  "ยอดขายเดือนนี้เป็นอย่างไร",
  "ยอดขายภาคใต้",
  "เอเย่นต์รายไหนยอดตกบ้าง top 10",
  "เงินเดือนเฉลี่ยแต่ละฝ่าย",
  "ส่งต่องานให้ผู้รับผิดชอบ",
];

/** Scripted turns that drive the real tools: the mock calls a tool, the handler executes it, the continuation renders the output. */
export const COP_MOCK_SCRIPT: MockScript = {
  turns: [
    { match: /ส่งต่อ|handoff/i, steps: HANDOFF_STEPS },
    { match: /สิทธิ์|เงินเดือน|salary/i, steps: SALARY_STEPS },
    { match: /เอเย่นต์.*ตก|top ?10/i, steps: AGENT_STEPS },
    { match: /ยอดขาย|ยอดรวม/, steps: salesSteps },
  ],
  prompts: COP_MOCK_PROMPTS,
};
