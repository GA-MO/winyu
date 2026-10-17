import { afterAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { findUser } from "@/lib/data/entities/users";
import { actOnMatter } from "./act";
import { createShare } from "./deliver";
import { suggestOwner } from "./owner";
import { shares } from "./shares";

setDefaultTimeout(60_000);

const ISAN_READ = { metric: "net_sales_value", dims: ["agent"], filters: { region: ["northeast"] }, range: { from: "2026-11-01", to: "2026-11-26" }, grain: "month", compare: "target", limit: null };
const ISAN_CARD = { kind: "tool" as const, reads: [{ tool: "query_metric", input: ISAN_READ }] };
const made: string[] = [];

function user(id: string) {
  const found = findUser(id);
  if (!found) throw new Error(`no ${id}`);
  return found;
}

async function sentDownTheChain(ask: string): Promise<void> {
  const outcome = await createShare(user("u_thana"), { card: ISAN_CARD, question: null, ask, intent: "act", recipients: [{ userId: "u_anucha", channel: "winyu" }] });
  if (!outcome.ok) throw new Error(outcome.error);
  made.push(outcome.share.id);
  actOnMatter(user("u_anucha"), outcome.share.id, { kind: "pass_on", toUserId: "u_krit" });
  actOnMatter(user("u_krit"), outcome.share.id, { kind: "accept" });
}

afterAll(() => {
  for (const code of made) shares().remove(code);
});

describe("whom the CEO usually sends Isan sales to", () => {
  test("a rep who accepted matters the RSM passed on to him is not the CEO's usual recipient; the RSM who owns the region stays the suggestion", async () => {
    await sentDownTheChain("ช่วยดูยอดอีสานหน่อย");
    await sentDownTheChain("ตามยอดเอเย่นต์อีสานให้ที");
    expect(suggestOwner("net_sales_value", "northeast", "u_thana")?.userId).toBe("u_anucha");
  });
});
