import { describe, expect, test } from "bun:test";
import { dueJobs } from "./scheduler";

const AT_0630_BKK = Date.parse("2026-10-01T23:30:00.000Z");
const AT_0715_BKK = Date.parse("2026-10-02T00:15:00.000Z");

describe("what the scheduler runs", () => {
  test("a fresh server runs the engine and the watches, and waits for 07:00 to send the digest", () => {
    expect(dueJobs(AT_0630_BKK, {})).toEqual(["engine", "watches"]);
  });

  test("after 07:00 the digest goes once that local day", () => {
    const ran = { lastRunAt: new Date(AT_0715_BKK).toISOString(), lastRunDay: "2026-10-02" };
    expect(dueJobs(AT_0715_BKK, { engine: ran, watches: ran })).toEqual(["digest"]);
    expect(dueJobs(AT_0715_BKK, { engine: ran, watches: ran, digest: ran })).toEqual([]);
  });

  test("watches run again after an hour", () => {
    const ran = { lastRunAt: new Date(AT_0715_BKK - 61 * 60_000).toISOString(), lastRunDay: "2026-10-02" };
    expect(dueJobs(AT_0715_BKK, { engine: ran, watches: ran, digest: ran })).toEqual(["watches"]);
  });
});
