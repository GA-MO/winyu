import { describe, expect, test } from "bun:test";
import { findUser } from "@/lib/data/entities/users";
import type { SharedCard } from "@/lib/share/card";
import { recipientScopesFor } from "@/lib/server/grants";
import { createShare } from "./deliver";

const RANGE = { from: "2026-09-01", to: "2026-09-22" };
const AR_CARD: SharedCard = { kind: "tool", reads: [{ tool: "query_metric", input: { metric: "ar_overdue", dims: ["region"], grain: "month", range: RANGE, compare: "prev_period", filters: {}, sort: "value_desc", limit: 10 } }] };
const SALES_CARD: SharedCard = { kind: "tool", reads: [{ tool: "query_metric", input: { metric: "net_sales_value", dims: ["region"], grain: "month", range: RANGE, compare: "target", filters: {}, sort: "value_desc", limit: 10 } }] };

function user(id: string) {
  const found = findUser(id);
  if (!found) throw new Error(`no ${id}`);
  return found;
}

describe("before a card is sent, the sender learns what each recipient would not see", () => {
  test("a sales rep whose role masks overdue AR would see it masked, and no grant can lift that", () => {
    expect(recipientScopesFor(user("u_thana"), AR_CARD, ["u_krit"])).toEqual([{ userId: "u_krit", name: user("u_krit").nameTh, metric: "ar_overdue", hidden: "masked", grantable: false }]);
  });

  test("a regional manager would see only their region's rows, which the CEO may open with a temporary grant", () => {
    expect(recipientScopesFor(user("u_thana"), SALES_CARD, ["u_anucha"])).toEqual([{ userId: "u_anucha", name: user("u_anucha").nameTh, metric: "net_sales_value", hidden: "rows", grantable: true }]);
  });

  test("someone who sees all of it is not named", () => {
    expect(recipientScopesFor(user("u_thana"), SALES_CARD, ["u_prasit"])).toEqual([]);
  });

  test("the send itself reports who still sees the card masked", async () => {
    const outcome = await createShare(user("u_thana"), { card: AR_CARD, question: "ลูกหนี้ค้างชำระแยกตามภาค", ask: "ช่วยตามหนี้", intent: "act", recipients: [{ userId: "u_krit", channel: "winyu" }] });
    expect(outcome.ok && outcome.hidden.map((scope) => [scope.userId, scope.hidden])).toEqual([["u_krit", "masked"]]);
  });
});
