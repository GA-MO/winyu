import { describe, expect, test } from "bun:test";
import { liveAccessFor } from "@/lib/access/enforce";
import { findUser } from "@/lib/data/entities/users";
import { layouts } from "@/lib/server/agent/collections";
import { winyuTools } from "@/lib/server/agent/tools";
import { runWithAccess } from "@/lib/server/request-context";
import { approvedCallId } from "@/scripts/approved-call";

const USER = "u_anucha";
const THIS_MONTH = { metric: "net_sales_value", dims: [], filters: { region: ["northeast"] }, grain: "month", compare: "target", limit: null, period: "this_month", range: null };

function rsm() {
  const user = findUser(USER);
  if (!user) throw new Error(`no ${USER}`);
  return liveAccessFor(user);
}

describe("pin_widget", () => {
  test("pins a query asked by period, as query_metric takes it, with the period's dates", async () => {
    const result = (await runWithAccess(rsm(), () => winyuTools().pin_widget.execute({ title: "ยอดอีสานเดือนนี้", kind: "metric", query: THIS_MONTH }, { toolCallId: approvedCallId(USER, "pin_widget") }))) as { ok: boolean; data?: { widgetId: string } };
    expect(result).toMatchObject({ ok: true });
    const widget = layouts().get(USER)?.widgets.find((entry) => entry.id === result.data?.widgetId);
    expect(widget?.query.range).toEqual({ from: expect.stringMatching(/^\d{4}-\d{2}-01$/), to: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });
  });
});
