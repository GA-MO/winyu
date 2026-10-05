import { inScope, outOfScopeFilters } from "@/lib/access/enforce";
import { fieldVisibilityOf, permissionsFor } from "@/lib/access/role-overrides";
import { DIMS, MAX_ROWS, type AccessContext, type Dim, type MetricId, type MetricQuery, type RoleId } from "@/lib/contracts";
import type { Verdict, Verifier, VerifyInput } from "@/lib/harness/types";
import type { Dictionary } from "@/lib/semantic/dictionary";
import { layouts, outbox, packets, staffRequests } from "@/lib/server/agent/collections";
import { loadDictionary } from "@/lib/server/master-data";
import { watchesOf } from "@/lib/server/watches";
import { resolvedPeople } from "@/lib/share/recipients";
import { recipientMatches, shares } from "@/lib/server/share/shares";

type Row = Record<string, unknown>;
type MetricOutput = { ok?: unknown; rows?: unknown; provenance?: { masked?: unknown } };
type Check = { name: string; failure: string | null };

const DIM_SET: ReadonlySet<string> = new Set(DIMS);

function rowsOf(data: unknown): Row[] {
  const rows = (data as MetricOutput | null)?.rows;
  return Array.isArray(rows) ? (rows as Row[]) : [];
}

function outOfScopeCell(dictionary: Dictionary, access: AccessContext, dim: Dim, label: string): string | null {
  const id = dictionary.resolveDimValue(dim, label);
  if (!id) return null;
  const region = dictionary.regionOf(dim, id);
  if (region && !inScope(access, "region", region)) return `${dim} ${label} is in ${region}`;
  const brand = dictionary.brandOf(dim, id);
  if (brand && !inScope(access, "brand", brand)) return `${dim} ${label} is brand ${brand}`;
  return null;
}

function scopeCheck(rows: Row[], access: AccessContext, dictionary: Dictionary): Check {
  for (const row of rows) {
    for (const [key, value] of Object.entries(row)) {
      if (!DIM_SET.has(key) || typeof value !== "string") continue;
      const breach = outOfScopeCell(dictionary, access, key as Dim, value);
      if (breach) return { name: "rows_in_scope", failure: `a row outside the caller's scope: ${breach}` };
    }
  }
  return { name: "rows_in_scope", failure: null };
}

function maskCheck(rows: Row[], masked: string[], query: MetricQuery, access: AccessContext): Check {
  if (access.metricAcl[query.metric] !== "masked") return { name: "masked_fields_hidden", failure: null };
  if (masked.length === 0) return { name: "masked_fields_hidden", failure: `${query.metric} is masked for this role but nothing came back masked` };
  const leaked = masked.find((field) => rows.some((row) => typeof row[field] === "number"));
  return { name: "masked_fields_hidden", failure: leaked ? `masked field ${leaked} carries a number` : null };
}

function capCheck(rows: Row[]): Check {
  return { name: "rows_capped", failure: rows.length > MAX_ROWS ? `${rows.length} rows, over the ${MAX_ROWS} the model may receive` : null };
}

function verdictOf(checks: Check[]): Verdict {
  const failed = checks.find((check) => check.failure !== null);
  return failed?.failure ? { status: "failed", reason: failed.failure } : { status: "passed", checks: checks.map((check) => check.name) };
}

/** A metric answer holds when every row sits inside the caller's regions and brands, every masked field carries no number, and the rows fit the cap. */
export const metricAnswerHolds: Verifier = async ({ input, observation, access }: VerifyInput) => {
  const rows = rowsOf(observation.data);
  const query = input as MetricQuery;
  return verdictOf([scopeCheck(rows, access, await loadDictionary()), maskCheck(rows, observation.evidence.masked, query, access), capCheck(rows)]);
};

function dataOf<T>(check: VerifyInput): Partial<T> {
  return ((check.observation.data as { data?: Partial<T> } | null)?.data ?? {}) as Partial<T>;
}

function check(name: string, holds: boolean, failure: string): Check {
  return { name, failure: holds ? null : failure };
}

/** A pinned card holds when it is on the caller's own dashboard, pinned, with the title and metric asked for, and its query stays inside the caller's scope. */
export const pinHolds: Verifier = (verify) => {
  const input = verify.input as { title: string; query: MetricQuery };
  const widget = layouts().get(verify.access.userId)?.widgets.find((entry) => entry.id === dataOf<{ widgetId: string }>(verify).widgetId);
  return verdictOf([
    check("widget_exists", widget !== undefined, "the pinned card is not on the caller's dashboard"),
    check("widget_pinned", widget?.pinned === true, "the card is there but not pinned"),
    check("widget_as_asked", widget?.title === input.title && widget?.query.metric === input.query.metric, "the card's title or metric differs from what was asked"),
    check("widget_in_scope", widget !== undefined && outOfScopeFilters(verify.access, widget.query.filters).length === 0, "the card's query reaches outside the caller's scope"),
  ]);
};

/** A watch holds when it is among the caller's own watches. */
export const watchHolds: Verifier = (verify) => {
  const watchId = dataOf<{ watchId: string }>(verify).watchId;
  return verdictOf([check("watch_exists", watchesOf(verify.access.userId).some((watch) => watch.id === watchId), "the watch is not among the caller's watches")]);
};

/** A handoff holds when the packet exists, comes from the caller and goes to the person asked for. */
export const handoffHolds: Verifier = (verify) => {
  const packet = packets().get(dataOf<{ packetId: string }>(verify).packetId ?? "");
  return verdictOf([
    check("packet_exists", packet !== null, "no packet was stored"),
    check("packet_from_caller", packet?.fromUserId === verify.access.userId, "the packet is not from the caller"),
    check("packet_to_recipient", packet?.toUserId === (verify.input as { toUserId: string }).toUserId, "the packet went to someone else"),
  ]);
};

/** A share holds when it is stored under the code returned, comes from the caller, and reached every person the call named. */
export const shareHolds: Verifier = (verify) => {
  const share = shares().get(dataOf<{ code: string }>(verify).code ?? "");
  const named = resolvedPeople(recipientMatches((verify.input as { to: string[] }).to, verify.access.userId)) ?? [];
  const reached = new Set(share?.deliveries.map((delivery) => delivery.userId));
  return verdictOf([
    check("share_exists", share !== null, "no share was stored"),
    check("share_from_caller", share?.senderId === verify.access.userId, "the share is not from the caller"),
    check("share_reached_everyone", named.length > 0 && named.every((user) => reached.has(user.id)), "the share did not reach everyone the call named"),
  ]);
};

/** An email holds when the outbox has it, from the caller, to the person and with the subject asked for. */
export const emailHolds: Verifier = (verify) => {
  const entry = outbox().get(dataOf<{ outboxId: string }>(verify).outboxId ?? "");
  const input = verify.input as { toUserId: string; subject: string };
  return verdictOf([
    check("email_queued", entry !== null, "the outbox has no such email"),
    check("email_as_asked", entry?.fromUserId === verify.access.userId && entry?.toUserId === input.toUserId && entry?.subject === input.subject, "the queued email differs from what was asked"),
  ]);
};

function requested(verify: VerifyInput, kind: "leave" | "course", matches: (refId: string, from: string, to: string) => boolean): Verdict {
  const found = staffRequests().where((request) => request.userId === verify.access.userId && request.kind === kind).some((request) => matches(request.refId, request.from, request.to));
  return verdictOf([check(`${kind}_request_exists`, found, `no ${kind} request from the caller matches what was asked`)]);
}

/** A leave request holds when the caller has one of that kind over those dates. */
export const leaveHolds: Verifier = (verify) => {
  const input = verify.input as { kind: string; from: string; to: string };
  return requested(verify, "leave", (refId, from, to) => refId === input.kind && from === input.from && to === input.to);
};

/** An enrollment holds when the caller has a request for that course. */
export const courseHolds: Verifier = (verify) => requested(verify, "course", (refId) => refId === dataOf<{ courseId: string }>(verify).courseId);

/** A permission change holds when the role's live permissions now say what was asked. */
export const permissionHolds: Verifier = (verify) => {
  const input = verify.input as { role: RoleId; kind: "metric" | "tool" | "field"; key: string; value: string };
  const live = permissionsFor(input.role);
  const now = input.kind === "metric" ? live.metricAcl[input.key as MetricId] : input.kind === "field" ? fieldVisibilityOf(input.role, input.key) : live.toolAllow.some((name) => name === input.key) ? "allow" : "deny";
  return verdictOf([check("permission_applied", now === input.value, `${input.role} ${input.kind} ${input.key} is ${now}, not ${input.value}`)]);
};
