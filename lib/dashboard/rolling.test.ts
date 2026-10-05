import { describe, expect, test } from "bun:test";
import { rolledRange } from "./rolling";

const PINNED_ON = "2026-09-25";
const LATER = "2026-11-10";

describe("a pinned card keeps meaning what it meant", () => {
  test("month-to-date stays month-to-date, even when it was asked past the data", () => {
    expect(rolledRange({ from: "2026-09-01", to: "2026-09-25" }, PINNED_ON, LATER)).toEqual({ from: "2026-11-01", to: LATER });
    expect(rolledRange({ from: "2026-09-01", to: "2026-09-25" }, PINNED_ON, "2026-09-22")).toEqual({ from: "2026-09-01", to: "2026-09-22" });
  });

  test("a trailing window keeps its length and a year-to-date stays year-to-date", () => {
    expect(rolledRange({ from: "2026-08-28", to: "2026-09-24" }, PINNED_ON, LATER)).toEqual({ from: "2026-10-14", to: LATER });
    expect(rolledRange({ from: "2026-09-25", to: "2026-09-25" }, PINNED_ON, LATER)).toEqual({ from: LATER, to: LATER });
    expect(rolledRange({ from: "2026-01-01", to: "2026-09-25" }, PINNED_ON, "2027-02-03")).toEqual({ from: "2027-01-01", to: "2027-02-03" });
  });

  test("the last whole month stays the last whole month; months that were history stay put", () => {
    expect(rolledRange({ from: "2026-08-01", to: "2026-08-31" }, PINNED_ON, LATER)).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(rolledRange({ from: "2026-03-01", to: "2026-08-31" }, PINNED_ON, LATER)).toEqual({ from: "2026-05-01", to: "2026-10-31" });
    expect(rolledRange({ from: "2025-06-01", to: "2025-08-31" }, PINNED_ON, LATER)).toEqual({ from: "2025-06-01", to: "2025-08-31" });
  });
});
