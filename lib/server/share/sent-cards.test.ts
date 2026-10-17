import { afterAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { findUser } from "@/lib/data/entities/users";
import { cardRefOf, type SharedCard } from "@/lib/share/card";
import { createShare } from "./deliver";
import { sentCardsOf, shares } from "./shares";

setDefaultTimeout(60_000);

const OWN_BOOK_QUESTION = "เดือนนี้ผมขายได้กี่เปอร์เซ็นต์ของเป้าทั้งเดือนแล้ว";
const SCREEN_CARD: SharedCard = { kind: "tool", reads: [{ tool: "query_metric", input: { metric: "net_sales_volume", dims: ["agent"], filters: {}, range: { from: "2026-11-01", to: "2026-11-26" }, grain: "month", compare: "target", limit: null } }] };
const made: string[] = [];

function user(id: string) {
  const found = findUser(id);
  if (!found) throw new Error(`no ${id}`);
  return found;
}

afterAll(() => {
  for (const code of made) shares().remove(code);
});

describe("the cards a person sent, as their screens name them (AI-209)", () => {
  test("a rep's own-book card is listed under the ref his screen drew, though it is stored narrowed to his agents, with its link and recipients", async () => {
    const outcome = await createShare(user("u_krit"), { card: SCREEN_CARD, question: OWN_BOOK_QUESTION, ask: "ช่วยดูยอดผมหน่อย", intent: "act", recipients: [{ userId: "u_anucha", channel: "winyu" }] });
    if (!outcome.ok) throw new Error(outcome.error);
    made.push(outcome.share.id);
    expect(cardRefOf(outcome.share.card)).not.toBe(cardRefOf(SCREEN_CARD));
    const sent = sentCardsOf("u_krit").find((entry) => entry.ref === cardRefOf(SCREEN_CARD));
    expect(sent?.path).toBe(`/s/${outcome.share.id}`);
    expect(sent?.receipts.map((receipt) => receipt.userId)).toEqual(["u_anucha"]);
    expect(sentCardsOf("u_anucha").some((entry) => entry.ref === cardRefOf(SCREEN_CARD))).toBe(false);
  });

  test("a sent card carries when it went out, so a later chat that draws the same card can say it was sent earlier (AI-260)", async () => {
    const at = "2026-10-17T01:04:03.916Z";
    const outcome = await createShare(user("u_thana"), { card: SCREEN_CARD, question: null, ask: "ช่วยดูหน่อย", intent: "act", recipients: [{ userId: "u_anucha", channel: "winyu" }] }, at);
    if (!outcome.ok) throw new Error(outcome.error);
    made.push(outcome.share.id);
    expect(sentCardsOf("u_thana").find((entry) => entry.path === `/s/${outcome.share.id}`)?.at).toBe(at);
  });
});
