import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { accessFor } from "@/lib/access/policies";
import { findUser } from "@/lib/data/entities/users";
import { EMPLOYEES } from "@/lib/data/entities/people";
import { signalsOf } from "@/lib/engine/people-signals";
import { findPeople, personProfile } from "./people";

const NO_FILTER = { region: null, departmentId: null, manager: null, query: null, flag: null };

function accessOf(userId: string) {
  const user = findUser(userId);
  if (!user) throw new Error(`missing ${userId}`);
  return accessFor(user);
}

async function profileOf(userId: string, personId: string) {
  const result = await personProfile(accessOf(userId), personId, null);
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

async function factLabels(userId: string, personId: string): Promise<string[]> {
  return (await profileOf(userId, personId)).facts.map((fact) => fact.label);
}

describe("people directory", () => {
  test("every employee has a unique photo that exists on disk", () => {
    const photos = EMPLOYEES.map((employee) => employee.photo);
    expect(new Set(photos).size).toBe(photos.length);
    for (const photo of photos) expect(existsSync(join(process.cwd(), "public", photo))).toBe(true);
  });

  test("the northeast team lists its lead first and shows the open positions", async () => {
    const result = await findPeople(accessOf("u_anucha"), { ...NO_FILTER, manager: "u_anucha" });
    expect(result.data[0]?.id).toBe("u_anucha");
    expect(result.data.map((row) => row.id)).toContain("e_joy");
    expect(result.open_positions.length).toBe(3);
  });

  test("the new Korat rep is on probation and doing heavy overtime for a new hire", () => {
    const joy = EMPLOYEES.find((employee) => employee.id === "e_joy");
    if (!joy) throw new Error("missing e_joy");
    const signals = signalsOf(joy);
    expect(signals.onProbation).toBe(true);
    expect(signals.risk).toBe("watch");
  });
});

describe("people access", () => {
  test("HR sees the risk badge and pay", async () => {
    const joy = (await findPeople(accessOf("u_may"), { ...NO_FILTER, query: "จอย" })).data[0];
    expect(joy?.badges.map((badge) => badge.label)).toContain("ควรคุยเรื่องความก้าวหน้า");
    expect((await factLabels("u_may", "e_pong"))).toContain("เงินเดือน");
  });

  test("a regional manager sees facts about their team but no risk judgement and no pay", async () => {
    const rows = (await findPeople(accessOf("u_anucha"), { ...NO_FILTER, manager: "u_anucha" })).data;
    const pong = rows.find((row) => row.id === "e_pong");
    expect(pong?.badges.some((badge) => badge.label.startsWith("โอที"))).toBe(true);
    expect(pong?.badges.some((badge) => badge.label.includes("ลาออก") || badge.label.includes("ความก้าวหน้า"))).toBe(false);
    expect((await factLabels("u_anucha", "e_pong"))).not.toContain("เงินเดือน");
    expect((await profileOf("u_anucha", "e_pong")).history.length).toBeGreaterThan(0);
  });

  test("a regional manager cannot open someone outside their region", async () => {
    expect((await personProfile(accessOf("u_anucha"), "u_ploy", null)).ok).toBe(false);
    expect((await findPeople(accessOf("u_anucha"), { ...NO_FILTER, region: "north" })).data).toEqual([]);
  });

  test("a sales rep gets directory fields only for a colleague", async () => {
    const joy = await profileOf("u_krit", "e_joy");
    expect(joy.badges).toEqual([]);
    expect(joy.history).toEqual([]);
    expect(joy.certificates).toEqual([]);
    expect(joy.facts.map((fact) => fact.label)).toEqual(["ฝ่าย", "พื้นที่", "หัวหน้า"]);
  });

  test("a flag cannot be used to probe risk without the right to see it", async () => {
    expect((await findPeople(accessOf("u_anucha"), { ...NO_FILTER, flag: "risk" })).data).toEqual([]);
    expect((await findPeople(accessOf("u_krit"), { ...NO_FILTER, flag: "overtime" })).data).toEqual([]);
  });
});
