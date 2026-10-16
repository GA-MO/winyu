import { afterAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { ownAgentsFilter } from "@/lib/data/entities/agents";
import { findUser } from "@/lib/data/entities/users";
import { createShare } from "./deliver";
import { shares } from "./shares";

setDefaultTimeout(60_000);

const OWN_BOOK_QUESTION = "เดือนนี้ผมขายได้กี่เปอร์เซ็นต์ของเป้าทั้งเดือนแล้ว";
const REGION_WIDE_READ = { metric: "net_sales_volume", dims: ["agent"], filters: {}, range: { from: "2026-11-01", to: "2026-11-26" }, grain: "month", compare: "target", limit: null };
const made: string[] = [];

function user(id: string) {
  const found = findUser(id);
  if (!found) throw new Error(`no ${id}`);
  return found;
}

function storedFilters(code: string): Record<string, unknown> {
  const read = shares().get(code)?.card.reads[0];
  if (!read) throw new Error("matter missing");
  return (read.input.filters ?? {}) as Record<string, unknown>;
}

afterAll(() => {
  for (const code of made) shares().remove(code);
});

describe("a rep's own-book card keeps his agents when it is sent", () => {
  test("the matter stores the agents he owns, so the receiver opens the card the rep saw, not the whole region", async () => {
    const outcome = await createShare(user("u_krit"), { card: { kind: "tool", reads: [{ tool: "query_metric", input: REGION_WIDE_READ }] }, question: OWN_BOOK_QUESTION, ask: "ช่วยดูยอดผมหน่อย", intent: "act", recipients: [{ userId: "u_anucha", channel: "winyu" }] });
    if (!outcome.ok) throw new Error(outcome.error);
    made.push(outcome.share.id);
    expect(storedFilters(outcome.share.id).agent).toEqual(ownAgentsFilter("u_krit").agent);
  });

  test("a card someone other than a rep sends is stored as it was read", async () => {
    const outcome = await createShare(user("u_anucha"), { card: { kind: "tool", reads: [{ tool: "query_metric", input: REGION_WIDE_READ }] }, question: "ยอดผมเดือนนี้ถึงไหนแล้ว", ask: "ช่วยดูหน่อย", intent: "act", recipients: [{ userId: "u_krit", channel: "winyu" }] });
    if (!outcome.ok) throw new Error(outcome.error);
    made.push(outcome.share.id);
    expect(storedFilters(outcome.share.id)).toEqual({});
  });
});
