import { describe, expect, test } from "bun:test";
import type { AuditEntry } from "@/lib/contracts";
import { matterOf } from "@/lib/share/matter";
import { usageSummaryOf } from "@/lib/server/tools/admin-audit";
import { activitiesFrom } from "./activity";
import { recordShare, auditLog } from "./audit";
import { shares } from "./share/shares";

const PIN_TITLE = "มูลค่าขายเข้ารายเอเย่นต์เทียบเป้า";
const PIN: AuditEntry = {
  id: "pin-1",
  at: "2026-10-16T21:32:41.087Z",
  userId: "u_krit",
  tool: "pin_widget",
  connector: "winyu",
  argsHash: "e9221433408fb304",
  decision: "allow",
  rowsReturned: 1,
  latencyMs: 1,
  args: JSON.stringify({ title: PIN_TITLE, kind: "bar", query: { metric: "net_sales_value", dims: ["agent"], filters: {}, range: null, grain: "month", compare: "target", limit: 10, sort: "value_desc", where: null, period: "this_month" } }),
  toolCallId: "call_1323275",
  initiator: "person",
};

function person(name: string, questions: number, calls: number) {
  return { user_name: name, role_label: "พนักงานขาย", questions, calls };
}

describe("IT activity and usage say what happened (AI-200)", () => {
  test("a pin row names the card that was pinned", () => {
    const [pinned] = activitiesFrom([PIN], "2026-10-10T00:00:00.000Z");
    expect(pinned?.subject).toBe(PIN_TITLE);
  });

  test("a usage tie is called a tie, with everyone who shares the top", () => {
    const summary = usageSummaryOf([person("คุณกฤต", 1, 4), person("คุณอนุชา", 1, 3), person("คุณธนา", 1, 2), person("คุณต้น", 1, 1)], 7);
    expect(summary).not.toContain("มากที่สุด คุณกฤต");
    expect(summary).toContain("เท่ากัน");
    for (const name of ["คุณกฤต", "คุณอนุชา", "คุณธนา", "คุณต้น"]) expect(summary).toContain(name);
  });

  test("one person ahead is still named the most", () => {
    expect(usageSummaryOf([person("คุณกฤต", 3, 4), person("คุณอนุชา", 1, 3)], 7)).toContain("มากที่สุด คุณกฤต");
  });
});

const LONG_TITLE = "มูลค่าขายเข้า · รายเอเย่นต์ · ภาคอีสาน · อีสานรุ่งโรจน์ ค้าส่ง, อุบลศรีสุข เทรดดิ้ง";

describe("an activity row names its matter by the matter's full title (AI-278)", () => {
  test("a send whose audit arguments clipped the title shows the title the matter carries", () => {
    const since = new Date(Date.now() - 1000).toISOString();
    const code = `ai278-${Date.now()}`;
    shares().put(matterOf({ id: code, at: new Date().toISOString(), senderId: "u_thana", title: LONG_TITLE, question: null, note: null, card: { kind: "tool", reads: [{ tool: "query_metric", input: { metric: "net_sales_value" } }] }, deliveries: [{ userId: "u_anucha", asked: "winyu", via: "winyu", fallback: null }], openedBy: [], lastViewedAt: null }));
    recordShare({ code, userId: "u_thana", title: LONG_TITLE, reads: ["query_metric"], deliveries: [{ userId: "u_anucha", asked: "winyu", via: "winyu", fallback: null }] });
    expect(JSON.stringify(auditLog().all().find((entry) => entry.toolCallId === code)?.args)).not.toContain("เทรดดิ้ง");
    const sent = activitiesFrom(auditLog().all(), since).find((activity) => activity.actorId === "u_thana" && activity.subject.startsWith("มูลค่าขายเข้า · รายเอเย่นต์"));
    expect(sent?.subject).toBe(LONG_TITLE);
  });
});
