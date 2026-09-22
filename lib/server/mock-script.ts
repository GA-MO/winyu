import type { MockScript, MockStep } from "vexa/mock";
import type { Spec, SpecElement } from "vexa/protocol";
import { formatDateTh, periodLabelTh } from "@/lib/i18n/format";

const TODAY = "2026-09-22";
const MONTH_START = "2026-09-01";
const QUARTER_START = "2026-07-01";
const YEAR_START = "2026-01-01";
const RECENT_START = "2026-08-15";
const WEEK_START = "2026-09-16";
const COVER_THRESHOLD = 10;
const MAX_ALERTS = 3;
const MAX_FORECAST_WEEKS = 8;
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

const BRAND_CODES: [RegExp, string][] = [
  [/ปุระ|purra|น้ำแร่/i, "purra"],
  [/ลีโอ|leo/i, "leo"],
  [/โซดา|soda/i, "singha_soda"],
  [/สิงห์|singha/i, "singha"],
];

function brandOf(prompt: string): string | null {
  return BRAND_CODES.find(([pattern]) => pattern.test(prompt))?.[1] ?? null;
}

function brandFilter(prompt: string): Record<string, string[]> {
  const brand = brandOf(prompt);
  return brand ? { brand: [brand] } : {};
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

type AlertRow = { id?: string; severity?: string; metric?: string; hypothesis?: string; verifySteps?: string[]; scope?: Record<string, string> };
type AlertOutput = { ok?: boolean; summary?: string; data?: AlertRow[] };
type ForecastPoint = { week?: string; value?: number; lo?: number; hi?: number };
type ForecastOutput = { ok?: boolean; summary?: string; data?: ForecastPoint[] };

const SEVERITY_TONES: Record<string, string> = { P1: "danger", P2: "warning", P3: "info" };

function alertRowsOf(output: unknown, focus: string | null = null): AlertRow[] {
  const data = (output as AlertOutput).data;
  if (!Array.isArray(data)) return [];
  const focused = focus ? data.filter((row) => JSON.stringify(row.scope ?? {}).includes(focus)) : [];
  return (focused.length > 0 ? focused : data).slice(0, MAX_ALERTS);
}

function forecastPointsOf(output: unknown): ForecastPoint[] {
  const data = (output as ForecastOutput).data;
  return Array.isArray(data) ? data.slice(0, MAX_FORECAST_WEEKS) : [];
}

function periodLabels(rows: Row[], key: string): string[] {
  return rows.map((row) => periodLabelTh(String(row[key] ?? "")));
}

function trendSpec(output: unknown, title: string, timeKey: string, seriesName: string): Spec {
  const rows = rowsOf(output);
  return {
    root: "card",
    elements: {
      card: { type: "Card", props: { title, description: summaryOf(output) }, children: ["chart", "source"] },
      chart: {
        type: "LineChart",
        props: {
          title: null,
          labels: periodLabels(rows, timeKey),
          series: [{ name: seriesName, values: rows.map((row) => numberOf(row, "value")) }],
          area: true,
          showDots: false,
          format: "number",
          height: "md",
        },
        children: [],
      },
      source: sourceElement(output),
    },
  };
}

function yearOverYearSpec(output: unknown): Spec {
  const rows = rowsOf(output);
  return {
    root: "card",
    elements: {
      card: { type: "Card", props: { title: "ยอดขายเทียบช่วงเดียวกันปีก่อน", description: summaryOf(output) }, children: ["chart", "source"] },
      chart: {
        type: "LineChart",
        props: {
          title: null,
          labels: periodLabels(rows, "month"),
          series: [
            { name: "ปีนี้", values: rows.map((row) => numberOf(row, "value")) },
            { name: "ปีที่แล้ว", values: rows.map((row) => numberOf(row, "compare_value")) },
          ],
          area: false,
          showDots: false,
          format: "number",
          height: "md",
        },
        children: [],
      },
      source: sourceElement(output),
    },
  };
}

function overlaySpec(sellIn: unknown, sellOut: unknown): Spec {
  const rows = rowsOf(sellIn);
  const outRows = new Map(rowsOf(sellOut).map((row) => [String(row.agent), numberOf(row, "value")]));
  const labels = rows.map((row) => textOf(row, "agent"));
  return {
    root: "card",
    elements: {
      card: {
        type: "Card",
        props: { title: "ขายเข้าเทียบขายออกรายเอเย่นต์", description: "ขายเข้าต่ำกว่าขายออกแปลว่าเอเย่นต์กำลังระบายสต๊อกที่ค้างอยู่" },
        children: ["chart", "source"],
      },
      chart: {
        type: "BarChart",
        props: {
          title: null,
          labels,
          series: [
            { name: "ขายเข้า", values: rows.map((row) => numberOf(row, "value")) },
            { name: "ขายออก", values: labels.map((label) => outRows.get(label) ?? 0) },
          ],
          horizontal: true,
          stacked: false,
          showValues: false,
          format: "number",
          height: "lg",
        },
        children: [],
      },
      source: sourceElement(sellIn),
    },
  };
}

function alertSpec(output: unknown, focus: string | null = null): Spec {
  const rows = alertRowsOf(output, focus);
  const elements: Record<string, SpecElement> = {
    card: { type: "Card", props: { title: "ความผิดปกติที่ระบบตรวจพบ", description: (output as AlertOutput).summary ?? "" }, children: rows.map((unused, index) => `alert${index}`) },
  };
  rows.forEach((row, index) => {
    elements[`alert${index}`] = {
      type: "Alert",
      props: {
        title: `${row.severity ?? "P3"} · ${row.hypothesis ?? ""}`,
        body: (row.verifySteps ?? []).map((step, order) => `${order + 1}. ${step}`).join(" · "),
        tone: SEVERITY_TONES[row.severity ?? "P3"] ?? "info",
      },
      children: [],
    };
  });
  return { root: "card", elements };
}

function coverSpec(output: unknown): Spec {
  const rows = rowsOf(output).slice(0, MAX_TABLE_ROWS);
  const risky = rows.filter((row) => numberOf(row, "value") < COVER_THRESHOLD);
  const children = risky.length > 0 ? ["alert", "table", "source"] : ["table", "source"];
  const elements: Record<string, SpecElement> = {
    card: { type: "Card", props: { title: "จำนวนวันที่สต๊อกพอขายรายศูนย์กระจายสินค้า", description: summaryOf(output) }, children },
    table: {
      type: "Table",
      props: {
        columns: [
          { key: "dc", label: "ศูนย์กระจายสินค้า" },
          { key: "cover", label: "พอขาย (วัน)" },
        ],
        rows: rows.map((row) => ({ dc: textOf(row, "dc"), cover: textOf(row, "value") })),
      },
      children: [],
    },
    source: sourceElement(output),
  };
  if (risky.length > 0) {
    elements.alert = {
      type: "Alert",
      props: {
        title: `ต่ำกว่าเกณฑ์ ${COVER_THRESHOLD} วัน ${risky.length} แห่ง`,
        body: risky.map((row) => `${textOf(row, "dc")} ${textOf(row, "value")} วัน`).join(" · "),
        tone: "danger",
      },
      children: [],
    };
  }
  return { root: "card", elements };
}

function forecastSpec(output: unknown): Spec {
  const points = forecastPointsOf(output);
  return {
    root: "card",
    elements: {
      card: { type: "Card", props: { title: "พยากรณ์ 8 สัปดาห์ข้างหน้า", description: (output as ForecastOutput).summary ?? "" }, children: ["chart"] },
      chart: {
        type: "LineChart",
        props: {
          title: null,
          labels: points.map((point) => periodLabelTh(String(point.week ?? ""))),
          series: [
            { name: "พยากรณ์", values: points.map((point) => point.value ?? 0) },
            { name: "ขอบล่าง", values: points.map((point) => point.lo ?? 0) },
            { name: "ขอบบน", values: points.map((point) => point.hi ?? 0) },
          ],
          area: false,
          showDots: false,
          format: "number",
          height: "md",
        },
        children: [],
      },
    },
  };
}

function boardSpec(sales: unknown, margin: unknown): Spec {
  const salesRows = rowsOf(sales).slice(0, MAX_METRICS);
  const marginRows = rowsOf(margin).slice(0, MAX_TABLE_ROWS);
  const elements: Record<string, SpecElement> = {
    card: { type: "Card", props: { title: "สรุปเตรียมประชุมบอร์ด", description: summaryOf(sales) }, children: ["grid", "table", "source"] },
    grid: { type: "Grid", props: { columns: "3", gap: "sm" }, children: salesRows.map((unused, index) => `metric${index}`) },
    table: {
      type: "Table",
      props: {
        columns: [
          { key: "unit", label: "กลุ่มธุรกิจ" },
          { key: "margin", label: "กำไรขั้นต้น (%)" },
        ],
        rows: marginRows.map((row) => ({ unit: textOf(row, "business_unit"), margin: textOf(row, "value") })),
      },
      children: [],
    },
    source: sourceElement(sales),
  };
  salesRows.forEach((row, index) => {
    elements[`metric${index}`] = {
      type: "Metric",
      props: { label: textOf(row, "business_unit"), value: textOf(row, "value"), detail: `เทียบปีก่อน ${deltaTextOf(row)}`, trend: trendOf(row) },
      children: [],
    };
  });
  return { root: "card", elements };
}

const YEAR_STEPS: MockStep[] = [
  {
    tool: "query_metric",
    input: {
      metric: "net_sales_volume",
      dims: ["month"],
      filters: {},
      range: { from: YEAR_START, to: TODAY },
      grain: "month",
      compare: "prev_year",
      limit: 12,
    },
    then: (output) => [{ text: "เทียบกับช่วงเดียวกันปีที่แล้วรายเดือนครับ" }, { spec: yearOverYearSpec(output) }],
    onError: deniedSteps,
  },
];

const SELL_THROUGH_STEPS: MockStep[] = [
  {
    tool: "query_metric",
    input: {
      metric: "net_sales_volume",
      dims: ["agent"],
      filters: {},
      range: { from: RECENT_START, to: TODAY },
      grain: "month",
      compare: "none",
      limit: 8,
    },
    then: (sellIn) => [
      {
        tool: "query_metric",
        input: {
          metric: "sell_out_volume",
          dims: ["agent"],
          filters: {},
          range: { from: RECENT_START, to: TODAY },
          grain: "month",
          compare: "none",
          limit: 8,
        },
        then: (sellOut) => [
          { text: "เทียบขายเข้ากับขายออกของเอเย่นต์ในขอบเขตของคุณครับ ถ้าขายเข้าต่ำกว่าขายออกแปลว่ากำลังระบายสต๊อกที่ค้าง" },
          { spec: overlaySpec(sellIn, sellOut) },
        ],
        onError: deniedSteps,
      },
    ],
    onError: deniedSteps,
  },
];

function alertSteps(prompt: string): MockStep[] {
  const focus = brandOf(prompt);
  return [
    {
      tool: "get_alerts",
      input: { status: "open", limit: 20 },
      then: (output) => {
        const rows = alertRowsOf(output, focus);
        if (rows.length === 0) return [{ text: "ตอนนี้ยังไม่มีความผิดปกติที่เปิดอยู่ในขอบเขตของคุณครับ" }];
        return [
          { text: `ผมเจอ ${rows.length} เรื่องที่ควรดูครับ แต่ละเรื่องมีสมมติฐานและวิธีตรวจสองทาง` },
          { spec: alertSpec(output, focus) },
          { text: "ถ้าต้องการ ผมส่งเรื่องให้ผู้รับผิดชอบพร้อมหลักฐานได้เลย บอกว่า “ส่งต่องานให้ผู้รับผิดชอบ” ได้ครับ" },
        ];
      },
    },
  ];
}

function coverSteps(prompt: string): MockStep[] {
  return [
    {
      tool: "query_metric",
      input: {
        metric: "days_of_cover",
        dims: ["dc"],
        filters: brandFilter(prompt),
        range: { from: WEEK_START, to: TODAY },
        grain: "day",
        compare: "none",
        limit: 10,
      },
      then: (output) => [{ text: `จำนวนวันที่สต๊อกพอขายล่าสุด เกณฑ์เตือนคือ ${COVER_THRESHOLD} วันครับ` }, { spec: coverSpec(output) }],
      onError: deniedSteps,
    },
  ];
}

const FORECAST_STEPS: MockStep[] = [
  {
    tool: "get_forecast",
    input: { metric: "net_sales_volume", dims: {}, weeks: MAX_FORECAST_WEEKS },
    then: (output) => {
      const points = forecastPointsOf(output);
      if (points.length === 0) return [{ text: "ยังไม่มีพยากรณ์สำหรับมิตินี้ครับ ลองให้ระบบรันงานพยากรณ์ก่อน" }];
      return [{ text: "พยากรณ์ Holt-Winters พร้อมช่วงความเชื่อมั่นครับ ค่า MAPE อยู่ในคำอธิบายการ์ด" }, { spec: forecastSpec(output) }];
    },
  },
];

const BOARD_STEPS: MockStep[] = [
  {
    tool: "query_metric",
    input: {
      metric: "net_sales_value",
      dims: ["business_unit"],
      filters: {},
      range: { from: QUARTER_START, to: TODAY },
      grain: "month",
      compare: "prev_year",
      limit: 6,
    },
    then: (sales) => [
      {
        tool: "query_metric",
        input: {
          metric: "gross_margin",
          dims: ["business_unit"],
          filters: {},
          range: { from: QUARTER_START, to: TODAY },
          grain: "month",
          compare: "none",
          limit: 6,
        },
        then: (margin) => [
          { text: "สรุปไตรมาสนี้สำหรับบอร์ดครับ มูลค่าขายแยกกลุ่มธุรกิจเทียบปีก่อน และกำไรขั้นต้นของแต่ละกลุ่ม" },
          { spec: boardSpec(sales, margin) },
        ],
        onError: deniedSteps,
      },
    ],
    onError: deniedSteps,
  },
];

const PRELOAD_STEPS: MockStep[] = [
  {
    tool: "get_alerts",
    input: { status: "open", limit: 3 },
    then: (output) => [
      {
        tool: "query_metric",
        input: {
          metric: "days_of_cover",
          dims: ["dc"],
          filters: {},
          range: { from: WEEK_START, to: TODAY },
          grain: "day",
          compare: "none",
          limit: 10,
        },
        then: (cover) => [
          { text: "ผมดึงข้อมูลของงานที่ส่งมาให้แล้วครับ ทั้งความผิดปกติที่เกี่ยวข้องและสต๊อกล่าสุดตามสิทธิ์ของคุณ" },
          { spec: coverSpec(cover) },
          {
            text: "มีสองทางเลือกครับ (1) ย้ายสต๊อกจากศูนย์ที่ยังพอขายเกิน 20 วันมาเติมภายใน 3 วัน ใช้ค่าขนส่งเพิ่มแต่ไม่กระทบแผนผลิต (2) เพิ่มรอบผลิตในสัปดาห์หน้า ของถึงช้ากว่า 5 วันแต่ต้นทุนต่ำกว่า ผมเสนอทางที่ 1 ถ้าจะให้ส่งเรื่องกลับไปแจ้งผู้ส่งงาน บอกผมได้เลย",
          },
        ],
        onError: (cover) => [{ text: "ผมเปิดงานที่ส่งมาให้แล้ว แต่หลักฐานบางส่วนอยู่นอกสิทธิ์ของคุณครับ" }, ...deniedSteps(cover)],
      },
    ],
  },
];

export const COP_MOCK_PROMPTS = [
  "ยอดขายเดือนนี้เทียบเป้าแยกตามภาค",
  "ยอดขายภาคอีสานเทียบเป้า",
  "เอเย่นต์รายไหนยอดตกบ้าง top 10",
  "เทียบปีที่แล้วเป็นอย่างไร",
  "เทียบยอดขายเข้ากับยอดขายออกของเอเย่นต์",
  "มีอะไรผิดปกติบ้างวันนี้",
  "ปุระขายดีผิดปกติที่ไหน",
  "สต๊อกปุระพอขายอีกกี่วัน",
  "พยากรณ์ยอดขาย 8 สัปดาห์ข้างหน้า",
  "เตรียมประชุมบอร์ด",
  "เงินเดือนเฉลี่ยแต่ละฝ่าย",
  "ส่งต่องานให้ผู้รับผิดชอบ",
];

/** Scripted turns that drive the real tools: the mock calls a tool, the handler executes it, the continuation renders the output. */
export const COP_MOCK_SCRIPT: MockScript = {
  turns: [
    { match: /งานที่ส่งต่อมา|เปิดในเอเจนต์/, steps: PRELOAD_STEPS },
    { match: /ส่งต่อ|handoff/i, steps: HANDOFF_STEPS },
    { match: /สิทธิ์|เงินเดือน|salary/i, steps: SALARY_STEPS },
    { match: /บอร์ด|board|ประชุมผู้บริหาร/i, steps: BOARD_STEPS },
    { match: /พยากรณ์|forecast|อีกกี่สัปดาห์/i, steps: FORECAST_STEPS },
    { match: /สต๊อก|คงคลัง|พอขาย|cover|stock/i, steps: coverSteps },
    { match: /ผิดปกติ|ทำไม.*ตก|แจ้งเตือน|ขายดี|alert/i, steps: alertSteps },
    { match: /ขายเข้า.*ขายออก|sell-?in.*sell-?out/i, steps: SELL_THROUGH_STEPS },
    { match: /ปีที่แล้ว|ปีก่อน|year ?over ?year|yoy/i, steps: YEAR_STEPS },
    { match: /เอเย่นต์.*ตก|top ?10|เอเย่นต์รายไหน/i, steps: AGENT_STEPS },
    { match: /ยอดขาย|ยอดรวม/, steps: salesSteps },
  ],
  prompts: COP_MOCK_PROMPTS,
};
