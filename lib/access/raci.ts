import type { MetricId, Region, RoleId, User } from "@/lib/contracts";
import { USERS, findUser } from "@/lib/data/entities/users";

export type Responsible = { userId: string; user: User; role: RoleId; basis: string };

type MetricGroup = { role: RoleId; fallbackRole: RoleId; basis: string };

const SALES_METRICS: MetricId[] = ["net_sales_volume", "net_sales_value", "sell_out_volume", "target_attainment"];
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

function groupOf(metric: MetricId): MetricGroup {
  if (SALES_METRICS.includes(metric)) return SALES;
  if (SUPPLY_METRICS.includes(metric)) return SUPPLY;
  if (MARKETING_METRICS.includes(metric)) return MARKETING;
  if (FINANCE_METRICS.includes(metric)) return FINANCE;
  if (HR_METRICS.includes(metric)) return HR;
  return EXECUTIVE;
}

function firstWithRole(role: RoleId, region: Region | null): User | null {
  const inRegion = region ? USERS.find((user) => user.role === role && user.region === region) : null;
  return inRegion ?? USERS.find((user) => user.role === role && user.region === null) ?? USERS.find((user) => user.role === role) ?? null;
}

/** The person accountable for a metric in a region: the RACI table `resolve_owner` and the alert engine read. */
export function responsibleFor(metric: MetricId, region: Region | null): Responsible | null {
  const group = groupOf(metric);
  const inRegion = region ? USERS.find((user) => user.role === group.role && user.region === region) : null;
  const owner = inRegion ?? firstWithRole(group.role, region) ?? firstWithRole(group.fallbackRole, null);
  if (!owner) return null;
  const scope = inRegion ? "ระดับภาค" : "ระดับประเทศ";
  return { userId: owner.id, user: owner, role: owner.role, basis: `${group.basis} (${scope})` };
}

export function responsibleUserId(metric: MetricId, region: Region | null): string | null {
  return responsibleFor(metric, region)?.userId ?? null;
}

export function managerOf(userId: string): User | null {
  const user = findUser(userId);
  return user?.managerId ? findUser(user.managerId) : null;
}
