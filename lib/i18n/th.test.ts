import { describe, expect, test } from "bun:test";
import { TH } from "./th";

const REPOSITORY_PATH = /\bdocs\/|\.md\b/;

function stringsOf(value: unknown, path: string): { path: string; text: string }[] {
  if (typeof value === "string") return [{ path, text: value }];
  if (typeof value !== "object" || value === null) return [];
  return Object.entries(value).flatMap(([key, inner]) => stringsOf(inner, `${path}.${key}`));
}

describe("UI strings", () => {
  test("never show a repository path such as docs/pilot.md to the people who use Winyu (AI-288)", () => {
    const leaks = stringsOf(TH, "TH").filter((entry) => REPOSITORY_PATH.test(entry.text));
    expect(leaks).toEqual([]);
  });
});
