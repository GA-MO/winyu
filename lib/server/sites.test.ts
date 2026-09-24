import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { accessFor } from "@/lib/access/policies";
import { findUser } from "@/lib/data/entities/users";
import { SITES, siteById } from "@/lib/data/entities/sites";
import { safetyOf } from "@/lib/engine/site-safety";
import { listSites, siteDetail } from "./sites";

function accessOf(userId: string) {
  const user = findUser(userId);
  if (!user) throw new Error(`missing ${userId}`);
  return accessFor(user);
}

function site(id: string) {
  const found = siteById(id);
  if (!found) throw new Error(`missing ${id}`);
  return found;
}

describe("site safety", () => {
  test("every site photo exists", () => {
    for (const entry of SITES) expect(existsSync(join(process.cwd(), "public", entry.photo))).toBe(true);
  });

  test("Khon Kaen had a lost-time injury a week ago with the fix still open", () => {
    const safety = safetyOf(site("pl_khonkaen"));
    expect(safety.daysSinceLti).toBe(7);
    expect(safety.status).toBe("alarm");
    expect(safety.open.length).toBe(1);
    expect(safety.recent.length).toBeGreaterThan(safety.previous.length);
  });

  test("Sing Buri has gone well over a year without one", () => {
    const safety = safetyOf(site("pl_singburi"));
    expect(safety.status).toBe("clear");
    expect(safety.daysSinceLti).toBeGreaterThan(365);
  });

  test("the overview puts the sites that need attention first", () => {
    const rows = listSites().data;
    expect(rows[0]?.id).toBe("pl_khonkaen");
    expect(rows[0]?.trailing.tone).toBe("bad");
    expect(rows.at(-1)?.badges.some((badge) => badge.tone === "danger")).toBe(false);
    expect(rows.find((row) => row.id === "dc_khonkaen")?.trailing.tone).toBe("good");
  });

  test("the detail finds a site by its Thai name and shows its people at the viewer's level", () => {
    const hr = siteDetail(accessOf("u_may"), null, "โรงงานขอนแก่น");
    if (!hr.ok || !("people" in hr.data)) throw new Error("expected detail");
    const dang = hr.data.people.find((person) => person.id === "e_dang");
    expect(dang?.badges.some((badge) => badge.label.startsWith("ใบขับขี่รถยก"))).toBe(true);
    const rep = siteDetail(accessOf("u_krit"), "pl_khonkaen", null);
    if (!rep.ok || !("people" in rep.data)) throw new Error("expected detail");
    expect(rep.data.people.every((person) => person.badges.length === 0)).toBe(true);
  });
});
