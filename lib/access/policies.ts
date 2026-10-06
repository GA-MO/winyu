import { defaultToolsOf } from "@/lib/server/tools/registry";
import { METRIC_IDS, ROLE_IDS, type AccessContext, type Brand, type MetricId, type Region, type RoleId, type User } from "@/lib/contracts";

type Visibility = "full" | "masked" | "none";
type MetricAcl = Record<MetricId, Visibility>;
export type RolePolicy = { regions: Region[] | "all" | "own"; brands: Brand[] | "all"; metricAcl: MetricAcl };

const SALES_METRICS: MetricId[] = ["net_sales_volume", "net_sales_value", "sell_out_volume", "target_attainment", "market_share"];
const SUPPLY_METRICS: MetricId[] = ["stock_on_hand", "days_of_cover", "production_output", "capacity_utilization", "forecast_mape"];
const MARKETING_METRICS: MetricId[] = ["campaign_spend", "campaign_reach", "campaign_uplift", "share_of_voice", "sentiment_score"];
const FINANCE_METRICS: MetricId[] = ["gross_margin", "trade_spend", "ar_overdue"];
const HR_METRICS: MetricId[] = ["headcount", "attrition_rate"];
const SALARY: MetricId = "avg_salary";

export type MetricDomain = "sales" | "supply" | "marketing" | "finance" | "hr";

/** Metrics grouped by the department that owns them, in the order the admin console lists them. */
export const METRIC_DOMAINS: readonly { id: MetricDomain; metrics: readonly MetricId[] }[] = [
  { id: "sales", metrics: SALES_METRICS },
  { id: "supply", metrics: SUPPLY_METRICS },
  { id: "marketing", metrics: MARKETING_METRICS },
  { id: "finance", metrics: FINANCE_METRICS },
  { id: "hr", metrics: [...HR_METRICS, SALARY] },
];

function acl(defaultVisibility: Visibility, overrides: Partial<MetricAcl> = {}): MetricAcl {
  const table = Object.fromEntries(METRIC_IDS.map((id) => [id, defaultVisibility])) as MetricAcl;
  return { ...table, ...overrides };
}

function visible(ids: MetricId[], visibility: Visibility): Partial<MetricAcl> {
  return Object.fromEntries(ids.map((id) => [id, visibility]));
}

export const ROLE_POLICIES: Record<RoleId, RolePolicy> = {
  ceo: { regions: "all", brands: "all", metricAcl: acl("full") },
  cfo: { regions: "all", brands: "all", metricAcl: acl("full", { [SALARY]: "masked" }) },
  sales_director: {
    regions: "all", brands: "all",
    metricAcl: acl("full", { ...visible(HR_METRICS, "masked"), [SALARY]: "masked" }),
  },
  sales_rsm: {
    regions: "own", brands: "all",
    metricAcl: acl("none", { ...visible(SALES_METRICS, "full"), ...visible(["stock_on_hand", "days_of_cover"], "full"), ...visible(["campaign_uplift", "trade_spend"], "full"), ar_overdue: "full", gross_margin: "masked", [SALARY]: "masked" }),
  },
  sales_rep: {
    regions: "own", brands: "all",
    metricAcl: acl("none", { ...visible(SALES_METRICS, "full"), ...visible(["stock_on_hand", "days_of_cover"], "full"), ar_overdue: "masked", [SALARY]: "masked" }),
  },
  marketing_lead: {
    regions: "all", brands: "all",
    metricAcl: acl("none", { ...visible(SALES_METRICS, "full"), ...visible(MARKETING_METRICS, "full"), ...visible(["stock_on_hand", "days_of_cover"], "full"), ...visible(FINANCE_METRICS, "masked"), [SALARY]: "masked" }),
  },
  supply_planner: {
    regions: "all", brands: "all",
    metricAcl: acl("none", { ...visible(SUPPLY_METRICS, "full"), ...visible(["net_sales_volume", "sell_out_volume"], "full"), campaign_uplift: "full", [SALARY]: "masked" }),
  },
  finance_analyst: {
    regions: "all", brands: "all",
    metricAcl: acl("full", { ...visible(HR_METRICS, "none"), [SALARY]: "masked" }),
  },
  hr_manager: {
    regions: "all", brands: "all",
    metricAcl: acl("none", { ...visible(HR_METRICS, "full"), [SALARY]: "full", headcount: "full" }),
  },
  it_admin: {
    regions: "all", brands: "all",
    metricAcl: acl("masked", { ...visible(HR_METRICS, "masked"), [SALARY]: "masked" }),
  },
};

function regionsFor(policy: RolePolicy, user: User): Region[] | "all" {
  if (policy.regions !== "own") return policy.regions;
  return user.region ? [user.region] : [];
}

/** Derives the access context every server query and tool filter runs under. */
export function accessFor(user: User): AccessContext {
  const policy = ROLE_POLICIES[user.role];
  return {
    userId: user.id,
    role: user.role,
    regions: regionsFor(policy, user),
    brands: policy.brands,
    metricAcl: { ...policy.metricAcl },
    toolAllow: defaultToolsOf(user.role),
    canActAs: [],
    grants: [],
  };
}

export const POLICY_ROLES: readonly RoleId[] = ROLE_IDS;
