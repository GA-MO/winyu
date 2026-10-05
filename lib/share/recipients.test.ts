import { describe, expect, test } from "bun:test";
import { USERS } from "@/lib/data/entities/users";
import { matchRecipient, matchRecipients, namesPerson, resolvedPeople } from "./recipients";

const COLLEAGUES = USERS.filter((user) => user.id !== "u_thana");

function idsOf(asked: string): string[] | string {
  const match = matchRecipient(asked, COLLEAGUES);
  if (match.kind === "found") return [match.person.id];
  if (match.kind === "ambiguous") return match.candidates.map((person) => person.id);
  return "unknown";
}

describe("recipient names", () => {
  test("a name as people type it finds the one colleague it means", () => {
    expect(idsOf("คุณกฤต")).toEqual(["u_krit"]);
    expect(idsOf("กฤต")).toEqual(["u_krit"]);
    expect(idsOf("คุณกฤต จันทร์เสน")).toEqual(["u_krit"]);
    expect(idsOf("Krit")).toEqual(["u_krit"]);
    expect(idsOf("u_krit")).toEqual(["u_krit"]);
  });

  test("a whole first name beats part of another name, so คุณนก is not คุณกนก", () => {
    expect(idsOf("คุณนก")).toEqual(["u_nok"]);
    expect(idsOf("กนก")).toEqual(["u_kanok"]);
  });

  test("a name that fits several colleagues returns every candidate and resolves nobody", () => {
    expect(idsOf("จันทร")).toEqual(["u_krit", "u_ploy"]);
    expect(resolvedPeople(matchRecipients(["คุณกฤต", "จันทร"], COLLEAGUES))).toBeNull();
  });

  test("a name nobody has, or the sender's own, is unknown", () => {
    expect(idsOf("คุณสมศรี")).toBe("unknown");
    expect(idsOf("คุณธนา")).toBe("unknown");
    expect(idsOf("  ")).toBe("unknown");
  });

  test("several names resolve to each person once", () => {
    expect(resolvedPeople(matchRecipients(["คุณกฤต", "u_krit", "คุณนก"], COLLEAGUES))?.map((person) => person.id)).toEqual(["u_krit", "u_nok"]);
  });

  test("a lookup row is the recipient when the typed name or id points at it", () => {
    const krit = { id: "u_krit", nameTh: "คุณกฤต จันทร์เสน", title: "พนักงานขาย ขอนแก่น" };
    expect(namesPerson("คุณกฤต", krit)).toBe(true);
    expect(namesPerson("u_krit", krit)).toBe(true);
    expect(namesPerson("คุณนก", krit)).toBe(false);
  });
});
