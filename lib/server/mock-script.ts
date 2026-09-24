import type { MockScript, MockStep } from "vexa/mock";
import type { Spec, SpecElement } from "vexa/protocol";
import { formatDateTh, formatPercent, periodLabelTh } from "@/lib/i18n/format";
import { TH } from "@/lib/i18n/th";
import { GENERATOR_DICTIONARY } from "@/lib/data/master";
import { peopleSteps, profileSteps } from "./mock-people";
import { siteSteps } from "./mock-sites";
import { candidateSteps, courseSteps, policySteps } from "./mock-hr";

const TODAY = "2026-09-22";
const MONTH_START = "2026-09-01";
const QUARTER_START = "2026-07-01";
const LAST_AUDIT_MONTH = { from: "2026-08-01", to: "2026-08-31" };
const YEAR_START = "2026-01-01";
const RECENT_START = "2026-08-15";
const WEEK_START = "2026-09-16";
const COVER_THRESHOLD = 10;
const MAX_ALERTS = 3;
const MAX_FORECAST_WEEKS = 8;
const MAX_METRICS = 3;
const MAX_TABLE_ROWS = 8;
const NEUTRAL_BAND_PCT = 2;
const PERCENT = 100;

type Row = Record<string, string | number | null>;
type Headline = {
  aggregate?: "sum" | "average";
  value?: string;
  periodLabel?: string;
  rowCount?: number;
  deltaPercent?: number | null;
  compareLabel?: string | null;
};
type MetricOutput = {
  ok?: boolean;
  rows?: Row[];
  summary?: string;
  error?: string;
  headline?: Headline;
  provenance?: { sourceSystem?: string; certified?: boolean; asOf?: string; masked?: string[] };
};
type Tone = "good" | "bad" | "neutral";
type Direction = "up" | "down" | "neutral";
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

function provenanceText(output: unknown): string | null {
  const provenance = (output as MetricOutput).provenance;
  if (!provenance?.asOf) return null;
  return `${provenance.sourceSystem} · ${provenance.certified ? "รับรองแล้ว" : "คำนวณ"} · ณ ${formatDateTh(provenance.asOf)}`;
}

function headlineOf(output: unknown): Headline {
  return (output as MetricOutput).headline ?? {};
}

function directionOf(deltaPercent: number | null | undefined): Direction {
  if (typeof deltaPercent !== "number" || Math.abs(deltaPercent) < NEUTRAL_BAND_PCT) return "neutral";
  return deltaPercent > 0 ? "up" : "down";
}

function deltaLabel(deltaPercent: number | null | undefined): string | null {
  if (typeof deltaPercent !== "number") return null;
  const rounded = Math.round(deltaPercent * 10) / 10;
  return `${rounded > 0 ? "+" : ""}${formatPercent(rounded)}`;
}

const HANDOFF_SENT = "ส่งแล้วครับ ติดตามสถานะได้ใน Inbox เมื่อมีการตอบกลับผมจะแจ้งให้ทราบ";

function behindTargetText(rows: Row[]): string | null {
  return laggardText(rows, "region", "ภาคที่ห่างเป้ามากที่สุด", "ภาคที่เกินเป้าน้อยที่สุด");
}

function agentLead(output: unknown): string {
  const rows = rowsOf(output);
  const phrase = laggardText(rows, "agent", "เอเย่นต์ที่ตกแรงที่สุด", "ไม่มีเอเย่นต์รายไหนยอดตกครับ ตัวที่โตน้อยที่สุด");
  if (!phrase) return "นี่คือเอเย่นต์ในขอบเขตของคุณ เรียงจากที่ตกแรงที่สุดครับ";
  return `${phrase} เทียบงวดก่อนครับ ผมเรียงทั้ง ${rows.length} รายจากตกแรงไปหาน้อย`;
}

function salaryLead(output: unknown): string {
  const masked = maskedCount(output);
  if (masked > 0) return `เงินเดือนเฉลี่ยมี ${masked} ฟิลด์ที่ถูกปิดตามสิทธิ์ของคุณครับ ผมแสดงเท่าที่เปิดให้เห็นได้`;
  const top = topValueText(rowsOf(output), "department");
  return sentences([headlineLead(output, "เงินเดือนเฉลี่ยทั้งบริษัท", ""), top ? `ฝ่ายที่สูงที่สุดคือ ${top}` : null]);
}

function coverLead(output: unknown): string {
  const rows = rowsOf(output);
  const lowest = extremeRow(rows, "value", "min");
  if (!lowest) return "ยังไม่มีข้อมูลสต๊อกในขอบเขตของคุณครับ";
  const short = rows.filter((row) => numberOf(row, "value") < COVER_THRESHOLD).length;
  const lead = `ศูนย์ที่เหลือน้อยที่สุดคือ ${textOf(lowest, "dc")} ${valueTextOf(lowest)} จากเกณฑ์ ${COVER_THRESHOLD} วันครับ`;
  return sentences([lead, short > 0 ? `มี ${short} ศูนย์ที่ต่ำกว่าเกณฑ์` : null]);
}

function sellThroughLead(sellIn: unknown, sellOut: unknown): string {
  const soldOut = new Map(rowsOf(sellOut).map((row) => [String(row.agent), numberOf(row, "value")]));
  const destocking = rowsOf(sellIn).filter((row) => numberOf(row, "value") < (soldOut.get(String(row.agent)) ?? 0));
  if (destocking.length === 0) return "ทุกเอเย่นต์สั่งเข้ามากกว่าที่ขายออกได้ครับ แปลว่าสต๊อกที่เอเย่นต์กำลังสะสมขึ้น";
  return `${destocking.length} เอเย่นต์สั่งเข้าน้อยกว่าที่ขายออกครับ แปลว่ากำลังระบายสต๊อกที่ค้างอยู่ ไม่ใช่ดีมานด์ที่หายไป`;
}

function forecastLead(points: ForecastPoint[]): string {
  const first = points[0]?.value ?? 0;
  const last = points[points.length - 1]?.value ?? 0;
  if (first === 0) return "พยากรณ์แปดสัปดาห์ข้างหน้าครับ เส้นประคือช่วงความเชื่อมั่น";
  const change = ((last - first) / Math.abs(first)) * PERCENT;
  const direction = change < 0 ? "ลดลง" : "เพิ่มขึ้น";
  return `แปดสัปดาห์ข้างหน้าแนวโน้ม${direction} ${formatPercent(Math.abs(Math.round(change * 10) / 10))} จากสัปดาห์แรกถึงสัปดาห์สุดท้ายครับ เส้นประคือช่วงความเชื่อมั่น`;
}

function boardLead(sales: unknown, margin: unknown): string {
  const laggard = laggardText(rowsOf(sales), "business_unit", "กลุ่มที่ฉุดมากที่สุด", "กลุ่มที่โตช้าที่สุด");
  const best = topValueText(rowsOf(margin), "business_unit");
  return sentences([
    headlineLead(sales, "มูลค่าขายไตรมาสนี้", "ปีก่อน"),
    laggard,
    best ? `กำไรขั้นต้นสูงสุดคือ ${best}` : null,
  ]);
}

function valueTextOf(row: Row): string {
  const labelled = textOf(row, "value_label");
  return labelled === "-" ? textOf(row, "value") : labelled;
}

function extremeRow(rows: Row[], key: string, pick: "min" | "max"): Row | null {
  if (rows.length === 0) return null;
  const ordered = [...rows].sort((left, right) => numberOf(left, key) - numberOf(right, key));
  return pick === "min" ? ordered[0] : ordered[ordered.length - 1];
}

function headlineLead(output: unknown, subject: string, compare: string): string {
  const headline = headlineOf(output);
  const value = headline.value ?? "—";
  const delta = headline.deltaPercent;
  if (typeof delta !== "number") return `${subject}อยู่ที่ ${value} ครับ`;
  const direction = delta < 0 ? "ต่ำกว่า" : "สูงกว่า";
  return `${subject}อยู่ที่ ${value} ${direction}${compare} ${formatPercent(Math.abs(Math.round(delta * 10) / 10))} ครับ`;
}

function laggardRow(rows: Row[]): Row | null {
  if (rows.length < 2) return null;
  const row = extremeRow(rows, "delta_pct", "min");
  return row && typeof row.delta_pct === "number" ? row : null;
}

function laggardText(rows: Row[], key: string, whenDown: string, whenUp: string): string | null {
  const row = laggardRow(rows);
  if (!row) return null;
  const lead = numberOf(row, "delta_pct") < 0 ? whenDown : whenUp;
  return `${lead}คือ ${textOf(row, key)} ${deltaTextOf(row)}`;
}

function topValueText(rows: Row[], key: string): string | null {
  const row = extremeRow(rows, "value", "max");
  return row ? `${textOf(row, key)} ${valueTextOf(row)}` : null;
}

function sentences(parts: (string | null)[]): string {
  return parts.filter(Boolean).join(" ");
}

/** Title, the scope line under it, and the source line at the foot: every chat card wears the same shell. */
function cardProps(title: string, output: unknown, unit: string | null, description: string | null = null) {
  const headline = headlineOf(output);
  const counted = unit && (headline.rowCount ?? 0) > 1 ? `${headline.rowCount} ${unit}` : null;
  const period = headline.periodLabel ?? null;
  return {
    title,
    description,
    meta: [period, counted].filter(Boolean).join(" · ") || null,
    footnote: provenanceText(output),
  };
}

function heroElement(label: string, output: unknown, tone: Tone | null = null): SpecElement {
  const headline = headlineOf(output);
  const delta = headline.deltaPercent ?? null;
  return {
    type: "Metric",
    props: {
      label,
      value: headline.value ?? "—",
      delta: deltaLabel(delta),
      trend: directionOf(delta),
      tone,
      detail: headline.compareLabel ?? null,
      note: null,
      size: "lg",
    },
    children: [],
  };
}

function rankElement(rows: Row[], labelKey: string, tone: Tone | null = null): SpecElement {
  const peak = Math.max(...rows.map((row) => Math.abs(numberOf(row, "value"))), 0);
  return {
    type: "RankList",
    props: {
      showRank: rows.length > 2,
      items: rows.map((row) => ({
        label: textOf(row, labelKey),
        value: textOf(row, "value_label") === "-" ? textOf(row, "value") : textOf(row, "value_label"),
        share: peak === 0 ? null : Math.abs(numberOf(row, "value")) / peak,
        delta: typeof row.delta_pct === "number" ? deltaLabel(row.delta_pct) : null,
        trend: directionOf(typeof row.delta_pct === "number" ? row.delta_pct : null),
        tone,
        note: null,
      })),
    },
    children: [],
  };
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

const SOURCE = { $state: "/tools/query_metric" };
const ALERT_SOURCE = { $state: "/tools/get_alerts" };

/** The model's whole job for a data answer: name the card and point it at the tool result. Cop's presenter draws it. */
function dataCard(title: string, options: { view?: string; sortBy?: string; description?: string; source?: string; with?: string[] } = {}): Spec {
  return {
    root: "card",
    elements: {
      card: {
        type: "DataCard",
        props: {
          title,
          source: options.source ? { $state: options.source } : SOURCE,
          with: options.with ? options.with.map((path) => ({ $state: path })) : null,
          view: options.view ?? "auto",
          sortBy: options.sortBy ?? null,
          description: options.description ?? null,
        },
        children: [],
      },
    },
  };
}

function alertsCard(title: string): Spec {
  return {
    root: "card",
    elements: {
      card: { type: "AlertsCard", props: { title, source: ALERT_SOURCE, description: null }, children: [] },
    },
  };
}

function salesSpec(): Spec {
  return dataCard("ยอดขายสุทธิเทียบเป้า", { sortBy: "value_desc" });
}

function byDeltaAscending(left: Row, right: Row): number {
  return numberOf(left, "delta_pct") - numberOf(right, "delta_pct");
}

function agentSpec(): Spec {
  return dataCard("เอเย่นต์ที่ยอดตกเทียบงวดก่อน", { view: "bar", sortBy: "delta_asc", description: "เรียงจากที่ตกแรงที่สุด แถบคือขนาดยอดขาย" });
}

function salarySpec(): Spec {
  return dataCard("เงินเดือนเฉลี่ยรายฝ่าย");
}

function deniedSteps(output: unknown): MockStep[] {
  const reason = (output as MetricOutput).error ?? "ไม่มีสิทธิ์เข้าถึง";
  return [
    { text: `ข้อมูลชุดนี้อยู่นอกขอบเขตสิทธิ์ของคุณครับ (${reason}) ผมส่งเรื่องให้ผู้รับผิดชอบพื้นที่นั้นแทนได้` },
  ];
}

function salesDimsOf(prompt: string): string[] {
  return /ช่องทาง|channel/i.test(prompt) ? ["channel"] : ["region"];
}

function salesSteps(prompt: string): MockStep[] {
  return [
    {
      tool: "query_metric",
      input: {
        metric: "net_sales_volume",
        dims: salesDimsOf(prompt),
        filters: regionFilter(prompt),
        range: { from: MONTH_START, to: TODAY },
        grain: "month",
        compare: "target",
        limit: 10,
      },
      then: (output) => [
        { text: sentences([headlineLead(output, "ยอดขายสุทธิเดือนนี้", "เป้า"), behindTargetText(rowsOf(output))]) },
        { spec: salesSpec() },
      ],
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
      sort: "delta_asc",
    },
    then: (output) => [{ text: agentLead(output) }, { spec: agentSpec() }],
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
    then: (output) => [{ text: salaryLead(output) }, { spec: salarySpec() }],
    onError: deniedSteps,
  },
];

const PRESSED_ACTION = /⟦action⟧ runTool ([a-z_]+) (\{[\s\S]*\})/;
const PRESSED_DONE: Record<string, string> = {
  create_handoff: HANDOFF_SENT,
  pin_widget: "ปักการ์ดไว้บน Dashboard แล้วครับ กด ⌘D เพื่อเปิดดู",
  send_email: "ส่งอีเมลแล้วครับ ในเดโมนี้จดหมายจะไปอยู่ใน Outbox",
  watch_metric: "ตั้งการเฝ้าดูแล้วครับ ผมจะแจ้งใน Inbox ครั้งแรกที่เข้าเงื่อนไข",
  enroll_course: "ส่งคำขอเข้าอบรมให้หัวหน้าอนุมัติแล้วครับ ระบบกันที่นั่งไว้ให้หนึ่งที่",
  request_leave: "ยื่นใบลาให้หัวหน้าอนุมัติแล้วครับ ติดตามคำตอบได้ใน Inbox",
};

type PressedAction = { tool: string; input: Record<string, unknown> };

function pressedAction(prompt: string): PressedAction | null {
  const match = PRESSED_ACTION.exec(prompt);
  if (!match || !(match[1] in PRESSED_DONE)) return null;
  try {
    const input = JSON.parse(match[2]) as unknown;
    return typeof input === "object" && input !== null ? { tool: match[1], input: input as Record<string, unknown> } : null;
  } catch {
    return null;
  }
}

/** Every button a card offers ends here: the pressed tool runs behind its own approval card, then says what it did. */
function pressedSteps(prompt: string): MockStep[] {
  const pressed = pressedAction(prompt);
  if (!pressed) return HANDOFF_STEPS;
  return [
    {
      tool: pressed.tool,
      input: pressed.input,
      then: () => [{ text: PRESSED_DONE[pressed.tool] }],
      onError: (result) => [{ text: `ทำรายการไม่สำเร็จครับ: ${(result as { error?: string }).error ?? "ไม่ทราบสาเหตุ"}` }],
    },
  ];
}

const HANDOFF_STEPS: MockStep[] = [
  {
    tool: "resolve_owner",
    input: { metric: "campaign_uplift", dims: { region: "northeast" } },
    then: (output) => {
      const owner = (output as OwnerOutput).data;
      return [
        { text: ownerLead(owner) },
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
                sort: "delta_asc",
              },
            ],
            alertIds: [],
          },
          then: () => [{ text: HANDOFF_SENT }],
          onError: (result) => [{ text: `ส่งงานไม่สำเร็จครับ: ${(result as { error?: string }).error ?? "ไม่ทราบสาเหตุ"}` }],
        },
      ];
    },
  },
];

type AlertRow = {
  id?: string;
  severity?: string;
  severityLabel?: string;
  metric?: string;
  metricLabel?: string;
  hypothesis?: string;
  verifySteps?: string[];
  scope?: Record<string, string>;
  scopeLabel?: string;
  observedLabel?: string;
  expectedLabel?: string;
  gapLabel?: string | null;
};
type AlertOutput = { ok?: boolean; summary?: string; rows?: AlertRow[] };
type ForecastPoint = { week?: string; value?: number; lo?: number; hi?: number };
type ForecastOutput = { ok?: boolean; summary?: string; data?: ForecastPoint[] };

const SEVERITY_TONES: Record<string, string> = { P1: "danger", P2: "warning", P3: "info" };

function alertRowsOf(output: unknown, focus: string | null = null): AlertRow[] {
  const data = (output as AlertOutput).rows;
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

function trendSpec(title: string): Spec {
  return dataCard(title, { view: "line" });
}

function yearOverYearSpec(): Spec {
  return dataCard("ยอดขายเทียบช่วงเดียวกันปีก่อน", { view: "line" });
}

function alertLead(output: unknown): string {
  const total = (output as AlertOutput).rows?.length ?? 0;
  return `ตอนนี้มีความผิดปกติที่เปิดอยู่ ${total} เรื่องครับ ผมเรียงตามความรุนแรงและใส่สมมติฐานกับวิธีตรวจไว้ให้ทุกเรื่อง`;
}

function sharedRegionLabel(rows: AlertRow[]): string | null {
  const regions = rows.map((row) => row.scope?.region).filter((region): region is string => Boolean(region));
  if (regions.length !== rows.length || new Set(regions).size !== 1) return null;
  return TH.region[regions[0] as keyof typeof TH.region] ?? null;
}

function alertConclusion(rows: AlertRow[]): string {
  const region = sharedRegionLabel(rows);
  if (!region) return "ผมแนะนำให้เริ่มจากเรื่องที่รุนแรงที่สุด แล้วส่งให้ผู้รับผิดชอบตรวจจากปุ่มบนการ์ดได้เลยครับ";
  return `เรื่องที่รุนแรงที่สุดกระจุกอยู่${region}ทั้งหมด จึงน่าจะมีสาเหตุร่วมกันมากกว่าเป็นเรื่องรายเอเย่นต์ ผมแนะนำให้ส่งให้ผู้รับผิดชอบภาคนั้นตรวจทีเดียวครับ`;
}

function ownerLead(owner: OwnerOutput["data"]): string {
  if (!owner?.nameTh) return "ยังไม่มีผู้รับผิดชอบที่ชัดเจนสำหรับเรื่องนี้ครับ";
  return sentences([
    `ผู้รับผิดชอบเรื่องนี้คือ ${owner.nameTh} ครับ`,
    owner.reason ? `(${owner.reason})` : null,
    "ผมร่างงานไว้ให้แล้ว ดูแล้วกดอนุมัติได้เลย",
  ]);
}

function alertMetaText(row: AlertRow): string | null {
  if (!row.observedLabel || !row.expectedLabel) return null;
  const gap = row.gapLabel ? ` · ห่าง ${row.gapLabel}` : "";
  return `จริง ${row.observedLabel} · คาด ${row.expectedLabel}${gap}`;
}

function alertSpec(): Spec {
  return alertsCard("ความผิดปกติที่ระบบตรวจพบ");
}

function byValueAscending(left: Row, right: Row): number {
  return numberOf(left, "value") - numberOf(right, "value");
}

function coverSpec(): Spec {
  return dataCard("จำนวนวันที่สต๊อกพอขายรายศูนย์กระจายสินค้า", { view: "bar", sortBy: "value_asc", description: `เรียงจากที่เหลือน้อยที่สุด เกณฑ์เตือนคือ ${COVER_THRESHOLD} วัน` });
}

function forecastSpec(output: unknown): Spec {
  const points = forecastPointsOf(output);
  return {
    root: "card",
    elements: {
      card: {
        type: "Card",
        props: { title: "พยากรณ์ 8 สัปดาห์ข้างหน้า", description: null, meta: `${points.length} สัปดาห์`, footnote: (output as ForecastOutput).summary ?? null },
        children: ["chart"],
      },
      chart: {
        type: "LineChart",
        props: {
          title: null,
          labels: points.map((point) => periodLabelTh(String(point.week ?? ""))),
          series: [
            { name: "พยากรณ์", values: points.map((point) => point.value ?? null), style: null },
            { name: "ขอบล่าง", values: points.map((point) => point.lo ?? null), style: "dashed" },
            { name: "ขอบบน", values: points.map((point) => point.hi ?? null), style: "dashed" },
          ],
          area: false,
          showDots: true,
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
    card: { type: "Card", props: cardProps("สรุปเตรียมประชุมบอร์ด", sales, "กลุ่มธุรกิจ"), children: ["hero", "grid", "margin"] },
    hero: heroElement("ปริมาณขายสุทธิ", sales),
    grid: { type: "Grid", props: { columns: "3", gap: "sm" }, children: salesRows.map((unused, index) => `metric${index}`) },
    margin: rankElement(marginRows, "business_unit"),
  };
  salesRows.forEach((row, index) => {
    elements[`metric${index}`] = {
      type: "Metric",
      props: {
        label: textOf(row, "business_unit"),
        value: textOf(row, "value"),
        delta: deltaTextOf(row),
        trend: trendOf(row),
        tone: null,
        detail: "เทียบปีก่อน",
        note: null,
        size: "sm",
      },
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
    then: (output) => [{ text: headlineLead(output, "ยอดขายสะสมปีนี้", "ช่วงเดียวกันปีก่อน") }, { spec: yearOverYearSpec() }],
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
          { text: sellThroughLead(sellIn, sellOut) },
          { spec: dataCard("ขายเข้าเทียบขายออกรายเอเย่นต์", { source: "/tools/query_metric.1", with: ["/tools/query_metric.2"] }) },
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
          { text: alertLead(output) },
          { spec: alertSpec() },
          { text: alertConclusion(rows) },
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
        sort: "value_asc",
      },
      then: (output) => [{ text: coverLead(output) }, { spec: coverSpec() }],
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
      return [{ text: forecastLead(points) }, { spec: forecastSpec(output) }];
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
          { text: boardLead(sales, margin) },
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
          sort: "value_asc",
        },
        then: (cover) => [
          { text: "ผมดึงข้อมูลของงานที่ส่งมาให้แล้วครับ ทั้งความผิดปกติที่เกี่ยวข้องและสต๊อกล่าสุดตามสิทธิ์ของคุณ" },
          { spec: coverSpec() },
          {
            text: "มีสองทางเลือกครับ (1) ย้ายสต๊อกจากศูนย์ที่ยังพอขายเกิน 20 วันมาเติมภายใน 3 วัน ใช้ค่าขนส่งเพิ่มแต่ไม่กระทบแผนผลิต (2) เพิ่มรอบผลิตในสัปดาห์หน้า ของถึงช้ากว่า 5 วันแต่ต้นทุนต่ำกว่า ผมเสนอทางที่ 1 ถ้าจะให้ส่งเรื่องกลับไปแจ้งผู้ส่งงาน บอกผมได้เลย",
          },
        ],
        onError: (cover) => [{ text: "ผมเปิดงานที่ส่งมาให้แล้ว แต่หลักฐานบางส่วนอยู่นอกสิทธิ์ของคุณครับ" }, ...deniedSteps(cover)],
      },
    ],
  },
];

const FOCUS_ALERT_LIMIT = 60;

function scopeHead(row: AlertRow): string {
  return (row.scopeLabel ?? "").split(" · ")[0] ?? "";
}

function alertFocusedBy(output: unknown, prompt: string): AlertRow | null {
  const rows = (output as AlertOutput).rows;
  if (!Array.isArray(rows)) return null;
  return rows.find((row) => row.scopeLabel && prompt.includes(row.scopeLabel)) ?? rows.find((row) => scopeHead(row) && prompt.includes(scopeHead(row))) ?? null;
}

function focusedAlertLead(row: AlertRow): string {
  const gap = row.gapLabel ? ` ห่าง ${row.gapLabel}` : "";
  return `${row.scopeLabel}: ${row.metricLabel} จริง ${row.observedLabel} เทียบที่ควรเป็น ${row.expectedLabel}${gap} ครับ`;
}

function focusedAlertNext(row: AlertRow): string {
  const steps = (row.verifySteps ?? []).map((step, index) => `${index + 1}) ${step}`).join(" ");
  return sentences([
    steps ? `ควรตรวจตามนี้: ${steps}` : null,
    "ถ้าจะให้ผู้รับผิดชอบตรวจต่อ ส่งต่อจาก Inbox ได้เลยครับ",
  ]);
}

function focusedAlertSpec(row: AlertRow): Spec {
  const gap = row.gapLabel ? ` · ห่าง ${row.gapLabel}` : "";
  return {
    root: "alert",
    elements: {
      alert: {
        type: "Alert",
        props: {
          title: `${row.severityLabel ?? ""} · ${row.scopeLabel ?? ""}`,
          meta: `จริง ${row.observedLabel} · คาด ${row.expectedLabel}${gap}`,
          body: row.hypothesis ?? null,
          tone: SEVERITY_TONES[row.severity ?? ""] ?? "warning",
        },
        children: [],
      },
    },
  };
}

function focusedAlertSteps(prompt: string): MockStep[] {
  return [
    {
      tool: "get_alerts",
      input: { status: "open", limit: FOCUS_ALERT_LIMIT },
      then: (output) => {
        const row = alertFocusedBy(output, prompt);
        if (!row) return [{ text: alertLead(output) }, { spec: alertSpec() }, { text: alertConclusion(alertRowsOf(output)) }];
        return [{ text: focusedAlertLead(row) }, { spec: focusedAlertSpec(row) }, { text: focusedAlertNext(row) }];
      },
    },
  ];
}

type MetricAsk = {
  metric: string;
  dims: string[];
  from: string;
  grain: "day" | "week" | "month";
  compare: "none" | "prev_period" | "prev_year" | "target";
  title: string;
  subject: string;
  versus: string;
  view?: string;
  sortBy?: string;
  limit?: number | null;
};

function metricAskSteps(ask: MetricAsk): MockStep[] {
  return [
    {
      tool: "query_metric",
      input: { metric: ask.metric, dims: ask.dims, filters: {}, range: { from: ask.from, to: TODAY }, grain: ask.grain, compare: ask.compare, limit: ask.limit === undefined ? 10 : ask.limit, sort: ask.sortBy ?? null },
      then: (output) => [{ text: headlineLead(output, ask.subject, ask.versus) }, { spec: dataCard(ask.title, { view: ask.view, sortBy: ask.sortBy }) }],
      onError: deniedSteps,
    },
  ];
}

const MARGIN_STEPS = metricAskSteps({
  metric: "gross_margin", dims: ["business_unit"], from: QUARTER_START, grain: "month", compare: "prev_period",
  title: "อัตรากำไรขั้นต้นรายกลุ่มธุรกิจไตรมาสนี้", subject: "อัตรากำไรขั้นต้นไตรมาสนี้", versus: "ไตรมาสก่อน", sortBy: "value_desc",
});

const RECEIVABLES_STEPS = metricAskSteps({
  metric: "ar_overdue", dims: ["region"], from: MONTH_START, grain: "month", compare: "prev_period",
  title: "ลูกหนี้ค้างชำระรายภาค", subject: "ลูกหนี้ค้างชำระ", versus: "เดือนก่อน", sortBy: "value_desc",
});

const TARGET_GAP_STEPS = metricAskSteps({
  metric: "target_attainment", dims: ["region"], from: MONTH_START, grain: "month", compare: "none",
  title: "ภาคที่ห่างเป้ามากที่สุดเดือนนี้", subject: "ยอดเทียบเป้าเดือนนี้", versus: "เป้า", view: "bar", sortBy: "value_asc",
});

const MY_AGENTS_STEPS = metricAskSteps({
  metric: "net_sales_volume", dims: ["agent"], from: MONTH_START, grain: "month", compare: "prev_period",
  title: "ยอดของเอเย่นต์ที่คุณดูแลเดือนนี้", subject: "ยอดรวมของเอเย่นต์ที่คุณดูแลเดือนนี้", versus: "เดือนก่อน", view: "bar", sortBy: "value_desc",
});

const BUDGET_STEPS = metricAskSteps({
  metric: "net_sales_value", dims: ["business_unit"], from: MONTH_START, grain: "month", compare: "target",
  title: "ยอดขายจริงเทียบงบรายกลุ่มธุรกิจ", subject: "ยอดขายเดือนนี้", versus: "งบ", sortBy: "value_desc",
});

const ATTRITION_STEPS = metricAskSteps({
  metric: "attrition_rate", dims: ["department"], from: MONTH_START, grain: "month", compare: "prev_year",
  title: "อัตราการลาออกรายฝ่ายเดือนนี้", subject: "อัตราการลาออกเดือนนี้", versus: "ปีที่แล้ว", sortBy: "value_desc",
});

const CAMPAIGN_STEPS = metricAskSteps({
  metric: "campaign_uplift", dims: ["campaign"], from: QUARTER_START, grain: "month", compare: "none",
  title: "แคมเปญที่ยกยอดขายได้มากที่สุดไตรมาสนี้", subject: "ยอดเพิ่มจากแคมเปญไตรมาสนี้", versus: "เส้นฐาน", view: "bar", sortBy: "value_desc",
});

const HEADCOUNT_STEPS = metricAskSteps({
  metric: "headcount", dims: ["department"], from: MONTH_START, grain: "month", compare: "prev_year",
  title: "จำนวนพนักงานรายฝ่ายเทียบปีที่แล้ว", subject: "จำนวนพนักงานทั้งหมด", versus: "ปีที่แล้ว", view: "bar", sortBy: "value_desc",
});

const SIX_MONTHS_START = "2026-03-01";

const REGION_MONTHLY_STEPS = metricAskSteps({
  metric: "net_sales_volume", dims: ["month", "region"], from: SIX_MONTHS_START, grain: "month", compare: "none",
  title: "ยอดขายเข้ารายเดือน แต่ละภาคมีส่วนเท่าไหร่", subject: "ยอดขายเข้า 6 เดือนล่าสุด", versus: "", limit: null,
});

const PROVINCE_ATTAINMENT_STEPS = metricAskSteps({
  metric: "target_attainment", dims: ["province"], from: MONTH_START, grain: "month", compare: "prev_period",
  title: "จังหวัดที่ยอดเทียบเป้าแย่ลงเดือนนี้", subject: "ยอดเทียบเป้าเดือนนี้", versus: "เดือนก่อน", limit: null,
});

const REGION_CHANNEL_STEPS = metricAskSteps({
  metric: "net_sales_volume", dims: ["region", "channel"], from: MONTH_START, grain: "month", compare: "prev_period",
  title: "ภาคไหน ช่องทางไหน ที่ยอดเปลี่ยนมากที่สุด", subject: "ยอดขายเข้าเดือนนี้", versus: "เดือนก่อน", limit: null,
});

type PairedAsk = { metric: string; dims: string[] };

function pairedSteps(asks: PairedAsk[], range: { from: string; to: string }, title: string, lead: string, done: unknown[] = []): MockStep[] {
  const [ask, ...rest] = asks;
  const paths = [...done, null].map((_, index) => `/tools/query_metric.${index + 1}`);
  return [
    {
      tool: "query_metric",
      input: { metric: ask.metric, dims: ask.dims, filters: {}, range, grain: "month", compare: "none", limit: null },
      then: (output) =>
        rest.length > 0
          ? pairedSteps(rest, range, title, lead, [...done, output])
          : [{ text: lead }, { spec: dataCard(title, { source: paths[0], with: paths.slice(1) }) }],
      onError: deniedSteps,
    },
  ];
}

const FLOW_STEPS = pairedSteps(
  [{ metric: "production_output", dims: [] }, { metric: "net_sales_volume", dims: [] }, { metric: "sell_out_volume", dims: [] }],
  LAST_AUDIT_MONTH,
  "เบียร์ที่ผลิตเดือน ส.ค. ไปถึงร้านค้าเท่าไหร่",
  "นี่คือเส้นทางจากโรงงานถึงร้านค้าเดือน ส.ค. ครับ ช่องว่างระหว่างขั้นคือสต๊อกที่ค้างอยู่ในคลังหรือที่เอเย่นต์",
);

const SALES_VS_OVERDUE_STEPS = pairedSteps(
  [{ metric: "net_sales_value", dims: ["agent"] }, { metric: "ar_overdue", dims: ["agent"] }],
  LAST_AUDIT_MONTH,
  "เอเย่นต์ที่ขายมาก ค้างชำระมากด้วยไหม",
  "จุดแต่ละจุดคือเอเย่นต์หนึ่งราย ดูรายที่อยู่มุมขวาบน: ขายมากและค้างชำระมาก",
);

const RERUN_ANOMALY_STEPS: MockStep[] = [
  { text: "งานนี้จะรันการตรวจหาความผิดปกติใหม่ทั้งระบบครับ กดอนุมัติเพื่อเริ่ม" },
  {
    tool: "run_job",
    input: { job: "anomaly" },
    then: (output) => [{ text: String((output as { summary?: string }).summary ?? "รันเสร็จแล้วครับ") }],
    onError: (result) => [{ text: `รันงานไม่สำเร็จครับ: ${(result as { error?: string }).error ?? "ไม่ทราบสาเหตุ"}` }],
  },
];

function marketShareSteps(prompt: string): MockStep[] {
  const province = GENERATOR_DICTIONARY.resolveEntity("province", prompt);
  const dims = province ? ["maker"] : ["province"];
  const filters = province ? { province: [province.id] } : {};
  const title = province ? `ส่วนแบ่งตลาดเบียร์ใน${province.label}ทุกผู้ผลิต เทียบปีก่อน` : "ส่วนแบ่งตลาดเบียร์ของเรารายจังหวัด เทียบปีก่อน";
  const subject = province ? `ส่วนแบ่งของเราใน${province.label}เดือน ส.ค.` : "ส่วนแบ่งตลาดเบียร์ของเราเดือน ส.ค.";
  return [
    {
      tool: "query_metric",
      input: { metric: "market_share", dims, filters, range: LAST_AUDIT_MONTH, grain: "month", compare: "prev_year", limit: 30, sort: "delta_asc" },
      then: (output) => [
        { text: headlineLead(output, subject, "ปีก่อน") },
        { spec: dataCard(title, { sortBy: "delta_asc", description: "ข้อมูล retail audit ล่าสุดคือเดือนที่ครบแล้ว เรียงจากที่เสียส่วนแบ่งมากสุด" }) },
      ],
      onError: deniedSteps,
    },
  ];
}

function beerSellOutOfPlaceSteps(prompt: string): MockStep[] {
  const province = GENERATOR_DICTIONARY.resolveEntity("province", prompt);
  const filters = province ? { province: [province.id], business_unit: ["beer"] } : { business_unit: ["beer"] };
  const place = province?.label ?? "พื้นที่ของคุณ";
  return [
    {
      tool: "query_metric",
      input: { metric: "sell_out_volume", dims: ["month"], filters, range: { from: "2026-06-01", to: LAST_AUDIT_MONTH.to }, grain: "month", compare: "prev_year", limit: 12 },
      then: (output) => [
        { text: headlineLead(output, `ยอดขายออกเบียร์ของเราใน${place} มิ.ย.–ส.ค.`, "ช่วงเดียวกันปีก่อน") },
        { spec: dataCard(`ยอดขายออกเบียร์ใน${place}รายเดือน เทียบปีก่อน`, { view: "bar" }) },
      ],
      onError: deniedSteps,
    },
  ];
}

type CalendarRow = { date_label?: string; when_label?: string; name?: string; kind?: string; kind_label?: string; impact_label?: string };

function calendarRows(output: unknown): CalendarRow[] {
  const data = (output as { data?: unknown }).data;
  return Array.isArray(data) ? (data as CalendarRow[]) : [];
}

function calendarLead(output: unknown): string {
  const rows = calendarRows(output);
  const ban = rows.find((row) => row.kind === "alcohol_ban");
  const summary = String((output as { summary?: string }).summary ?? "");
  if (!ban) return `${summary} ครับ`;
  return `${summary} ที่ต้องวางแผนคือ${ban.name} ${ban.date_label} (${ban.when_label}) ครั้งก่อน ${ban.impact_label} ควรให้เอเย่นต์เติมสต๊อกก่อนวันนั้นครับ`;
}

function calendarSpec(output: unknown): Spec {
  const rows = calendarRows(output);
  return {
    root: "card",
    elements: {
      card: { type: "Card", props: { title: "วันที่กระทบยอดขายเบียร์ข้างหน้า", description: null, meta: String((output as { summary?: string }).summary ?? ""), footnote: "ปฏิทินวันห้ามขาย วันหยุด และเทศกาล · ผลกระทบวัดจากข้อมูลขายของครั้งก่อนในขอบเขตของคุณ" }, children: ["timeline"] },
      timeline: {
        type: "Timeline",
        props: { items: rows.map((row) => ({ title: `${row.name ?? ""} · ${row.kind_label ?? ""}`, detail: row.impact_label ?? null, time: `${row.date_label ?? ""} · ${row.when_label ?? ""}` })) },
        children: [],
      },
    },
  };
}

const CALENDAR_STEPS: MockStep[] = [
  {
    tool: "get_calendar",
    input: { from: null, to: null },
    then: (output) => [{ text: calendarLead(output) }, { spec: calendarSpec(output) }],
    onError: (result) => [{ text: `อ่านปฏิทินไม่ได้ครับ: ${(result as { error?: string }).error ?? "ไม่ทราบสาเหตุ"}` }],
  },
];

const TOOL_USAGE_STEPS: MockStep[] = [{ text: "ประวัติการเรียกใช้เครื่องมือทั้งหมดอยู่ที่หน้า Admin → Audit ครับ เปิดดูแยกตามผู้ใช้และเครื่องมือได้ ผมยังไม่มีเครื่องมือสรุปตัวเลขนี้ใน Chat" }];

const WATCH_REQUEST = /เตือน(ฉัน|ผม|หน่อย)?\s*(ถ้า|เมื่อ)|แจ้ง(ฉัน|ผม)?\s*(ถ้า|เมื่อ)|คอยดู|เฝ้าดู/;
const NUMBER = /(\d+(?:\.\d+)?)/;
const WATCH_TITLE_CHARS = 40;
const DEFAULT_LINES = { days_of_cover: 10, target_attainment: 90, ar_overdue: 50_000_000, net_sales_volume: 10 } as const;

type WatchMetric = keyof typeof DEFAULT_LINES;

function watchMetricOf(prompt: string): WatchMetric {
  if (/สต๊อก|พอขาย|cover/i.test(prompt)) return "days_of_cover";
  if (/เป้า/.test(prompt)) return "target_attainment";
  if (/ลูกหนี้|ค้างชำระ/.test(prompt)) return "ar_overdue";
  return "net_sales_volume";
}

function watchKindOf(prompt: string, metric: WatchMetric): "below" | "above" | "change" {
  if (metric === "net_sales_volume") return "change";
  if (/เกิน|สูงกว่า|มากกว่า/.test(prompt)) return "above";
  if (/ต่ำกว่า|น้อยกว่า|ไม่ถึง/.test(prompt)) return "below";
  return metric === "ar_overdue" ? "above" : "below";
}

function watchFilters(prompt: string, metric: WatchMetric): Record<string, string[]> {
  const dc = metric === "days_of_cover" ? GENERATOR_DICTIONARY.resolveEntity("dc", prompt) : null;
  const agent = metric === "net_sales_volume" ? GENERATOR_DICTIONARY.resolveEntity("agent", prompt) : null;
  return { ...regionFilter(prompt), ...brandFilter(prompt), ...(dc ? { dc: [dc.id] } : {}), ...(agent ? { agent: [agent.id] } : {}) };
}

const WATCH_DIMS: Record<WatchMetric, string[]> = { days_of_cover: ["dc", "sku"], target_attainment: ["region"], ar_overdue: ["region"], net_sales_volume: ["agent"] };

function watchTitle(prompt: string): string {
  const title = prompt.replace(WATCH_REQUEST, "").replace(/ให้(หน่อย|ด้วย)|นะ|ครับ|ค่ะ/g, "").trim();
  return title.length > WATCH_TITLE_CHARS ? `${title.slice(0, WATCH_TITLE_CHARS)}…` : title || prompt.slice(0, WATCH_TITLE_CHARS);
}

/** "เตือนฉันถ้า…" becomes a standing watch behind its approval card; the number in the sentence is the line. */
function watchSteps(prompt: string): MockStep[] {
  const metric = watchMetricOf(prompt);
  const found = NUMBER.exec(prompt);
  const value = found ? Number(found[1]) : DEFAULT_LINES[metric];
  return [
    {
      tool: "watch_metric",
      input: {
        title: watchTitle(prompt),
        query: {
          metric,
          dims: WATCH_DIMS[metric],
          filters: watchFilters(prompt, metric),
          range: { from: WEEK_START, to: TODAY },
          grain: metric === "ar_overdue" ? "month" : "day",
          compare: metric === "net_sales_volume" ? "prev_period" : "none",
          limit: null,
        },
        condition: { kind: watchKindOf(prompt, metric), value },
      },
      then: (output) => [{ text: `${(output as { summary?: string }).summary ?? "ตั้งการเฝ้าดูแล้วครับ"} ผมจะแจ้งใน Inbox ครั้งแรกที่เข้าเงื่อนไข` }],
      onError: (result) => [{ text: `ตั้งการเฝ้าดูไม่ได้ครับ: ${(result as { error?: string }).error ?? "ไม่ทราบสาเหตุ"}` }],
    },
  ];
}

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
  "เตือนฉันถ้าสต๊อกดีซีลำพูนพอขายต่ำกว่า 10 วัน",
  "เดือนหน้ามีวันไหนที่กระทบยอดขาย",
  "ทีมขายภาคอีสานมีใครบ้าง",
  "ใบอนุญาตของใครใกล้หมดอายุ",
  "โรงงานไหนเกิดอุบัติเหตุบ้าง",
  "ผู้สมัครพนักงานขายขอนแก่น",
  "มีหลักสูตรอะไรเปิดเดือนนี้",
  "ลาพักร้อนยังไง",
  "ส่วนแบ่งตลาดเทียบคู่แข่ง",
  "ยอดขายรายเดือนแยกภาค 6 เดือนล่าสุด",
  "ยอดเทียบเป้ารายจังหวัด",
  "ยอดขายแต่ละภาคแยกช่องทาง",
  "ผลิต ขายเข้า ขายออก เดือนที่แล้ว",
  "เอเย่นต์ที่ขายมากค้างชำระมากด้วยไหม",
];

/** Scripted turns that drive the real tools: the mock calls a tool, the handler executes it, the continuation renders the output. */
export const COP_MOCK_SCRIPT: MockScript = {
  turns: [
    { match: /งานที่ส่งต่อมา|เปิดในเอเจนต์|เปิดใน Agent/, steps: PRELOAD_STEPS },
    { match: /⟦action⟧ runTool/, steps: pressedSteps },
    { match: WATCH_REQUEST, steps: watchSteps },
    { match: /ส่งต่อ|handoff/i, steps: pressedSteps },
    { match: /^ตรวจความผิดปกติ|^ดูประวัติ|กับพื้นที่อื่น/, steps: focusedAlertSteps },
    { match: /ผู้สมัคร/, steps: candidateSteps },
    { match: /หลักสูตร|อบรม/, steps: courseSteps },
    { match: /ลาพักร้อน|ลาป่วย|ลากิจ|วันลา|ใบลา|สวัสดิการ/, steps: policySteps },
    { match: /วันห้ามขาย|วันพระ|ปฏิทิน|วันหยุด|เทศกาล|วันไหน.*กระทบ|ออกพรรษา/, steps: CALENDAR_STEPS },
    { match: /ส่วนแบ่งตลาด|market share|มาร์เก็ตแชร์|คู่แข่ง|คาราบาว|ช้าง/i, steps: marketShareSteps },
    { match: /ขายออกเบียร์.*ใน.*(ปีก่อน|ปีที่แล้ว)/, steps: beerSellOutOfPlaceSteps },
    { match: /ผลิต.*ขายเข้า.*ขายออก|จากโรงงานถึงร้าน/, steps: FLOW_STEPS },
    { match: /ขาย(มาก|เยอะ).*ค้างชำระ|ยอดขาย.*กับ.*ค้างชำระ/, steps: SALES_VS_OVERDUE_STEPS },
    { match: /รายจังหวัด|แต่ละจังหวัด/, steps: PROVINCE_ATTAINMENT_STEPS },
    { match: /ภาค.*ช่องทาง|ช่องทาง.*ภาค/, steps: REGION_CHANNEL_STEPS },
    { match: /รายเดือน.*(แยก|แต่ละ)ภาค|(แยก|แต่ละ)ภาค.*รายเดือน/, steps: REGION_MONTHLY_STEPS },
    { match: /อุบัติเหตุ|ความปลอดภัย|เกือบเกิดเหตุ|near.?miss/i, steps: siteSteps },
    { match: /โปรไฟล์|ประวัติ(การทำงาน)?(ของ)?คุณ/, steps: profileSteps },
    { match: /ทีม.*(มีใคร|ใครบ้าง)|ลูกทีม|ใบอนุญาต|ใบรับรอง|ใบขับขี่|โอที|เกษียณ|พนักงานใหม่|เพิ่งเข้า|เสี่ยง.*ลาออก/, steps: peopleSteps },
    { match: /สิทธิ์|เงินเดือน|salary/i, steps: SALARY_STEPS },
    { match: /กำไรขั้นต้น|gross margin/i, steps: MARGIN_STEPS },
    { match: /ลาออก|attrition/i, steps: ATTRITION_STEPS },
    { match: /แคมเปญ|campaign/i, steps: CAMPAIGN_STEPS },
    { match: /พนักงาน|headcount/i, steps: HEADCOUNT_STEPS },
    { match: /รันงาน|run_job/i, steps: RERUN_ANOMALY_STEPS },
    { match: /ค้างชำระ|ลูกหนี้/, steps: RECEIVABLES_STEPS },
    { match: /ห่าง(จาก)?เป้า/, steps: TARGET_GAP_STEPS },
    { match: /เอเย่นต์ที่(ผม|ฉัน|คุณ)?ดูแล/, steps: MY_AGENTS_STEPS },
    { match: /งบ.*(จริง|actual)|budget/i, steps: BUDGET_STEPS },
    { match: /เครื่องมือ|audit/i, steps: TOOL_USAGE_STEPS },
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
