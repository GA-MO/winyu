import { BRANDS, REGIONS, type AccessContext, type ActiveGrant, type Brand, type GrantDays, type GrantRef, type GrantRefusal, type GrantSlice, type MetricId, type Region, type RoleId } from "@/lib/contracts";
import type { SharedRead } from "@/lib/share/card";
import { METRIC_DOMAINS, type MetricDomain } from "./policies";
import { factsOf, ruleThatDenies, type PolicyRule } from "./policy-rules";

/** A domain a grant may open; hr (headcount, attrition, salary) is never grantable. */
export type GrantDomain = Exclude<MetricDomain, "hr">;

export const GRANT_DOMAINS: readonly GrantDomain[] = ["sales", "supply", "marketing", "finance"];

/** Which domains each role may grant by default, before IT changes it. */
export const DEFAULT_GRANT_AUTHORITY: Partial<Record<RoleId, readonly GrantDomain[]>> = { ceo: GRANT_DOMAINS, cfo: ["finance"], sales_director: ["sales"] };

/** The tool name a CEL rule sees a grant under. */
export const GRANT_RULE_TOOL = { name: "grant_access", connector: "winyu", tier: "write" } as const;

const GRANTABLE_TOOLS: ReadonlySet<string> = new Set(["query_metric", "get_forecast"]);

type Scope = { regions: Region[] | "all"; brands: Brand[] | "all" };

/** Everything grantRefusal weighs: the grantor's base access (never their grants), the domains their role may grant, the recipient's live access, the slice, the length, the time, and the admin's rules. */
export type GrantCheck = { grantor: AccessContext; authority: readonly GrantDomain[]; recipient: AccessContext; slice: GrantSlice; days: GrantDays; at: Date; rules: readonly PolicyRule[] };

function domainOf(metric: MetricId): MetricDomain {
  return METRIC_DOMAINS.find((domain) => domain.metrics.includes(metric))?.id ?? "hr";
}

function expanded<T extends string>(values: T[] | "all", every: readonly T[]): T[] {
  return values === "all" ? [...every] : values;
}

function covers<T extends string>(outer: T[] | "all", inner: T[] | "all", every: readonly T[]): boolean {
  const allowed = new Set(expanded(outer, every));
  return expanded(inner, every).every((value) => allowed.has(value));
}

function sameSet<T extends string>(left: T[] | "all", right: T[] | "all", every: readonly T[]): boolean {
  return covers(left, right, every) && covers(right, left, every);
}

function union<T extends string>(left: T[] | "all", right: T[] | "all", every: readonly T[]): T[] | "all" {
  const joined = new Set([...expanded(left, every), ...expanded(right, every)]);
  return every.every((value) => joined.has(value)) ? "all" : every.filter((value) => joined.has(value));
}

function missing<T extends string>(have: T[] | "all", wanted: T[] | "all", every: readonly T[]): T[] {
  const seen = new Set(expanded(have, every));
  return expanded(wanted, every).filter((value) => !seen.has(value));
}

function narrowed<T extends string>(scope: T[] | "all", asked: T[] | null, every: readonly T[]): T[] | "all" {
  if (!asked) return scope;
  const allowed = new Set(expanded(scope, every));
  const kept = asked.filter((value) => allowed.has(value));
  return every.every((value) => kept.includes(value)) ? "all" : kept;
}

function coversScope(outer: Scope, inner: Scope): boolean {
  return covers(outer.regions, inner.regions, REGIONS) && covers(outer.brands, inner.brands, BRANDS);
}

function widenedScope(own: Scope, granted: Scope): Scope {
  if (coversScope(own, granted)) return own;
  if (coversScope(granted, own)) return { regions: granted.regions, brands: granted.brands };
  if (sameSet(own.brands, granted.brands, BRANDS)) return { regions: union(own.regions, granted.regions, REGIONS), brands: own.brands };
  if (sameSet(own.regions, granted.regions, REGIONS)) return { regions: own.regions, brands: union(own.brands, granted.brands, BRANDS) };
  return { regions: granted.regions, brands: granted.brands };
}

function liveGrantOn(access: AccessContext, metric: MetricId, at: Date): ActiveGrant | null {
  return access.grants.find((grant) => grant.slice.metric === metric && Date.parse(grant.expiresAt) > at.getTime()) ?? null;
}

/** The access one metric is read under: the live grant on it widens regions and brands to cover what was granted and lifts "none" to "full"; "masked" never lifts. Without a live grant, the same access. */
export function metricAccess(access: AccessContext, metric: MetricId, at: Date): { access: AccessContext; grant: GrantRef | null } {
  const grant = liveGrantOn(access, metric, at);
  if (!grant || access.metricAcl[metric] === "masked") return { access, grant: null };
  const scope = widenedScope(access, grant.slice);
  return {
    access: { ...access, ...scope, metricAcl: { ...access.metricAcl, [metric]: access.metricAcl[metric] === "none" ? "full" : access.metricAcl[metric] } },
    grant: { id: grant.id, grantorId: grant.grantorId, expiresAt: grant.expiresAt },
  };
}

function filterValues(value: unknown): string[] | null {
  if (typeof value === "string") return [value];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : null;
}

function askedDims(read: SharedRead): { region: string[] | null; brand: string[] | null } {
  const source = (read.tool === "query_metric" ? read.input.filters : read.input.dims) as Record<string, unknown> | undefined;
  return { region: filterValues(source?.region), brand: filterValues(source?.brand) };
}

function isMetric(value: unknown): value is MetricId {
  return typeof value === "string" && METRIC_DOMAINS.some((domain) => domain.metrics.includes(value as MetricId));
}

/** The slice a shared read showed its sender, for query_metric and get_forecast: the metric, and the regions and brands they saw (the read's own filters, else their scope) within their scope. Any other read is not grantable. */
export function grantedSlice(senderAccess: AccessContext, read: SharedRead): GrantSlice | null {
  if (!GRANTABLE_TOOLS.has(read.tool) || !isMetric(read.input.metric)) return null;
  const asked = askedDims(read);
  return {
    metric: read.input.metric,
    regions: narrowed(senderAccess.regions, asked.region as Region[] | null, REGIONS),
    brands: narrowed(senderAccess.brands, asked.brand as Brand[] | null, BRANDS),
  };
}

/** The part of a slice the viewer does not see under their access and live grants; null when they see all of it. */
export function hiddenFrom(viewerAccess: AccessContext, slice: GrantSlice, at: Date): GrantSlice | null {
  const { access } = metricAccess(viewerAccess, slice.metric, at);
  if (access.metricAcl[slice.metric] !== "full") return slice;
  const regions = missing(access.regions, slice.regions, REGIONS);
  const brands = missing(access.brands, slice.brands, BRANDS);
  if (regions.length === 0 && brands.length === 0) return null;
  return { metric: slice.metric, regions: regions.length > 0 ? regions : slice.regions, brands: brands.length > 0 ? brands : slice.brands };
}

/** Why this grant cannot be given, checked in a fixed order, or null when it may. */
export function grantRefusal(check: GrantCheck): GrantRefusal | null {
  const { grantor, authority, recipient, slice, days, at, rules } = check;
  const domain = domainOf(slice.metric);
  if (domain === "hr") return { code: "sensitive" };
  if (recipient.userId === grantor.userId) return { code: "self" };
  if (!authority.includes(domain)) return { code: "not_authority" };
  if (grantor.metricAcl[slice.metric] !== "full" || !coversScope(grantor, slice)) return { code: "beyond_scope" };
  if (recipient.metricAcl[slice.metric] === "masked") return { code: "masked" };
  if (!hiddenFrom(recipient, slice, at)) return { code: "nothing_hidden" };
  const args = { metric: slice.metric, regions: expanded(slice.regions, REGIONS), brands: expanded(slice.brands, BRANDS), recipient: recipient.userId, days };
  const denial = ruleThatDenies(factsOf(grantor, GRANT_RULE_TOOL, args, "person", at), rules);
  return denial ? { code: "policy_rule", rule: { id: denial.rule.id, name: denial.rule.name } } : null;
}
