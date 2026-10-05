import { afterEach, describe, expect, test } from "bun:test";
import { liveAccessFor } from "@/lib/access/enforce";
import { accessFor } from "@/lib/access/policies";
import { resetRoleOverrides, setRoleTool } from "@/lib/access/role-overrides";
import { findUser, USERS } from "@/lib/data/entities/users";
import { templateFor } from "@/lib/dashboard/templates";
import { seasonalHints } from "@/lib/engine/seasons";
import { TH } from "@/lib/i18n/th";
import { defaultActionsFor, quickActionsFor } from "./quick-actions";

const CLAIMS_A_HABIT = /ทุก(เช้า|ครั้ง|ต้น|สัปดาห์|เดือน)|ถาม(บ่อย|ทุก)|เปิดดู\S*\s*\d|\d+\s*ครั้ง|คนตำแหน่งเดียวกับคุณ|ของคุณคือ/;
const MONTH_END = Date.parse("2026-09-28T09:00:00.000Z");

describe("reasons a user reads never invent their behaviour", () => {
  for (const user of USERS) {
    const access = accessFor(user);

    test(`${user.id}: role default chips say they are defaults`, () => {
      for (const action of defaultActionsFor(access)) {
        expect(action.reason.startsWith(TH.quick.starter(TH.role[user.role]))).toBe(true);
        expect(action.reason).not.toMatch(CLAIMS_A_HABIT);
      }
    });

    test(`${user.id}: template cards and calendar chips claim no habit`, () => {
      for (const seed of templateFor(access)) expect(seed.reason ?? "").not.toMatch(CLAIMS_A_HABIT);
      for (const hint of seasonalHints(access, MONTH_END)) expect(hint.reason).not.toMatch(CLAIMS_A_HABIT);
    });
  }
});

describe("chips only offer what the role can still answer", () => {
  afterEach(() => {
    resetRoleOverrides();
  });

  test("taking query_metric away from a role drops every metric chip, and giving it back restores them", () => {
    const user = findUser("u_krit");
    if (!user) throw new Error("no user u_krit");
    const metricChip = (intentKey: string) => !intentKey.startsWith("calendar|");
    expect(quickActionsFor(liveAccessFor(user)).some((action) => metricChip(action.intentKey))).toBe(true);
    setRoleTool("sales_rep", "query_metric", false, "u_ton");
    const withoutTool = quickActionsFor(liveAccessFor(user));
    expect(withoutTool.filter((action) => metricChip(action.intentKey))).toEqual([]);
    expect(withoutTool.map((action) => action.intentKey)).toContain("calendar|date");
    setRoleTool("sales_rep", "query_metric", true, "u_ton");
    expect(quickActionsFor(liveAccessFor(user)).some((action) => metricChip(action.intentKey))).toBe(true);
  });
});
