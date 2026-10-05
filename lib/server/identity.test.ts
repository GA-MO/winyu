import { describe, expect, test } from "bun:test";
import { dismissAttempt, identityKey, identityLinks, linkedUser, linkIdentity, noteUnlinkedAttempt, pendingAttempt, suggestedUser, unlinkedAttempts, unlinkIdentity, type ExternalIdentity } from "./identity";

const TENANT = "8f0c1d2e-0000-4000-8000-000000000001";
const ADMIN = "u_ton";

let serial = 0;

function entraPerson(email: string | null = null): ExternalIdentity {
  serial += 1;
  return { provider: "entra", tenant: TENANT, subject: `oid-${serial}-${Date.now()}`, email, name: "Somebody" };
}

describe("an outside identity reaches mascop only through a link IT made", () => {
  test("an unlinked identity resolves to nobody, and linking it resolves to exactly that user", () => {
    const person = entraPerson();
    expect(linkedUser(person)).toBeNull();
    linkIdentity(person, "u_beam", ADMIN, "2026-10-05T09:00:00Z");
    expect(linkedUser(person)?.id).toBe("u_beam");
  });

  test("the same object id in another tenant is a different person", () => {
    const person = entraPerson();
    linkIdentity(person, "u_beam", ADMIN, "2026-10-05T09:00:00Z");
    expect(linkedUser({ ...person, tenant: "another-tenant" })).toBeNull();
  });

  test("unlinking takes the person out again", () => {
    const person = entraPerson();
    linkIdentity(person, "u_krit", ADMIN, "2026-10-05T09:00:00Z");
    expect(unlinkIdentity(identityKey(person))).toBe(true);
    expect(linkedUser(person)).toBeNull();
    expect(identityLinks().some((link) => link.id === identityKey(person))).toBe(false);
  });

  test("a link to a user who does not exist is refused", () => {
    const person = entraPerson();
    expect(linkIdentity(person, "u_nobody", ADMIN, "2026-10-05T09:00:00Z")).toBeNull();
    expect(linkedUser(person)).toBeNull();
  });

  test("relinking an identity moves it to the new user instead of keeping both", () => {
    const person = entraPerson();
    linkIdentity(person, "u_beam", ADMIN, "2026-10-05T09:00:00Z");
    linkIdentity(person, "u_ploy", ADMIN, "2026-10-05T10:00:00Z");
    expect(linkedUser(person)?.id).toBe("u_ploy");
    expect(identityLinks().filter((link) => link.id === identityKey(person))).toHaveLength(1);
  });

  test("a LINE user id links the same way, so channels resolve people through this module", () => {
    const line: ExternalIdentity = { provider: "line", tenant: "2006123456", subject: `U${Date.now()}aBc`, email: null, name: "ผู้ใช้ LINE" };
    linkIdentity(line, "u_arm", ADMIN, "2026-10-05T09:00:00Z");
    expect(linkedUser(line)?.id).toBe("u_arm");
    expect(linkedUser({ ...line, subject: line.subject.toLowerCase() })).toBeNull();
  });
});

describe("IT sees who tried to sign in without access", () => {
  test("repeat attempts count up on one row and keep the first time", () => {
    const person = entraPerson("stranger@example.com");
    noteUnlinkedAttempt(person, "2026-10-05T08:00:00Z");
    const second = noteUnlinkedAttempt(person, "2026-10-05T08:30:00Z");
    expect(second).toMatchObject({ count: 2, firstAt: "2026-10-05T08:00:00Z", lastAt: "2026-10-05T08:30:00Z", email: "stranger@example.com" });
    expect(unlinkedAttempts().filter((attempt) => attempt.id === identityKey(person))).toHaveLength(1);
  });

  test("granting the identity clears its pending attempt", () => {
    const person = entraPerson();
    noteUnlinkedAttempt(person, "2026-10-05T08:00:00Z");
    linkIdentity(person, "u_nok", ADMIN, "2026-10-05T09:00:00Z");
    expect(pendingAttempt(identityKey(person))).toBeNull();
  });

  test("dismissing an attempt removes it without granting anything", () => {
    const person = entraPerson();
    noteUnlinkedAttempt(person, "2026-10-05T08:00:00Z");
    expect(dismissAttempt(identityKey(person))).toBe(true);
    expect(pendingAttempt(identityKey(person))).toBeNull();
    expect(linkedUser(person)).toBeNull();
  });

  test("the suggestion matches the directory email regardless of case and offers nobody for an outside address", () => {
    expect(suggestedUser({ email: "Beam@BoonRawd-Demo.co.th" })?.id).toBe("u_beam");
    expect(suggestedUser({ email: "guest@example.com" })).toBeNull();
    expect(suggestedUser({ email: null })).toBeNull();
  });
});
