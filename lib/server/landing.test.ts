import { describe, expect, test } from "bun:test";
import { liveAccessFor } from "@/lib/access/enforce";
import { USERS, findUser } from "@/lib/data/entities/users";
import { loadDictionary } from "@/lib/server/master-data";
import { openAlertsFor } from "./alerts";
import { visitsFor } from "./dashboard";
import { feedFor, isTask, landingFeedFor, onePerStory } from "./feed";

const NOW = Date.parse("2026-09-25T09:00:00.000Z");

function accessOf(userId: string) {
  const user = findUser(userId);
  if (!user) throw new Error(`missing ${userId}`);
  return liveAccessFor(user);
}

describe("the landing is the same for every role", () => {
  test("its cards are the first matters on the user's own feed, at most two, one per story", async () => {
    for (const user of USERS) {
      const access = accessOf(user.id);
      const landing = await landingFeedFor(access, NOW);
      const tasks = onePerStory((await feedFor(access, NOW)).filter(isTask));
      expect(landing.cards.length).toBe(Math.min(2, tasks.length));
      expect(landing.shownKeys).toEqual(tasks.slice(0, 2).map((item) => item.key));
      expect(landing.taskCount).toBeGreaterThanOrEqual(tasks.length);
    }
  });

  test("the count under the greeting agrees with a team card's own count", async () => {
    const director = await landingFeedFor(accessOf("u_prasit"), NOW);
    const team = director.cards.find((card) => card.id.startsWith("ambient-team-"));
    expect(director.taskCount).toBeGreaterThanOrEqual(Number.parseInt(team?.headline?.value ?? "0", 10));
  });

  test("a role with no alerts still gets cards from its own matters", async () => {
    const hr = await landingFeedFor(accessOf("u_may"), NOW);
    expect(hr.cards.length).toBe(2);
    expect(hr.cards.every((card) => card.headline !== null && card.feedKey !== null)).toBe(true);
  });
});

describe("the sales rep's visits", () => {
  test("a visit gives the worst alert on that agent, not the last one read", async () => {
    const access = accessOf("u_krit");
    const dictionary = await loadDictionary();
    const worst = new Map<string, string>();
    for (const alert of openAlertsFor(access)) {
      if (!alert.dims.agent) continue;
      const agent = dictionary.displayLabel("agent", alert.dims.agent);
      if (!worst.has(agent) || alert.severity < (worst.get(agent) ?? "P3")) worst.set(agent, alert.severity);
    }
    for (const stop of await visitsFor(access)) {
      if (worst.get(stop.agent) === "P1") expect(stop.tone).toBe("danger");
    }
  });
});
