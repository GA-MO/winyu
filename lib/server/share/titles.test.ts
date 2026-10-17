import { afterAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { findUser } from "@/lib/data/entities/users";
import { TH } from "@/lib/i18n/th";
import type { SharedCard } from "@/lib/share/card";
import { createShare } from "./deliver";
import { shares } from "./shares";
import { actOnMatter } from "./act";
import { notifications } from "@/lib/server/agent/collections";

setDefaultTimeout(60_000);

const ISAN_CARD: SharedCard = { kind: "tool", reads: [{ tool: "query_metric", input: { metric: "net_sales_value", dims: ["agent"], filters: { region: ["northeast"] }, range: { from: "2026-11-01", to: "2026-11-26" }, grain: "month", compare: "target", limit: null } }] };
const STORY_ASK = "ยอดขายเข้าภาคอีสานจะปิดเดือนต่ำกว่าเป้า ช่วยดูอีสานรุ่งโรจน์กับอุบลศรีสุข";
const CHAT_ASK = "ช่วยตรวจสอบเรื่องยอดขายต่ำกว่าเป้าและปัญหาเครดิต ด่วน";
const made: string[] = [];

function user(id: string) {
  const found = findUser(id);
  if (!found) throw new Error(`no ${id}`);
  return found;
}

async function send(senderId: string, toUserId: string, ask: string): Promise<string> {
  const outcome = await createShare(user(senderId), { card: ISAN_CARD, question: null, ask, intent: "act", recipients: [{ userId: toUserId, channel: "winyu" }] });
  if (!outcome.ok) throw new Error(outcome.error);
  made.push(outcome.share.id);
  return outcome.share.title;
}

afterAll(() => {
  for (const code of made) shares().remove(code);
});

describe("matter titles when one card is sent more than once (AI-244)", () => {
  test("a second send that asks something else, or comes from someone else, keeps the card's own title; only the same send again gets a repeat number", async () => {
    const first = await send("u_thana", "u_anucha", STORY_ASK);
    expect(first).not.toContain("ครั้งที่");
    expect(await send("u_thana", "u_anucha", CHAT_ASK)).toBe(first);
    expect(await send("u_anucha", "u_krit", STORY_ASK)).toBe(first);
    expect(await send("u_thana", "u_anucha", ` ${STORY_ASK} `)).toBe(TH.share.repeatTitle(first, 2));
    expect(await send("u_thana", "u_anucha", STORY_ASK)).toBe(TH.share.repeatTitle(first, 3));
  });

  test("an update about one of two matters sharing a title names what that matter asks, so the sender's bell reads them apart", async () => {
    const title = await send("u_thana", "u_anucha", CHAT_ASK);
    const code = made[made.length - 1];
    const outcome = actOnMatter(user("u_anucha"), code, { kind: "pass_on", toUserId: "u_krit" });
    expect(outcome.ok).toBe(true);
    const told = notifications().where((note) => note.userId === "u_thana" && note.refId === code && note.kind === "matter_update");
    expect(told.map((note) => note.title)).toEqual([TH.notify.matterUpdate.passed_on(user("u_anucha").nameTh, TH.share.titleAsking(title, `${Array.from(CHAT_ASK).slice(0, 40).join("")}…`), user("u_krit").nameTh)]);
  });
});
