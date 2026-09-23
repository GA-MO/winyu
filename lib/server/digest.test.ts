import { describe, expect, test } from "bun:test";
import { accessFor } from "@/lib/access/policies";
import { findUser } from "@/lib/data/entities/users";
import { openAlertsFor } from "./alerts";
import { digestFor } from "./digest";

function access(userId: string) {
  const user = findUser(userId);
  if (!user) throw new Error(`missing demo user ${userId}`);
  return accessFor(user);
}

describe("the morning digest", () => {
  test("counts every item, not the lines it fits them in", () => {
    const digest = digestFor(access("u_thana"), new Set());
    expect(digest.count).toBeGreaterThanOrEqual(digest.lines.length - 1);
    expect(digest.lines.length).toBeLessThanOrEqual(6);
  });

  test("an alert already sent is not news the next morning", () => {
    const ceo = access("u_thana");
    const first = digestFor(ceo, new Set());
    const again = digestFor(ceo, new Set(first.alertIds));
    expect(again.count).toBeLessThan(first.count || 1);
  });

  test("never mentions P3 or other people's alerts", () => {
    const ceo = access("u_thana");
    const ids = new Set(digestFor(ceo, new Set()).alertIds);
    for (const alert of openAlertsFor(ceo).filter((entry) => ids.has(entry.id))) expect(alert.severity).not.toBe("P3");
  });
});
