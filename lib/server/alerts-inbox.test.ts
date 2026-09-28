import { afterEach, describe, expect, test } from "bun:test";
import type { AccessContext, Alert } from "@/lib/contracts";
import { alertsInboxSwitch, liveAccessFor, setAlertsInboxEnabled } from "@/lib/access/enforce";
import { findUser } from "@/lib/data/entities/users";
import { openAlertsFor, relevanceOf, type RelevanceContext } from "./alerts";
import { todoFor } from "./feed";

const NOW = Date.parse("2026-09-25T09:00:00.000Z");
const ADMIN = "u_ton";
const OWNER = "u_anucha";
const MANAGER = "u_prasit";
const LONG_AGO = "2026-09-18T00:00:00.000Z";

function accessOf(userId: string): AccessContext {
  const user = findUser(userId);
  if (!user) throw new Error(`missing ${userId}`);
  return liveAccessFor(user);
}

function unopenedWarning(): Alert {
  const [base] = openAlertsFor(accessOf(OWNER));
  if (!base) throw new Error("no open alert to build on");
  return { ...base, id: "alert-inbox-test", ownerUserId: OWNER, alsoOwnerIds: [], severity: "P2", metric: "days_of_cover", at: LONG_AGO };
}

const MANAGER_CONTEXT: RelevanceContext = { watched: new Set(), reports: new Set([OWNER]), opened: new Set(), now: NOW };

describe("the alerts inbox switch", () => {
  const before = alertsInboxSwitch();
  afterEach(() => {
    setAlertsInboxEnabled(before?.enabled ?? true, before?.by ?? ADMIN);
  });

  test("off, the to-do list carries no anomaly and keeps the rest of the work", async () => {
    setAlertsInboxEnabled(true, ADMIN);
    expect((await todoFor(accessOf(OWNER), NOW)).some((item) => item.source === "alert")).toBe(true);
    setAlertsInboxEnabled(false, ADMIN);
    const todo = await todoFor(accessOf(OWNER), NOW);
    expect(todo.some((item) => item.source === "alert")).toBe(false);
    expect(todo.length).toBeGreaterThan(0);
  });

  test("off, a warning left unopened no longer reaches the manager, a critical one still does", () => {
    const warning = unopenedWarning();
    const manager = accessOf(MANAGER);
    setAlertsInboxEnabled(true, ADMIN);
    expect(relevanceOf(warning, manager, MANAGER_CONTEXT)).toBe("escalated");
    setAlertsInboxEnabled(false, ADMIN);
    expect(relevanceOf(warning, manager, MANAGER_CONTEXT)).not.toBe("escalated");
    expect(relevanceOf({ ...warning, severity: "P1" }, manager, MANAGER_CONTEXT)).toBe("escalated");
  });
});
