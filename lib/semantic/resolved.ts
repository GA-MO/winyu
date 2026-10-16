import type { Dim, DimValues, MetricQuery, ResolvedQuery } from "@/lib/contracts";

/** The question alone, in ids, without the role's scope or the Thai names: what evidence, pins and memory store and re-run under the reader's own scope. */
export function askedQuery({ scopeApplied: _scope, labels: _labels, ...query }: ResolvedQuery): MetricQuery {
  return query;
}

/** Every slice the answer is narrowed to: the filters asked for and the scope the role added. */
export function effectiveFilters(query: ResolvedQuery): DimValues {
  return { ...query.filters, ...query.scopeApplied };
}

/** The dimensions narrowed to exactly one value, with that value. */
export function pinnedSlice(filters: DimValues): Partial<Record<Dim, string>> {
  const pinned: Partial<Record<Dim, string>> = {};
  for (const [dim, values] of Object.entries(filters) as [Dim, string[] | undefined][]) {
    if (values?.length === 1) pinned[dim] = values[0];
  }
  return pinned;
}
