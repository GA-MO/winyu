import { describe, expect, test } from "bun:test";
import { findUser } from "@/lib/data/entities/users";
import type { SharedCard } from "@/lib/share/card";
import { sendPreview } from "./preview";

const ISAN_AGENTS = { metric: "net_sales_value", compare: "target", dims: ["agent"], filters: { region: "northeast" }, grain: "month", sort: "delta_asc", period: "this_month", limit: 10 };
const REGION_CARD: SharedCard = { kind: "tool", reads: [{ tool: "query_metric", input: ISAN_AGENTS }] };
const AGENT = "ขอนแก่นมหาชัย";

function rsm() {
  const user = findUser("u_anucha");
  if (!user) throw new Error("no u_anucha");
  return user;
}

describe("the send preview", () => {
  test("words that single out one agent on the region's card give the title, the agent's own figure and the claim the row refutes (AI-167, AI-168, AI-198)", async () => {
    const preview = await sendPreview(REGION_CARD, rsm(), [], ["เข้าไปคุยกับเอเย่นต์เจ้านี้", `${AGENT}ก็ตกเยอะเหมือนกัน ฝากงานให้คุณกฤตเข้าไปคุยกับเอเย่นต์เจ้านี้`]);
    expect(preview.title ?? "").toContain(AGENT);
    expect(preview.focus?.labels).toEqual([AGENT]);
    expect(preview.focus?.hero ?? "").toMatch(new RegExp(`^${AGENT} .*-?\\d+\\.\\d%`));
    expect(preview.focus?.claim ?? "").toContain(AGENT);
    expect(preview.subject).toBe("ภาคอีสาน");
  });

  test("words that name no row leave the card's own title and figure", async () => {
    const preview = await sendPreview(REGION_CARD, rsm(), [], ["ช่วยดูหน่อย"]);
    expect(preview.focus).toBeNull();
    expect(preview.title ?? "").not.toContain(AGENT);
  });
});
