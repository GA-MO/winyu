import type { Dim, MasterData, MetricId } from "@/lib/contracts";

export const MIN_CELL_SIZE = 3;
export const SUPPRESSED_VALUE = "***";
export const SUPPRESSED_FIELDS = ["value", "compare_value", "delta_pct"];

type BaseEntity = "agent" | "employee";

const BASE_ENTITY: Partial<Record<MetricId, BaseEntity>> = {
  ar_overdue: "agent",
  gross_margin: "agent",
  trade_spend: "agent",
  avg_salary: "employee",
  attrition_rate: "employee",
};

const AGENT_DIMS: Dim[] = ["agent", "province", "region", "dc"];

function agentsMatching(master: MasterData, scope: Partial<Record<Dim, string[]>>): number {
  return master.agents.filter((agent) =>
    AGENT_DIMS.every((dim) => {
      const allowed = scope[dim];
      if (!allowed || allowed.length === 0) return true;
      if (dim === "agent") return allowed.includes(agent.id);
      if (dim === "province") return allowed.includes(agent.provinceId);
      if (dim === "dc") return allowed.includes(agent.servingDc);
      return allowed.includes(agent.region);
    }),
  ).length;
}

function employeesMatching(master: MasterData, scope: Partial<Record<Dim, string[]>>): number {
  const wanted = scope.department;
  const departments = wanted && wanted.length > 0 ? master.departments.filter((entry) => wanted.includes(entry.id)) : master.departments;
  return departments.reduce((sum, entry) => sum + entry.headcount, 0);
}

/** How many real agents or employees a cell aggregates; `null` when the metric does not carry person-level risk. */
export function cohortSize(master: MasterData, metric: MetricId, scope: Partial<Record<Dim, string[]>>): number | null {
  const base = BASE_ENTITY[metric];
  if (!base) return null;
  return base === "agent" ? agentsMatching(master, scope) : employeesMatching(master, scope);
}

function namesBaseEntity(metric: MetricId, dims: Dim[], filters: Partial<Record<Dim, string[]>>): boolean {
  if (BASE_ENTITY[metric] !== "agent") return false;
  return dims.includes("agent") || (filters.agent?.length ?? 0) > 0;
}

/** True when a roll-up cell hides so few agents that reading it is reading one counterparty's books. */
export function isSmallCell(master: MasterData, metric: MetricId, dims: Dim[], filters: Partial<Record<Dim, string[]>>, cell: Partial<Record<Dim, string[]>>): boolean {
  if (namesBaseEntity(metric, dims, filters)) return false;
  const size = cohortSize(master, metric, { ...filters, ...cell });
  return size !== null && size < MIN_CELL_SIZE;
}

/** The filter set of one result row: its own grouped values narrow the query's filters. */
export function cellScopeOf(dims: Dim[], rowDims: Record<string, string>): Partial<Record<Dim, string[]>> {
  const scope: Partial<Record<Dim, string[]>> = {};
  for (const dim of dims) {
    const value = rowDims[dim];
    if (value) scope[dim] = [value];
  }
  return scope;
}
