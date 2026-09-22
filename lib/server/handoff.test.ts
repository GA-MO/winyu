import { afterAll, describe, expect, test } from "bun:test";
import type { AccessContext, ContextPacket, MetricQuery } from "@/lib/contracts";
import { accessFor } from "@/lib/access/policies";
import { findUser } from "@/lib/data/entities/users";
import { notifications, packets } from "@/lib/server/agent/collections";
import { TH } from "@/lib/i18n/th";
import { actOnPacket, createPacket, digestOf, resolveEvidence, slaFor, suggestOwner } from "./handoff";

const SENDER = "u_anucha";
const SALARY_READER = "u_may";
const created: string[] = [];

function access(userId: string): AccessContext {
  const user = findUser(userId);
  if (!user) throw new Error(`missing demo user ${userId}`);
  return accessFor(user);
}

function query(metric: MetricQuery["metric"], filters: MetricQuery["filters"] = {}): MetricQuery {
  return { metric, dims: [], filters, range: { from: "2026-08-01", to: "2026-08-31" }, grain: "day", compare: "none", limit: null };
}

function makePacket(toUserId: string, evidence: MetricQuery[]): ContextPacket {
  const recipient = findUser(toUserId);
  if (!recipient) throw new Error(`missing demo user ${toUserId}`);
  const packet = createPacket(
    {
      toUserId,
      title: "ทดสอบการส่งต่องาน",
      ask: "ช่วยตรวจตัวเลขให้หน่อย",
      urgency: "high",
      evidence,
      alertIds: [],
      digest: "",
      suggestedActions: [],
      threadId: null,
    },
    findUser(SENDER),
    recipient,
  );
  created.push(packet.id);
  return packet;
}

afterAll(() => {
  for (const id of created) packets().remove(id);
  for (const item of notifications().where((entry) => created.includes(entry.refId))) notifications().remove(item.id);
});

describe("handoff packets", () => {
  test("evidence is re-run under the recipient's scope, not copied from the sender", () => {
    const packet = makePacket("u_wee", [query("net_sales_volume", { region: ["northeast"] }), query("gross_margin"), query("avg_salary")]);
    const asPlanner = resolveEvidence(packet, access("u_wee"));
    expect(asPlanner[0].denied).toBe(false);
    expect(asPlanner[1].denied).toBe(true);
    expect(asPlanner[1].summary).toBe(TH.handoff.denied);
    expect(asPlanner[1].rows).toEqual([]);
    expect(asPlanner[2].masked).toBe(true);
    const asCfo = resolveEvidence(packet, access("u_siriporn"));
    expect(asCfo[1].denied).toBe(false);
  });

  test("a masked metric is flagged instead of shown", () => {
    const packet = makePacket("u_siriporn", [query("avg_salary")]);
    const asCfo = resolveEvidence(packet, access("u_siriporn"));
    expect(asCfo[0].masked).toBe(true);
    expect(asCfo[0].rows.every((row) => row.value === "***")).toBe(true);
    const asHr = resolveEvidence(packet, access(SALARY_READER));
    expect(asHr[0].masked).toBe(false);
  });

  test("a region outside the recipient's scope comes back denied", () => {
    const packet = makePacket("u_anucha", [query("net_sales_volume", { region: ["south"] })]);
    const asRsm = resolveEvidence(packet, access("u_anucha"));
    expect(asRsm[0].denied).toBe(true);
  });

  test("creating a packet notifies the recipient and sets an SLA", () => {
    const packet = makePacket("u_wee", [query("days_of_cover")]);
    expect(packet.status).toBe("open");
    expect(packet.sla).not.toBeNull();
    expect(notifications().where((item) => item.refId === packet.id && item.userId === "u_wee")).toHaveLength(1);
  });

  test("the lifecycle runs open to accepted to resolved and tells the sender each time", () => {
    const packet = makePacket("u_wee", [query("days_of_cover")]);
    const accepted = actOnPacket(packet, access("u_wee"), "accept", TH.handoff.replies.accept, null);
    expect(accepted.status).toBe("accepted");
    const resolved = actOnPacket(accepted, access("u_wee"), "resolve", "เติมสต๊อกแล้ว", "เติมสต๊อกแล้ว");
    expect(resolved.status).toBe("resolved");
    expect(resolved.outcome).toBe("เติมสต๊อกแล้ว");
    expect(resolved.thread).toHaveLength(2);
    expect(notifications().where((item) => item.refId === packet.id && item.userId === SENDER).length).toBeGreaterThanOrEqual(2);
  });

  test("the owner suggestion carries the RACI basis, past load and open load", () => {
    const suggestion = suggestOwner("days_of_cover", "north");
    expect(suggestion).not.toBeNull();
    expect((suggestion as { reason: string }).reason).toContain("เคยรับงานลักษณะนี้");
    expect((suggestion as { openLoad: number }).openLoad).toBeGreaterThanOrEqual(0);
  });

  test("the digest keeps only the last turns and labels who said what", () => {
    const digest = digestOf([
      { role: "user", text: "หนึ่ง" },
      { role: "assistant", text: "สอง" },
      { role: "user", text: "สาม" },
      { role: "assistant", text: "สี่" },
    ]);
    expect(digest).toContain(TH.handoff.asked);
    expect(digest).toContain(TH.handoff.answered);
    expect(digest).toContain("สี่");
  });

  test("urgency sets how long the recipient has", () => {
    expect(slaFor("high") < slaFor("low")).toBe(true);
  });
});
