import { describe, expect, test } from "bun:test";
import type { MetricQuery } from "@/lib/contracts";
import { titleContradiction } from "./title-claims";

const QUERY: MetricQuery = { metric: "target_attainment", dims: ["province"], filters: {}, range: { from: "2026-09-01", to: "2026-09-22" }, grain: "month", compare: "none", limit: null };
const ROWS = [
  { province: "อุบลราชธานี", value: 81.7 },
  { province: "ขอนแก่น", value: 88.8 },
  { province: "บุรีรัมย์", value: 99.2 },
  { province: "นครราชสีมา", value: 101.9 },
];

function contradiction(title: string): string | null {
  return titleContradiction({ title, query: QUERY, rows: ROWS });
}

describe("title claims about the most", () => {
  test("furthest from target names the lowest row", () => {
    expect(contradiction("อุบลราชธานียังห่างจากเป้ามากที่สุด")).toBeNull();
    expect(contradiction("นครราชสีมาห่างจากเป้ามากที่สุด")).not.toBeNull();
  });

  test("trailing most or short most also names the lowest", () => {
    expect(contradiction("อุบลราชธานีตามหลังมากที่สุด")).toBeNull();
    expect(contradiction("อุบลราชธานีขาดเป้ามากที่สุด")).toBeNull();
  });

  test("highest still names the top row", () => {
    expect(contradiction("นครราชสีมาทำได้สูงสุด")).toBeNull();
    expect(contradiction("อุบลราชธานีทำได้สูงสุด")).not.toBeNull();
  });
});
