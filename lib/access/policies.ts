import { METRIC_IDS, ROLE_IDS, toolsAllowedFor, type AccessContext, type Brand, type MetricId, type Region, type RoleId, type User } from "@/lib/contracts";

type Visibility = "full" | "masked" | "none";
type MetricAcl = Record<MetricId, Visibility>;
export type RolePolicy = { regions: Region[] | "all" | "own"; brands: Brand[] | "all"; metricAcl: MetricAcl; toolAllow: string[] };

const SALES_METRICS: MetricId[] = ["net_sales_volume", "net_sales_value", "sell_out_volume", "target_attainment"];
const SUPPLY_METRICS: MetricId[] = ["stock_on_hand", "days_of_cover", "production_output", "capacity_utilization", "forecast_mape"];
const MARKETING_METRICS: MetricId[] = ["campaign_spend", "campaign_reach", "campaign_uplift", "share_of_voice", "sentiment_score"];
const FINANCE_METRICS: MetricId[] = ["gross_margin", "trade_spend", "ar_overdue"];
const HR_METRICS: MetricId[] = ["headcount", "attrition_rate"];
const SALARY: MetricId = "avg_salary";

function acl(defaultVisibility: Visibility, overrides: Partial<MetricAcl> = {}): MetricAcl {
  const table = Object.fromEntries(METRIC_IDS.map((id) => [id, defaultVisibility])) as MetricAcl;
  return { ...table, ...overrides };
}

function visible(ids: MetricId[], visibility: Visibility): Partial<MetricAcl> {
  return Object.fromEntries(ids.map((id) => [id, visibility]));
}

export const ROLE_POLICIES: Record<RoleId, RolePolicy> = {
  ceo: { regions: "all", brands: "all", metricAcl: acl("full"), toolAllow: toolsAllowedFor("ceo") },
  cfo: { regions: "all", brands: "all", metricAcl: acl("full", { [SALARY]: "masked" }), toolAllow: toolsAllowedFor("cfo") },
  sales_director: {
    regions: "all", brands: "all",
    metricAcl: acl("full", { ...visible(HR_METRICS, "masked"), [SALARY]: "masked" }),
    toolAllow: toolsAllowedFor("sales_director"),
  },
  sales_rsm: {
    regions: "own", brands: "all",
    metricAcl: acl("none", { ...visible(SALES_METRICS, "full"), ...visible(["stock_on_hand", "days_of_cover"], "full"), ...visible(["campaign_uplift", "trade_spend"], "full"), ar_overdue: "full", gross_margin: "masked", [SALARY]: "masked" }),
    toolAllow: toolsAllowedFor("sales_rsm"),
  },
  sales_rep: {
    regions: "own", brands: "all",
    metricAcl: acl("none", { ...visible(SALES_METRICS, "full"), ...visible(["stock_on_hand", "days_of_cover"], "full"), ar_overdue: "masked", [SALARY]: "masked" }),
    toolAllow: toolsAllowedFor("sales_rep"),
  },
  marketing_lead: {
    regions: "all", brands: "all",
    metricAcl: acl("none", { ...visible(SALES_METRICS, "full"), ...visible(MARKETING_METRICS, "full"), ...visible(["stock_on_hand", "days_of_cover"], "full"), ...visible(FINANCE_METRICS, "masked"), [SALARY]: "masked" }),
    toolAllow: toolsAllowedFor("marketing_lead"),
  },
  supply_planner: {
    regions: "all", brands: "all",
    metricAcl: acl("none", { ...visible(SUPPLY_METRICS, "full"), ...visible(["net_sales_volume", "sell_out_volume"], "full"), campaign_uplift: "full", [SALARY]: "masked" }),
    toolAllow: toolsAllowedFor("supply_planner"),
  },
  finance_analyst: {
    regions: "all", brands: "all",
    metricAcl: acl("full", { ...visible(HR_METRICS, "none"), [SALARY]: "masked" }),
    toolAllow: toolsAllowedFor("finance_analyst"),
  },
  hr_manager: {
    regions: "all", brands: "all",
    metricAcl: acl("none", { ...visible(HR_METRICS, "full"), [SALARY]: "full", headcount: "full" }),
    toolAllow: toolsAllowedFor("hr_manager"),
  },
  it_admin: {
    regions: "all", brands: "all",
    metricAcl: acl("masked", { ...visible(HR_METRICS, "masked"), [SALARY]: "masked" }),
    toolAllow: toolsAllowedFor("it_admin"),
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
    toolAllow: [...policy.toolAllow],
    canActAs: [],
  };
}

export const POLICY_ROLES: readonly RoleId[] = ROLE_IDS;
