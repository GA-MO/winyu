import { describe, expect, test } from "bun:test";
import { liveAccessFor } from "@/lib/access/enforce";
import { findUser } from "@/lib/data/entities/users";
import { loadDictionary } from "@/lib/server/master-data";
import { openAlertsFor } from "./alerts";
import { ambientFor, visitsFor } from "./dashboard";

describe("the sales rep's landing", () => {
  test("no alert card repeats an agent the visit list already names", async () => {
    const user = findUser("u_krit");
    if (!user) throw new Error("no user u_krit");
    const access = liveAccessFor(user);
    const visits = await visitsFor(access);
    expect(visits.length).toBeGreaterThan(0);
    const dictionary = await loadDictionary();
    const alerts = new Map(openAlertsFor(access).map((alert) => [alert.id, alert]));
    const cardAgents = (await ambientFor(access, visits))
      .flatMap((card) => (card.alertId ? [alerts.get(card.alertId)?.dims.agent] : []))
      .flatMap((agent) => (agent ? [dictionary.displayLabel("agent", agent)] : []));
    const visited = new Set(visits.map((stop) => stop.agent));
    expect(cardAgents.filter((agent) => visited.has(agent))).toEqual([]);
  });
});
