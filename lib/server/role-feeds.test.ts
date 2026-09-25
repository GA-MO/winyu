import { describe, expect, test } from "bun:test";
import type { AccessContext } from "@/lib/contracts";
import { liveAccessFor, setHandoffEnabled, handoffSwitch } from "@/lib/access/enforce";
import { findUser } from "@/lib/data/entities/users";
import { templateFor } from "@/lib/dashboard/templates";
import { explain } from "@/lib/engine/hypothesis";
import { markReachable, offlineSince } from "@/lib/server/connectors/catalog";
import { openAlertsFor, relevanceOf } from "./alerts";
import { campaignFeedFor } from "./campaign-feed";
import { feedFor, goodNewsFor, todoFor } from "./feed";
import { systemFeedFor } from "./system-feed";

const NOW = Date.parse("2026-09-25T09:00:00.000Z");

function accessOf(userId: string): AccessContext {
  const user = findUser(userId);
  if (!user) throw new Error(`missing ${userId}`);
  return liveAccessFor(user);
}

describe("marketing hears how its own campaigns went", () => {
  test("the campaign's owner gets its result against target, grounded in the uplift metric; nobody else does", async () => {
    const [result] = await campaignFeedFor(accessOf("u_pim"));
    expect(result).toMatchObject({ source: "campaign", label: "ซีสโตร์ โซดาซัมเมอร์ 1 แถม 1", tone: "success" });
    expect(result?.detail).toContain("เป้า 35%");
    expect(await campaignFeedFor(accessOf("u_ben"))).toEqual([]);
    expect(await campaignFeedFor(accessOf("u_somchai"))).toEqual([]);
  });

  test("the sell-out a promotion lifted is the campaign's story, so its owner reads it once", async () => {
    const pim = accessOf("u_pim");
    const lifted = openAlertsFor(pim).filter((alert) => alert.campaignId === "cmp_cstore_soda_promo");
    expect(lifted.length).toBeGreaterThan(0);
    expect(lifted.every((alert) => relevanceOf(alert, pim) === "mine")).toBe(true);
    const good = await goodNewsFor(pim, NOW);
    expect(good.filter((item) => item.story === "campaign:cmp_cstore_soda_promo")).toHaveLength(1);
  });
});

describe("money owed reaches the people who can collect it", () => {
  test("the south's overdue rise names its agents and lands with the south's sales manager too", async () => {
    const found = explain({ metric: "ar_overdue", dims: { region: "south" }, direction: "up", window: { from: "2026-08-01", to: "2026-08-31" }, observed: 1.7, expected: 1.2, region: "south", detail: null });
    expect(found.hypothesis).toContain("สงขลาทักษิณ เทรดดิ้ง (+258%)");
    const south = accessOf("u_saranya");
    expect((await todoFor(south, NOW)).some((item) => item.kind === "alert:ar_overdue")).toBe(true);
  });
});

describe("the administrator's feed is about Cop itself", () => {
  test("a connector that stopped answering is on IT's feed, and on no one else's; a switch left off is policy, not a matter", async () => {
    const before = offlineSince("crm_demo");
    const handoff = handoffSwitch();
    markReachable("crm_demo", false);
    setHandoffEnabled(false, "u_ton");
    try {
      const items = systemFeedFor(accessOf("u_ton"));
      expect(items.some((item) => item.key.startsWith("system:offline:crm_demo"))).toBe(true);
      expect(items.some((item) => item.key.startsWith("system:switch:handoff"))).toBe(false);
      expect((await feedFor(accessOf("u_thana"), NOW)).some((item) => item.source === "system")).toBe(false);
    } finally {
      markReachable("crm_demo", before === null);
      if (handoff) setHandoffEnabled(handoff.enabled, handoff.by);
    }
  });

  test("IT's starter dashboard no longer carries a sales alert card it cannot read", () => {
    expect(templateFor(accessOf("u_ton")).some((seed) => seed.kind === "alert_list")).toBe(false);
  });
});
