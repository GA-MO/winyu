import { inScope, outOfScopeFilters } from "@/lib/access/enforce";
import { metricAccess } from "@/lib/access/grants";
import { fieldVisibilityOf, permissionsFor } from "@/lib/access/role-overrides";
import { DIMS, MAX_ROWS, type AccessContext, type Dim, type MemoryFactType, type MetricId, type MetricQuery, type RoleId } from "@/lib/contracts";
import { isBuried, memoryAbout } from "@/lib/engine/memory";
import type { Verdict, Verifier, VerifyInput } from "@/lib/harness/types";
import type { Dictionary } from "@/lib/semantic/dictionary";
import { layouts, memoryFacts, outbox } from "@/lib/server/agent/collections";
import { loadDictionary } from "@/lib/server/master-data";
import { ports } from "@/lib/server/ports";
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

/** A metric answer holds when every row sits inside the caller's regions and brands (widened by a live grant on the metric), every masked field carries no number, and the rows fit the cap. */
export const metricAnswerHolds: Verifier = async ({ input, observation, access }: VerifyInput) => {
  const rows = rowsOf(observation.data);
  const query = input as MetricQuery;
  const scoped = metricAccess(access, query.metric, new Date()).access;
  return verdictOf([scopeCheck(rows, scoped, await loadDictionary()), maskCheck(rows, observation.evidence.masked, query, scoped), capCheck(rows)]);
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
/** A sent matter holds when it is stored under the code returned, comes from the caller, has the card on it, and reached everyone the call named (the card's owner when it named nobody). */
export const matterHolds: Verifier = (verify) => {
  const data = dataOf<{ code: string; receipts: { userId: string }[] }>(verify);
  const matter = shares().get(data.code ?? "");
  const asked = (verify.input as { to?: string[] }).to ?? [];
  const named = asked.length > 0 ? (resolvedPeople(recipientMatches(asked, verify.access.userId)) ?? []).map((user) => user.id) : (data.receipts ?? []).map((receipt) => receipt.userId);
  const reached = new Set(matter?.path.map((hop) => hop.userId));
  return verdictOf([
    check("matter_exists", matter !== null, "no matter was stored"),
    check("matter_from_caller", matter?.senderId === verify.access.userId, "the matter is not from the caller"),
    check("matter_has_card", (matter?.card.reads.length ?? 0) > 0, "the matter carries no card"),
    check("matter_reached_everyone", named.length > 0 && named.every((id) => reached.has(id)), "the matter did not reach everyone the call named"),
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

/** A leave request holds when the leave system has a pending request from the caller of that kind over those dates. */
export const leaveHolds: Verifier = async (verify) => {
  const input = verify.input as { kind: string; from: string; to: string };
  const requests = await ports().leave.requests(verify.access.userId);
  const found = requests.some((request) => request.status === "pending" && request.kind === input.kind && request.from === input.from && request.to === input.to);
  return verdictOf([check("leave_request_exists", found, "the leave system holds no pending request from the caller that matches what was asked")]);
};

/** An enrollment holds when the LMS holds a pending seat for the caller on that course. */
export const courseHolds: Verifier = async (verify) => {
  const courseId = dataOf<{ courseId: string }>(verify).courseId;
  const enrollments = await ports().learning.enrollments(verify.access.userId);
  const found = enrollments.some((enrollment) => enrollment.status === "pending" && enrollment.courseId === courseId);
  return verdictOf([check("course_request_exists", found, "the LMS holds no pending seat for the caller on that course")]);
};

/** A permission change holds when the role's live permissions now say what was asked. */
export const permissionHolds: Verifier = (verify) => {
  const input = verify.input as { role: RoleId; kind: "metric" | "tool" | "field"; key: string; value: string };
  const live = permissionsFor(input.role);
  const now = input.kind === "metric" ? live.metricAcl[input.key as MetricId] : input.kind === "field" ? fieldVisibilityOf(input.role, input.key) : live.toolAllow.some((name) => name === input.key) ? "allow" : "deny";
  return verdictOf([check("permission_applied", now === input.value, `${input.role} ${input.kind} ${input.key} is ${now}, not ${input.value}`)]);
};

/** A remembered fact holds when it is stored for the caller, confirmed, in the wording they approved, and nothing they rejected still buries it. */
export const rememberHolds: Verifier = (verify) => {
  const input = verify.input as { type: MemoryFactType; value: string };
  const fact = memoryFacts().get(dataOf<{ id: string }>(verify).id ?? "");
  return verdictOf([
    check("fact_stored", fact !== null && fact.userId === verify.access.userId, "no fact was stored for the caller"),
    check("fact_confirmed", fact?.decayAt === null, "the fact is not confirmed"),
    check("fact_wording", fact?.value === input.value.trim() && fact?.type === input.type, "the stored wording differs from the one approved"),
    check("fact_not_buried", !isBuried(verify.access.userId, input), "an earlier rejection still buries the fact"),
  ]);
};

/** A forget holds when no fact of the caller still names the topic and learning would not bring it back. */
export const forgetHolds: Verifier = (verify) => {
  const { about } = verify.input as { about: string };
  return verdictOf([
    check("nothing_left", memoryAbout(verify.access.userId, about).length === 0, "a fact about the topic is still stored"),
    check("topic_buried", isBuried(verify.access.userId, { type: "interest", value: about }), "the topic could be learned again"),
  ]);
};
