import { describe, expect, mock, test } from "bun:test";

const { sessionCookie } = await import("@/lib/server/auth/session-token");
mock.module("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => ({ name, value: sessionCookie({ via: "demo", userId: "u_ton" }).value }) }),
}));
mock.module("next/cache", () => ({ revalidatePath: () => undefined }));

const { removeOverrideAction, resetAllAction, resetRoleAction, setMetricAction } = await import("./actions");
const { defaultMetricVisibility, overrideFor } = await import("@/lib/access/role-overrides");
const { METRIC_IDS } = await import("@/lib/contracts");
const { metricLabel } = await import("@/lib/dashboard/metric-display");
const { TH } = await import("@/lib/i18n/th");
const { activitiesFrom } = await import("@/lib/server/activity");
const { auditLog } = await import("@/lib/server/audit");

const ROLE = "sales_rep";
const METRIC = METRIC_IDS.find((metric) => defaultMetricVisibility(ROLE, metric) === "full" && !overrideFor(ROLE, "metric", metric)) ?? "net_sales_value";
const FULL = TH.adminAudit.visibility.full;
const MASKED = TH.adminAudit.visibility.masked;

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

function maskForRep(): Promise<void> {
  return setMetricAction(form({ role: ROLE, metric: METRIC, visibility: "masked" }));
}

function expectChange(since: string, before: string, after: string): void {
  const subject = activitiesFrom(auditLog().all(), since).find((activity) => activity.actorId === "u_ton")?.subject ?? "";
  expect(subject).toContain(TH.role[ROLE]);
  expect(subject).toContain(metricLabel(METRIC));
  expect(subject.indexOf(before)).toBeGreaterThanOrEqual(0);
  expect(subject.indexOf(after)).toBeGreaterThan(subject.indexOf(before));
}

describe("permission changes made in the Admin console are in the audit's activity view (AI-151)", () => {
  test("setting a metric's level names the role, the metric, and the old and new level", async () => {
    expect(defaultMetricVisibility(ROLE, METRIC)).toBe("full");
    const since = new Date().toISOString();
    await maskForRep();
    expectChange(since, FULL, MASKED);
  });

  test("reverting one override (คืนค่า) is recorded as the change back", async () => {
    await maskForRep();
    const since = new Date().toISOString();
    await removeOverrideAction(form({ override: `${ROLE}:metric:${METRIC}` }));
    expectChange(since, MASKED, FULL);
  });

  test("resetting a role is recorded", async () => {
    await maskForRep();
    const since = new Date().toISOString();
    await resetRoleAction(form({ role: ROLE }));
    expectChange(since, MASKED, FULL);
  });

  test("resetting every role is recorded", async () => {
    await maskForRep();
    const since = new Date().toISOString();
    await resetAllAction();
    expectChange(since, MASKED, FULL);
  });
});
