import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { liveAccessFor } from "@/lib/access/enforce";
import { metricQuerySchema, type Story } from "@/lib/contracts";
import { findUser } from "@/lib/data/entities/users";
import { investigations } from "./agent/collections";
import { latestInvestigation, saveInvestigation } from "./investigations";
import { morningBriefFor } from "./morning-brief";

setDefaultTimeout(60_000);

const CEO = "u_thana";
const NOVEMBER = { from: "2026-11-01", to: "2026-11-26" };

function story(id: string, metric: Story["subject"]["metric"], region: Story["subject"]["region"], filters: Record<string, string[]>): Story {
  return {
    id,
    kind: "urgent",
    finding: `เรื่อง ${id}`,
    scope: id,
    subject: { metric, region },
    evidence: { title: id, query: metricQuerySchema.parse({ metric, dims: ["agent"], filters, range: NOVEMBER, grain: "month", compare: "prev_period", limit: 10 }) },
    ruledOut: [],
    action: null,
  };
}

describe("the morning stories drawer order (AI-155)", () => {
  test("among urgent stories, the one the most severe open alerts back comes first; equal ones keep Winyu's order", async () => {
    const user = findUser(CEO);
    if (!user) throw new Error("no CEO");
    const before = latestInvestigation(CEO);
    const stories = [
      story("dc_lamphun", "days_of_cover", "north", { dc: ["dc_lamphun"] }),
      story("south_ar", "ar_overdue", "south", { region: ["south"] }),
      story("isan_sales", "net_sales_volume", "northeast", { region: ["northeast"] }),
    ];
    saveInvestigation({ id: CEO, userId: CEO, at: new Date().toISOString(), model: "test", stories, checkedCount: 3, costUsd: 0 });
    try {
      const brief = await morningBriefFor(liveAccessFor(user));
      expect(brief?.cards.map((card) => card.story.id)).toEqual(["isan_sales", "dc_lamphun", "south_ar"]);
    } finally {
      if (before) saveInvestigation(before);
      else investigations().remove(CEO);
    }
  });
});
