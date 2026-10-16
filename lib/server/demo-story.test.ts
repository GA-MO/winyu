import { describe, expect, test } from "bun:test";
import { alertOutcomes, alerts } from "@/lib/server/agent/collections";
import { notificationsOf } from "@/lib/server/notify";
import { mattersWaitingOn, shares } from "@/lib/server/share/shares";
import { ensureDemoStory } from "./demo-story";

describe("the demo story", () => {
  test("leaves the northeast alert and last time's lesson, and sends nobody anything, so the first matter on stage is the one the presenter sends", async () => {
    const before = { matters: shares().all().length, krit: notificationsOf("u_krit").length };
    const story = await ensureDemoStory();
    expect(story).not.toBeNull();
    expect(alerts().get(story?.alertId ?? "")).not.toBeNull();
    expect(alertOutcomes().get(story?.outcomeId ?? "")).not.toBeNull();
    expect(shares().all().length).toBe(before.matters);
    expect(shares().all().some((matter) => matter.alertIds.includes(story?.alertId ?? ""))).toBe(false);
    expect(mattersWaitingOn("u_krit")).toEqual([]);
    expect(notificationsOf("u_krit").length).toBe(before.krit);
  });
});
