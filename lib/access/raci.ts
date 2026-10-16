import type { Dim, MetricId, Region, RoleId, User } from "@/lib/contracts";
import { USERS, findUser } from "@/lib/data/entities/users";
import { AGENTS } from "@/lib/data/entities/agents";
import { PROVINCES } from "@/lib/data/entities/org";
import { DISTRIBUTION_CENTERS, PLANTS } from "@/lib/data/entities/supply";

export type Responsible = { userId: string; user: User; role: RoleId; basis: string };

type MetricGroup = { role: RoleId; fallbackRole: RoleId; basis: string };

const SALES_METRICS: MetricId[] = ["net_sales_volume", "net_sales_value", "sell_out_volume", "target_attainment", "market_share"];
const SUPPLY_METRICS: MetricId[] = ["stock_on_hand", "days_of_cover", "production_output", "capacity_utilization", "forecast_mape"];
const MARKETING_METRICS: MetricId[] = ["campaign_spend", "campaign_reach", "campaign_uplift", "share_of_voice", "sentiment_score"];
const FINANCE_METRICS: MetricId[] = ["gross_margin", "trade_spend", "ar_overdue"];
const HR_METRICS: MetricId[] = ["headcount", "attrition_rate", "avg_salary"];

const SALES: MetricGroup = { role: "sales_rsm", fallbackRole: "sales_director", basis: "เจ้าของตัวเลขยอดขายของพื้นที่" };
const SUPPLY: MetricGroup = { role: "supply_planner", fallbackRole: "supply_planner", basis: "ผู้วางแผนซัพพลายของพื้นที่" };
const MARKETING: MetricGroup = { role: "marketing_lead", fallbackRole: "marketing_lead", basis: "ผู้ดูแลแคมเปญของพื้นที่" };
const FINANCE: MetricGroup = { role: "finance_analyst", fallbackRole: "cfo", basis: "ผู้ดูแลตัวเลขการเงิน" };
const HR: MetricGroup = { role: "hr_manager", fallbackRole: "hr_manager", basis: "ผู้ดูแลข้อมูลบุคคล" };
const EXECUTIVE: MetricGroup = { role: "ceo", fallbackRole: "ceo", basis: "ผู้รับผิดชอบสูงสุดเมื่อไม่มีเจ้าของเฉพาะ" };

const REGION_OF_PLACE: Partial<Record<Dim, ReadonlyMap<string, Region>>> = {
  agent: new Map(AGENTS.map((agent) => [agent.id, agent.region])),
  province: new Map(PROVINCES.map((province) => [province.id, province.region])),
  dc: new Map(DISTRIBUTION_CENTERS.map((dc) => [dc.id, dc.region])),
  plant: new Map(PLANTS.map((plant) => [plant.id, plant.region])),
};

/** The region a slice sits in: its region when named, else the region of the agent, province, DC or plant it names. */
export function regionOf(dims: Partial<Record<Dim, string>>): Region | null {
  if (dims.region) return dims.region as Region;
  for (const [dim, regions] of Object.entries(REGION_OF_PLACE) as [Dim, ReadonlyMap<string, Region>][]) {
    const place = dims[dim];
    const region = place ? regions.get(place) : undefined;
    if (region) return region;
  }
  return null;
}

function groupOf(metric: MetricId): MetricGroup {
  if (SALES_METRICS.includes(metric)) return SALES;
  if (SUPPLY_METRICS.includes(metric)) return SUPPLY;
  if (MARKETING_METRICS.includes(metric)) return MARKETING;
  if (FINANCE_METRICS.includes(metric)) return FINANCE;
  if (HR_METRICS.includes(metric)) return HR;
  return EXECUTIVE;
}

function nationalWith(role: RoleId): User | null {
  return USERS.find((user) => user.role === role && user.region === null) ?? null;
}

/** The person accountable for a metric in a region: the RACI table `resolve_owner` and the alert engine read. */
export function responsibleFor(metric: MetricId, region: Region | null): Responsible | null {
  const group = groupOf(metric);
  const inRegion = region ? USERS.find((user) => user.role === group.role && user.region === region) : null;
  const owner = inRegion ?? nationalWith(group.role) ?? nationalWith(group.fallbackRole) ?? USERS.find((user) => user.role === group.role) ?? null;
  if (!owner) return null;
  const scope = inRegion ? "ระดับภาค" : "ระดับประเทศ";
  return { userId: owner.id, user: owner, role: owner.role, basis: `${group.basis} (${scope})` };
}

export function managerOf(userId: string): User | null {
  const user = findUser(userId);
  return user?.managerId ? findUser(user.managerId) : null;
}
