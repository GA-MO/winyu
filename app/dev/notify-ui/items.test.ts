import { describe, expect, test } from "bun:test";
import type { NotificationKind } from "@/lib/contracts";
import { bellCount, cappedDigest, digestOf, hasUnreadUpdate, type NotifyItem } from "./items";

const KRIT = { name: "คุณกฤต จันทร์เสน", photo: null };
const THANA = { name: "คุณธนา วงศ์สกุล", photo: null };

function item(kind: NotificationKind, read: boolean, person = THANA): NotifyItem {
  return { id: `${kind}-${person.name}-${read}`, kind, title: kind, person, at: "2026-10-09T10:00:00.000Z", read, target: `/${kind}` };
}

describe("notify-ui items", () => {
  test("the bell counts open decisions whether read or not, and never updates", () => {
    expect(bellCount([item("grant_request", true, KRIT), item("handoff", false), item("share", false), item("email", false)])).toBe(2);
  });

  test("the Shared dot shows only for an unread update", () => {
    expect(hasUnreadUpdate([item("grant_request", false, KRIT), item("share", true)])).toBe(false);
    expect(hasUnreadUpdate([item("share", false)])).toBe(true);
  });

  test("the digest puts decisions first, folds one person's shares into one phrase and leaves out read updates", () => {
    const parts = digestOf([item("share", false), item("share", false), item("grant_request", true, KRIT), item("grant_approved", true)]);
    expect(parts.map((part) => part.text)).toEqual(["คุณกฤตรอคุณอนุมัติสิทธิ์", "คุณธนาส่งการ์ดมา 2 ใบ"]);
    expect(parts.map((part) => part.bucket)).toEqual(["decide", "update"]);
  });

  test("the capped digest keeps the first three phrases, decisions included, and counts the rest", () => {
    const people = ["ก", "ข", "ค", "ง"].map((name) => ({ name: `คุณ${name}`, photo: null }));
    const parts = digestOf([...people.map((person) => item("share", false, person)), item("handoff", false, KRIT)]);
    const { shown, more } = cappedDigest(parts, 3);
    expect(shown.map((part) => part.bucket)).toEqual(["decide", "update", "update"]);
    expect(more).toBe(2);
    expect(cappedDigest(parts.slice(0, 2), 3).more).toBe(0);
  });

  test("an inbox with nothing open says nothing", () => {
    expect(digestOf([item("share", true), item("email", true)])).toEqual([]);
  });
});
