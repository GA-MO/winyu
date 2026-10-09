import { describe, expect, test } from "bun:test";
import { liveAccessFor } from "@/lib/access/enforce";
import { findUser } from "@/lib/data/entities/users";
import { describeInScope } from "./entities";

const NORTHEAST_AGENT = "ag_nea_01";
const BANGKOK_AGENT = "ag_bkk_01";

function accessOf(id: string) {
  const user = findUser(id);
  if (!user) throw new Error(`no user ${id}`);
  return liveAccessFor(user);
}

describe("describe_entity keeps a regional record inside the caller's regions", () => {
  test("the northeast rep reads a northeast agent and is refused a Bangkok one, by name or id", async () => {
    const rep = accessOf("u_krit");
    expect((await describeInScope(rep, "agent", NORTHEAST_AGENT)).ok).toBe(true);
    expect(await describeInScope(rep, "agent", BANGKOK_AGENT)).toMatchObject({ ok: false, code: "PERMISSION_DENIED" });
    expect(await describeInScope(rep, "agent", "กรุงไทยเบเวอเรจ")).toMatchObject({ ok: false, code: "PERMISSION_DENIED" });
  });

  test("the CEO reads both, and records without a region stay open to the rep", async () => {
    const ceo = accessOf("u_thana");
    expect((await describeInScope(ceo, "agent", BANGKOK_AGENT)).ok).toBe(true);
    expect((await describeInScope(ceo, "agent", NORTHEAST_AGENT)).ok).toBe(true);
    expect((await describeInScope(accessOf("u_krit"), "user", "u_krit")).ok).toBe(true);
  });
});
