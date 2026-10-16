import { describe, expect, test } from "bun:test";
import { describeEntity } from "@/lib/data/query";
import { AGENTS, agentsOwnedBy } from "./agents";
import { findUser } from "./users";

const NORTHEAST_OWNERS = {
  ag_nea_01: "u_krit",
  ag_nea_02: "u_krit",
  ag_nea_03: "u_krit",
  ag_nea_04: "u_nok",
  ag_nea_05: "u_krit",
  ag_nea_06: "u_nok",
  ag_nea_07: "u_nok",
  ag_nea_08: "u_nok",
};

describe("every agent has one assigned sales rep", () => {
  test("the owner is a sales rep of the agent's own region", () => {
    for (const agent of AGENTS) {
      const owner = findUser(agent.ownerId);
      expect(owner?.role).toBe("sales_rep");
      expect(owner?.region).toBe(agent.region);
    }
  });

  test("a rep owns the agents of their territory province", () => {
    expect(AGENTS.filter((agent) => agent.provinceId === "pv_khonkaen").map((agent) => agent.ownerId)).toEqual(["u_krit", "u_krit"]);
    expect(AGENTS.filter((agent) => agent.provinceId === "pv_buriram").map((agent) => agent.ownerId)).toEqual(["u_nok", "u_nok"]);
    expect(AGENTS.filter((agent) => agent.provinceId === "pv_songkhla").every((agent) => agent.ownerId === "u_arm" && agent.ownerBasis === "territory")).toBe(true);
  });

  test("northeast agents outside a rep's province go to the least-loaded rep, so Khon Kaen's rep keeps อุบลศรีสุข and อีสานรุ่งโรจน์", () => {
    const owners = Object.fromEntries(AGENTS.filter((agent) => agent.region === "northeast").map((agent) => [agent.id, agent.ownerId]));
    expect(owners).toEqual(NORTHEAST_OWNERS);
    expect(agentsOwnedBy("u_krit").map((agent) => agent.nameTh)).toEqual(["ขอนแก่นมหาชัย", "อีสานรุ่งโรจน์ ค้าส่ง", "โคราชสหภัณฑ์", "อุบลศรีสุข เทรดดิ้ง"]);
    expect(AGENTS.find((agent) => agent.id === "ag_nea_05")?.ownerBasis).toBe("region");
  });

  test("describe_entity names an agent's rep and why they own it", () => {
    const described = describeEntity("agent", "อุบลศรีสุข");
    if (!described.ok) throw new Error(described.error);
    expect(described.data.ownerId).toBe("u_krit");
    expect(String(described.data["พนักงานขายที่ดูแล"])).toContain("คุณกฤต");
    expect(String(described.data["เหตุที่ได้ดูแล"])).toContain("ไม่มีพนักงานขายประจำ");
    expect(described.summary).toContain("คุณกฤต");
  });
});
