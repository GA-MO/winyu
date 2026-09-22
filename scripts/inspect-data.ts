import type { AccessContext, Dim, MetricId, MetricQuery } from "@/lib/contracts";
import { accessFor } from "@/lib/access/policies";
import { INJECTED_ANOMALIES } from "@/lib/data/anomalies";
import { buildTimings, warmAll } from "@/lib/data/cache";
import { DATA_START, MONTH_KEYS, TODAY } from "@/lib/data/dates";
import { findUser } from "@/lib/data/entities/users";
import { runMetric } from "@/lib/data/query";
import { BRAND_INFO } from "@/lib/data/entities/products";
import { PRODUCTION_LINES } from "@/lib/data/entities/supply";
import { productionTables } from "@/lib/data/cache";
import { DAY_COUNT, toDayIndex } from "@/lib/data/dates";

type Probe = {
  anomalyId: string;
  label: string;
  metric: MetricId | "line_output";
  filters: Partial<Record<Dim, string[]>>;
  lineId?: string;
  before: [string, string];
  after: [string, string];
};

const PROBES: Probe[] = [
  {
    anomalyId: "anom_rungrueang_leo620", label: "ส.รุ่งเรือง · ลีโอ 620 · sell-in", metric: "net_sales_volume",
    filters: { agent: ["ag_nea_07"], sku: ["sku_leo_bottle620"] }, before: ["2026-08-12", "2026-09-01"], after: ["2026-09-02", "2026-09-22"],
  },
  {
    anomalyId: "anom_rungrueang_leo620", label: "ส.รุ่งเรือง · ลีโอ 620 · sell-out (ควรทรงตัว)", metric: "sell_out_volume",
    filters: { agent: ["ag_nea_07"], sku: ["sku_leo_bottle620"] }, before: ["2026-08-12", "2026-09-01"], after: ["2026-09-02", "2026-09-22"],
  },
  {
    anomalyId: "anom_purra_pm25_north", label: "เพอร์ร่า 600 · เชียงใหม่+ลำพูน · sell-out", metric: "sell_out_volume",
    filters: { sku: ["sku_purra_pet600"], province: ["pv_chiangmai", "pv_lamphun"] }, before: ["2026-09-13", "2026-09-17"], after: ["2026-09-18", "2026-09-22"],
  },
  {
    anomalyId: "anom_lamphun_purra_cover", label: "DC ลำพูน · เพอร์ร่า 600 · วันครอบคลุม", metric: "days_of_cover",
    filters: { dc: ["dc_lamphun"], sku: ["sku_purra_pet600"] }, before: ["2026-08-15", "2026-08-15"], after: [TODAY, TODAY],
  },
  {
    anomalyId: "anom_northeast_silent_agents", label: "ภาคอีสาน · sell-in ทั้งภาค WoW", metric: "net_sales_volume",
    filters: { region: ["northeast"] }, before: ["2026-09-02", "2026-09-08"], after: ["2026-09-16", "2026-09-22"],
  },
  {
    anomalyId: "anom_cstore_soda_promo", label: "โมเดิร์นเทรด · โซดาสิงห์ 320 · sell-out", metric: "sell_out_volume",
    filters: { channel: ["modern_trade"], sku: ["sku_singha_soda_can320"], region: ["bkk", "central"] },
    before: ["2026-08-18", "2026-09-04"], after: ["2026-09-05", "2026-09-22"],
  },
  {
    anomalyId: "anom_south_ar_overdue", label: "ภาคใต้ · เอเย่นต์เกรด C 3 ราย · ค้างชำระ", metric: "ar_overdue",
    filters: { agent: ["ag_sou_02", "ag_sou_05", "ag_sou_06"] }, before: ["2026-07-01", "2026-07-31"], after: ["2026-08-01", "2026-08-31"],
  },
  {
    anomalyId: "anom_khonkaen_line2", label: "โรงงานขอนแก่น · สายการผลิต 2", metric: "line_output", lineId: "pl_khonkaen_l2",
    filters: {}, before: ["2026-09-07", "2026-09-10"], after: ["2026-09-14", "2026-09-17"],
  },
  {
    anomalyId: "anom_khonkaen_line2", label: "โรงงานขอนแก่น · ปริมาณผลิตรวมทั้งโรงงาน", metric: "production_output",
    filters: { plant: ["pl_khonkaen"] }, before: ["2026-09-07", "2026-09-10"], after: ["2026-09-14", "2026-09-17"],
  },
];

function context(): AccessContext {
  const user = findUser("u_thana");
  if (!user) throw new Error("missing demo user u_thana");
  return accessFor(user);
}

const ACCESS = context();

function value(metric: MetricId, filters: Partial<Record<Dim, string[]>>, from: string, to: string): number {
  const query: MetricQuery = { metric, dims: [], filters, range: { from, to }, grain: "day", compare: "none", limit: null };
  const result = runMetric(query, ACCESS);
  if (!result.ok) throw new Error(`${metric}: ${result.error}`);
  return Number(result.rows[0]?.value ?? 0);
}

const THAI_COMBINING = /[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]/;

function displayWidth(text: string): number {
  return [...text].filter((character) => !THAI_COMBINING.test(character)).length;
}

function pad(text: string, width: number): string {
  const size = displayWidth(text);
  return size >= width ? text : `${text}${" ".repeat(width - size)}`;
}

function padStart(text: string, width: number): string {
  const size = displayWidth(text);
  return size >= width ? text : `${" ".repeat(width - size)}${text}`;
}

function lineOutput(lineId: string, from: string, to: string): number {
  const lineIndex = PRODUCTION_LINES.findIndex((entry) => entry.line.id === lineId);
  const table = productionTables().outputHl;
  let sum = 0;
  for (let day = toDayIndex(from); day <= toDayIndex(to); day += 1) sum += table[lineIndex * DAY_COUNT + day];
  return sum;
}

function probeValue(probe: Probe, window: [string, string]): number {
  if (probe.metric === "line_output") return lineOutput(probe.lineId ?? "", window[0], window[1]);
  return value(probe.metric, probe.filters, window[0], window[1]);
}

function number(value: number, digits = 0): string {
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}

function printMonthlyVolumeByBrand(): void {
  const table = new Map<string, Map<string, number>>();
  for (const info of BRAND_INFO) {
    const query: MetricQuery = {
      metric: "net_sales_volume", dims: ["month"], filters: { brand: [info.id] },
      range: { from: DATA_START, to: TODAY }, grain: "month", compare: "none", limit: null,
    };
    const result = runMetric(query, ACCESS);
    if (!result.ok) throw new Error(result.error);
    for (const row of result.rows) {
      const month = String(row.month);
      const bucket = table.get(month) ?? new Map<string, number>();
      bucket.set(info.nameTh, Number(row.value));
      table.set(month, bucket);
    }
  }
  const brands = BRAND_INFO.map((info) => info.nameTh);
  console.log("\n=== ปริมาณขายเข้ารายเดือนแยกแบรนด์ (เฮกโตลิตร) ===");
  console.log(pad("เดือน", 9) + brands.map((brand) => padStart(brand, 15)).join(""));
  for (const month of MONTH_KEYS) {
    const bucket = table.get(month);
    if (!bucket) continue;
    console.log(pad(month, 9) + brands.map((brand) => padStart(number(bucket.get(brand) ?? 0), 15)).join(""));
  }
}

function printAnomalies(): void {
  console.log("\n=== ความผิดปกติที่ฝังไว้ 7 รายการ (ก่อน → หลัง) ===");
  console.log(pad("สิ่งที่วัด", 46) + padStart("ก่อน", 16) + padStart("หลัง", 16) + padStart("เปลี่ยนแปลง", 14) + "  ทิศทางที่คาด");
  for (const probe of PROBES) {
    const anomaly = INJECTED_ANOMALIES.find((entry) => entry.id === probe.anomalyId);
    const before = probeValue(probe, probe.before);
    const after = probeValue(probe, probe.after);
    const delta = before === 0 ? 0 : ((after - before) / before) * 100;
    const digits = probe.metric === "days_of_cover" ? 1 : 0;
    console.log(
      pad(probe.label, 46) + padStart(number(before, digits), 16) + padStart(number(after, digits), 16) +
      padStart(`${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%`, 14) + `  ${anomaly?.direction ?? "-"}`,
    );
  }
  console.log("");
  for (const anomaly of INJECTED_ANOMALIES) console.log(`  · ${anomaly.id}: ${anomaly.description}`);
}

function printTimings(): void {
  const warmStarted = performance.now();
  warmAll();
  const warmMs = performance.now() - warmStarted;
  const timings = buildTimings();
  console.log("\n=== เวลาในการสร้างข้อมูลและตอบคำถาม ===");
  console.log(`  สร้างทุกตาราง: ${warmMs.toFixed(1)} ms`);
  for (const [name, ms] of Object.entries(timings)) console.log(`    ${pad(name, 18)}${padStart(`${ms.toFixed(1)} ms`, 10)}`);
  const cases: { label: string; query: MetricQuery }[] = [
    { label: "ยอดขายทั้งประเทศแยกแบรนด์", query: { metric: "net_sales_volume", dims: ["brand"], filters: {}, range: { from: DATA_START, to: TODAY }, grain: "month", compare: "none", limit: null } },
    { label: "ยอดขายรายวัน 3 เดือน", query: { metric: "net_sales_volume", dims: ["date"], filters: {}, range: { from: "2026-06-22", to: TODAY }, grain: "day", compare: "prev_period", limit: null } },
    { label: "ยอดขายแยกเอเย่นต์ x แบรนด์", query: { metric: "net_sales_volume", dims: ["agent", "brand"], filters: {}, range: { from: DATA_START, to: TODAY }, grain: "month", compare: "none", limit: 60 } },
    { label: "วันครอบคลุมสต๊อก DC x SKU", query: { metric: "days_of_cover", dims: ["dc", "sku"], filters: {}, range: { from: TODAY, to: TODAY }, grain: "day", compare: "none", limit: 60 } },
    { label: "กำไรขั้นต้นรายเดือนต่อ BU", query: { metric: "gross_margin", dims: ["month", "business_unit"], filters: {}, range: { from: DATA_START, to: TODAY }, grain: "month", compare: "prev_year", limit: null } },
  ];
  for (const entry of cases) {
    const started = performance.now();
    const result = runMetric(entry.query, ACCESS);
    const ms = performance.now() - started;
    const rows = result.ok ? result.rows.length : 0;
    console.log(`  runMetric ${pad(entry.label, 30)}${padStart(`${ms.toFixed(1)} ms`, 9)}  ${rows} แถว`);
  }
}

printTimings();
printMonthlyVolumeByBrand();
printAnomalies();
console.log("");
