import { describe, expect, test } from "bun:test";
import type { MetricQuery } from "@/lib/contracts";
import { accessFor } from "@/lib/access/policies";
import { findUser } from "@/lib/data/entities/users";
import { TH } from "@/lib/i18n/th";
import { actionsForRefusal } from "./next-actions";

const WHOLE_COMPANY: MetricQuery = { metric: "net_sales_value", dims: ["month"], filters: {}, range: { from: "2026-11-01", to: "2026-11-26" }, grain: "month", compare: "none", limit: 1 };
const AT = new Date("2026-10-17T03:00:00Z");

function approverAsked(userId: string): unknown {
  const user = findUser(userId);
  if (!user) throw new Error(userId);
  const [request] = actionsForRefusal(accessFor(user), WHOLE_COMPANY, AT);
  return (request?.input as { to?: unknown } | undefined)?.to;
}

describe("a whole-company ask outside scope (AI-199)", () => {
  test("the rep and the RSM ask the same approver: the nearest manager above them who may grant it", () => {
    expect(approverAsked("u_anucha")).toEqual(["u_prasit"]);
    expect(approverAsked("u_krit")).toEqual(["u_prasit"]);
  });

  test("the refusal sets the region inside the sentence with no spaces around it", () => {
    expect(TH.quick.wholeCompanyOutOfScope("ภาคอีสาน")).toBe("ยอดรวมทั้งบริษัทอยู่นอกขอบเขตของคุณ คุณเห็นได้เฉพาะภาคอีสาน จึงไม่แสดงตัวเลขของภาคอีสานแทนยอดทั้งบริษัท");
  });
});
