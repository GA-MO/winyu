import type { MetricId } from "./semantic";

export type RoleId = "ceo" | "cfo" | "sales_director" | "sales_rsm" | "sales_rep" | "marketing_lead"
  | "supply_planner" | "finance_analyst" | "hr_manager" | "it_admin";
export type Region = "bkk" | "central" | "north" | "northeast" | "east" | "south";
export type Brand = "singha" | "leo" | "singha_soda" | "singha_water" | "purra" | "singha_lemon_soda" | "asahi" | "carlsberg";
export type BusinessUnit = "beer" | "non_alcohol" | "import";
export type User = { id: string; name: string; nameTh: string; title: string; role: RoleId; department: string;
  region: Region | null; managerId: string | null; email: string; lineId: string | null; avatarSeed: string };
export type AccessContext = { userId: string; role: RoleId; regions: Region[] | "all"; brands: Brand[] | "all";
  metricAcl: Record<MetricId, "full" | "masked" | "none">; toolAllow: string[]; canActAs: string[] };

export const ROLE_IDS = ["ceo", "cfo", "sales_director", "sales_rsm", "sales_rep", "marketing_lead",
  "supply_planner", "finance_analyst", "hr_manager", "it_admin"] as const satisfies readonly RoleId[];
export const REGIONS = ["bkk", "central", "north", "northeast", "east", "south"] as const satisfies readonly Region[];
export const BRANDS = ["singha", "leo", "singha_soda", "singha_water", "purra", "singha_lemon_soda", "asahi", "carlsberg"] as const satisfies readonly Brand[];
export const BUSINESS_UNITS = ["beer", "non_alcohol", "import"] as const satisfies readonly BusinessUnit[];
