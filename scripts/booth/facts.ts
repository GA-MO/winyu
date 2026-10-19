import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Alert, MetricQuery } from "@/lib/contracts";
import { accessFor } from "@/lib/access/policies";
import { findUser } from "@/lib/data/entities/users";
import { AGENTS } from "@/lib/data/entities/agents";
import { addDays, businessDay, DATA_AS_OF } from "@/lib/data/dates";
import { formatDateTh } from "@/lib/i18n/format";
import { runMetric } from "@/lib/server/metrics";
import { GENERATOR_PORTS } from "@/lib/server/ports/generator";
import { assetsOf } from "../mcp-demo-assets";
import { EMPLOYEES } from "@/lib/data/entities/people";
import { GENERATOR_LEAVE } from "@/lib/server/ports/generator-leave";
import { defaultActionsFor } from "@/lib/server/quick-actions";
import { quickActionsFrom } from "@/lib/engine/recommend";
import { seasonalHints } from "@/lib/engine/seasons";

const OUTPUT = path.join(process.cwd(), "film", "facts.json");
const ALERTS = path.join(process.cwd(), ".data", "alerts.json");
const MONTH_START = `${DATA_AS_OF.slice(0, 7)}-01`;
const SPOTLIGHT_REGION = "northeast";
const SPOTLIGHT_LABEL = "ภาคอีสาน";
const VIEWERS = { director: "u_prasit", ceo: "u_thana", rep: "u_nok", hr: "u_may" } as const;
const KEEP_EXISTING = process.argv.includes("--keep");
const COVER_ROWS = 3;
const LEAVE = { from: businessDay(7), to: businessDay(9), reason: "พาครอบครัวไปเที่ยว" };
const KIND_LABELS: Record<string, string> = { notebook: "โน้ตบุ๊ก", phone: "โทรศัพท์", tablet: "แท็บเล็ต" };

const TREND_WEEKS_BACK = 55;
const TEAM_SIZE = 6;
const TEAM_DEPARTMENT = "dept_sales";
const PHOTO_SIZE = 160;
const LEAVE_LABELS: Record<string, string> = { annual: "พักร้อน", personal: "ลากิจ", sick: "ลาป่วย" };

type RegionRow = { region: string; value_label: string; delta_pct: number };
type WeekRow = { week: string; value: number; value_label: string };

const SALES_BY_REGION: MetricQuery = {
  metric: "net_sales_value",
  dims: ["region"],
  filters: {},
  range: { from: MONTH_START, to: DATA_AS_OF },
  grain: "month",
  compare: "prev_period",
  limit: null,
};

async function salesByRegion(userId: string) {
  const user = findUser(userId);
  if (!user) throw new Error(`Unknown persona ${userId}`);
  const result = await runMetric(SALES_BY_REGION, accessFor(user));
  if (!result.ok) throw new Error(`${userId}: ${result.error}`);
  const rows = result.rows as RegionRow[];
  return {
    role: user.title,
    total: result.headline.value,
    delta: result.headline.deltaPercent,
    period: result.headline.periodLabel,
    source: result.provenance.sourceSystem,
    rows: rows.map((row) => ({ label: row.region, value: row.value_label, delta: row.delta_pct })),
  };
}

async function spotlightTrend() {
  const user = findUser(VIEWERS.director);
  if (!user) throw new Error("Unknown director persona");
  const query: MetricQuery = { metric: "net_sales_volume", dims: ["week"], filters: { region: [SPOTLIGHT_REGION] }, range: { from: addDays(DATA_AS_OF, -TREND_WEEKS_BACK), to: DATA_AS_OF }, grain: "week", compare: "none", limit: null };
  const result = await runMetric(query, accessFor(user));
  if (!result.ok) throw new Error(`trend: ${result.error}`);
  const fullWeeks = (result.rows as WeekRow[]).slice(1, -1);
  return { metric: "ปริมาณขาย", unit: "ล้านลิตร", weeks: fullWeeks.map((row) => ({ week: row.week, value: row.value, label: row.value_label })) };
}

async function photoDataUri(publicPath: string): Promise<string> {
  const out = path.join(tmpdir(), `booth-${path.basename(publicPath)}`);
  const resized = Bun.spawnSync(["sips", "-Z", String(PHOTO_SIZE), "-s", "format", "jpeg", path.join(process.cwd(), "public", publicPath), "--out", out], { stdout: "ignore", stderr: "ignore" });
  if (!resized.success) throw new Error(`Could not resize ${publicPath}`);
  return `data:image/jpeg;base64,${readFileSync(out).toString("base64")}`;
}

async function spotlightTeam() {
  const team = EMPLOYEES.filter((employee) => employee.region === SPOTLIGHT_REGION && employee.departmentId === TEAM_DEPARTMENT).slice(0, TEAM_SIZE);
  return Promise.all(team.map(async (employee) => ({ name: employee.nameTh, title: employee.title, photo: await photoDataUri(employee.photo) })));
}

async function repLeaveBalance() {
  const employee = EMPLOYEES.find((entry) => entry.userId === VIEWERS.rep);
  if (!employee) throw new Error("Rep has no HR record");
  const balances = await GENERATOR_LEAVE.balances(employee.id);
  return balances.map((balance) => ({ label: LEAVE_LABELS[balance.kind] ?? balance.kind, left: balance.left, entitled: balance.entitled }));
}

function spotlightAlerts() {
  const alerts = JSON.parse(readFileSync(ALERTS, "utf8")) as Alert[];
  const found = alerts.filter((alert) => alert.severity === "P1" && alert.dims.region === SPOTLIGHT_REGION && alert.dims.agent && alert.direction === "down");
  if (found.length < 2) throw new Error("Expected two P1 drops in the spotlight region");
  return found.slice(0, 2).map((alert) => ({
    agent: AGENTS.find((agent) => agent.id === alert.dims.agent)?.nameTh ?? String(alert.dims.agent),
    since: formatDateTh(alert.window.from),
    hypothesis: alert.hypothesis,
  }));
}

async function spotlightAssets() {
  const { employees } = await GENERATOR_PORTS.directory.load();
  const held = assetsOf(employees).filter((asset) => asset.region === SPOTLIGHT_REGION && asset.status === "in_use");
  const counts = new Map<string, number>();
  for (const asset of held) counts.set(asset.kind, (counts.get(asset.kind) ?? 0) + 1);
  return [...counts].map(([kind, count]) => ({ label: KIND_LABELS[kind] ?? kind, count }));
}

function accessOf(userId: string) {
  const user = findUser(userId);
  if (!user) throw new Error(`Unknown persona ${userId}`);
  return accessFor(user);
}

async function metric(userId: string, query: Omit<MetricQuery, "range" | "grain" | "limit" | "filters">) {
  const result = await runMetric({ filters: {}, range: { from: MONTH_START, to: DATA_AS_OF }, grain: "month", limit: null, ...query } as MetricQuery, accessOf(userId));
  if (!result.ok) throw new Error(`${userId} ${query.metric}: ${result.error}`);
  return result;
}

/** The director's landing chips as the recommender builds them: the first one learned from what he asks, and the first the calendar suggests on the data date. */
function directorChips() {
  const access = accessOf(VIEWERS.director);
  const learned = quickActionsFrom(access, defaultActionsFor(access)).find((action) => action.id.startsWith("qa_learned"));
  const seasonal = seasonalHints(access, Date.parse(`${DATA_AS_OF}T09:00:00+07:00`))[0];
  if (!learned || !seasonal) throw new Error("Expected a learned and a seasonal chip for the director");
  return [learned, seasonal].map((action) => ({ label: action.label, reason: action.reason }));
}

async function channelShare() {
  const result = await metric(VIEWERS.director, { metric: "net_sales_value", dims: ["channel"], compare: "none" });
  const rows = result.rows as { channel: string; value: number; value_label: string }[];
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  return { total: result.headline.value, rows: rows.map((row) => ({ label: row.channel, value: row.value_label, share: Math.round((row.value / total) * 1000) / 10 })) };
}

async function lowestCover() {
  const result = await metric(VIEWERS.director, { metric: "days_of_cover", dims: ["brand"], compare: "none", sort: "value_asc" } as Omit<MetricQuery, "range" | "grain" | "limit" | "filters">);
  const rows = result.rows as { brand: string; value: number; value_label: string }[];
  return { average: result.headline.value, rows: rows.slice(0, COVER_ROWS).map((row) => ({ label: row.brand, days: row.value, value: row.value_label })) };
}

async function monthClose() {
  const result = await metric(VIEWERS.director, { metric: "net_sales_value", dims: [], compare: "target" });
  const projection = result.headline.projection;
  if (!projection) throw new Error("Expected a month-end projection");
  return { projected: projection.attainment, toDate: projection.attainmentToDate };
}

async function grossMargin() {
  const result = await metric(VIEWERS.ceo, { metric: "gross_margin", dims: [], compare: "none" });
  return { value: result.headline.value, source: result.provenance.sourceSystem };
}

async function headcount() {
  const result = await metric(VIEWERS.hr, { metric: "headcount", dims: [], compare: "prev_year" });
  return { value: result.headline.value, delta: result.headline.deltaPercent };
}

const director = await salesByRegion(VIEWERS.director);
const facts = {
  spotlight: SPOTLIGHT_LABEL,
  director,
  ceo: await salesByRegion(VIEWERS.ceo),
  rep: await salesByRegion(VIEWERS.rep),
  drops: spotlightAlerts(),
  leave: { from: formatDateTh(LEAVE.from), to: formatDateTh(LEAVE.to), reason: LEAVE.reason },
  assets: await spotlightAssets(),
  trend: await spotlightTrend(),
  team: await spotlightTeam(),
  leaveBalance: await repLeaveBalance(),
  chips: directorChips(),
  channels: await channelShare(),
  cover: await lowestCover(),
  close: await monthClose(),
  margin: await grossMargin(),
  headcount: await headcount(),
};
const kept = KEEP_EXISTING ? (JSON.parse(readFileSync(OUTPUT, "utf8")) as Record<string, unknown>) : {};
writeFileSync(OUTPUT, `${JSON.stringify({ ...facts, ...kept }, null, 2)}\n`);
console.log(`Wrote ${OUTPUT}`);
