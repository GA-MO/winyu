import { describe, expect, test } from "bun:test";
import { accessFor } from "@/lib/access/policies";
import { USERS } from "@/lib/data/entities/users";
import { TH } from "@/lib/i18n/th";
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

  test("a trend tile that leads with its latest month is labelled with that month, never the range the widget spans (AI-157)", async () => {
    const ceo = USERS.find((entry) => entry.id === "u_thana");
    if (!ceo) throw new Error("no CEO");
    const saved = layouts().get(ceo.id);
    try {
      const trend = (await landingKpis(accessFor(ceo))).find((kpi) => kpi.detail?.startsWith(TH.dash.versusBucket("")));
      if (!trend) throw new Error("no trend tile");
      expect(trend.period).toMatch(/^\S+ \d{2}$/);
      expect(trend.period).not.toContain("–");
    } finally {
      if (saved) layouts().put(saved);
      else layouts().remove(ceo.id);
    }
  });
});
