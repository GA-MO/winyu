import type { BusinessUnit, Region } from "@/lib/contracts";

export type BusinessUnitBudget = {
  businessUnit: BusinessUnit; monthlyRevenueThb: number; monthlyGrowth: number;
  cogsRatio: number; exciseRatio: number; opexRatio: number;
};
export type TradeSpendBudget = { region: Region; monthlyThb: number };

export const BU_BUDGETS: readonly BusinessUnitBudget[] = [
  { businessUnit: "beer", monthlyRevenueThb: 2_950_000_000, monthlyGrowth: 0.004, cogsRatio: 0.55, exciseRatio: 0.2, opexRatio: 0.11 },
  { businessUnit: "non_alcohol", monthlyRevenueThb: 640_000_000, monthlyGrowth: 0.007, cogsRatio: 0.58, exciseRatio: 0, opexRatio: 0.14 },
  { businessUnit: "import", monthlyRevenueThb: 285_000_000, monthlyGrowth: 0.003, cogsRatio: 0.58, exciseRatio: 0.18, opexRatio: 0.09 },
];

export const BU_BUDGET_INDEX: ReadonlyMap<BusinessUnit, BusinessUnitBudget> = new Map(BU_BUDGETS.map((budget) => [budget.businessUnit, budget]));

export const TRADE_SPEND_BUDGETS: readonly TradeSpendBudget[] = [
  { region: "bkk", monthlyThb: 74_000_000 },
  { region: "central", monthlyThb: 43_000_000 },
  { region: "north", monthlyThb: 35_000_000 },
  { region: "northeast", monthlyThb: 57_000_000 },
  { region: "east", monthlyThb: 32_000_000 },
  { region: "south", monthlyThb: 30_000_000 },
];

export const TRADE_SPEND_BUDGET_INDEX: ReadonlyMap<Region, number> = new Map(TRADE_SPEND_BUDGETS.map((budget) => [budget.region, budget.monthlyThb]));

export const BASELINE_TRADE_SPEND_RATIO = 0.03;
export const TARGET_GROWTH = 1.06;
