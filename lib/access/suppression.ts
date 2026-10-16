import type { Dim, MasterData, MetricId } from "@/lib/contracts";

export const MIN_CELL_SIZE = 3;
export const SUPPRESSED_VALUE = "***";
export const SUPPRESSED_FIELDS = ["value", "compare_value", "delta_pct"];

/** Metrics about people: the only ones small-cell suppression applies to, so a figure for a handful of employees never singles one out. Business metrics are never suppressed. */
export const PEOPLE_METRICS: ReadonlySet<MetricId> = new Set<MetricId>(["headcount", "attrition_rate", "avg_salary"]);

function employeesMatching(master: MasterData, scope: Partial<Record<Dim, string[]>>): number {
  const wanted = scope.department;
  const departments = wanted && wanted.length > 0 ? master.departments.filter((entry) => wanted.includes(entry.id)) : master.departments;
  return departments.reduce((sum, entry) => sum + entry.headcount, 0);
}

/** How many employees a cell aggregates; `null` when the metric is not about people. */
export function cohortSize(master: MasterData, metric: MetricId, scope: Partial<Record<Dim, string[]>>): number | null {
  return PEOPLE_METRICS.has(metric) ? employeesMatching(master, scope) : null;
}

/** True when a cell of a people metric aggregates so few employees that reading it is reading one person's record. */
export function isSmallCell(master: MasterData, metric: MetricId, filters: Partial<Record<Dim, string[]>>, cell: Partial<Record<Dim, string[]>>): boolean {
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
