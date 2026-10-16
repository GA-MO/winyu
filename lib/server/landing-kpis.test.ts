import { describe, expect, test } from "bun:test";
import { accessFor } from "@/lib/access/policies";
import { USERS } from "@/lib/data/entities/users";
import { layouts } from "./agent/collections";
import { landingKpis } from "./dashboard";

const PEOPLE = ["u_thana", "u_anucha", "u_krit", "u_may"];

describe("landing tiles", () => {
  test("every tile names the period its number covers, whether or not another tile shares its name", async () => {
    const saved = new Map(PEOPLE.map((id) => [id, layouts().get(id)]));
    let tiles = 0;
    try {
      for (const user of USERS.filter((entry) => PEOPLE.includes(entry.id))) {
        for (const kpi of await landingKpis(accessFor(user))) {
          tiles += 1;
          expect(kpi.period.length).toBeGreaterThan(0);
          expect(kpi.label).not.toContain(kpi.period);
        }
      }
    } finally {
      for (const [id, layout] of saved) {
        if (layout) layouts().put(layout);
        else layouts().remove(id);
      }
    }
    expect(tiles).toBeGreaterThan(0);
  });
});
