import { describe, expect, test } from "bun:test";
import { channelCardOfSurface } from "./cards";
import { plainText } from "./line";
import { decisionOfPostback, flexOf } from "./line-flex";
import { adaptiveCardOf, TEAMS_APPROVE, TEAMS_REJECT } from "./teams-card";
import type { ChannelReply } from "./types";

type Answer = Extract<ChannelReply, { kind: "answer" }>;

const CARD = {
  title: "มูลค่าขายเข้า",
  meta: "1 ก.ย. – 22 ก.ย. 2569 · 6 ภาค",
  hero: { label: "รวมทุกภาค", value: "1,110.2 ล้านบาท", delta: "-1.4%", detail: "เทียบเป้า", tone: "bad" as const },
  rows: [
    { label: "ภาคอีสาน", value: "232.5 ล้านบาท", delta: "-10.0%", tone: "bad" as const },
    { label: "ภาคกลาง", value: "151.9 ล้านบาท", delta: "+1.6%", tone: "good" as const },
  ],
  more: 4,
  note: null,
  denied: null,
};
const ANSWER: Answer = { kind: "answer", text: "**ภาคอีสาน** ต่ำกว่าเป้า", cards: [CARD], approval: null, webUrl: "https://mascop.example.com/c/teams-1" };
const ASKING: Answer = { kind: "answer", text: "", cards: [], approval: { id: "ap1", question: "ให้ mascop เฝ้าดูเรื่องนี้ใช่ไหมครับ", effect: "ตรวจทุกชั่วโมง" }, webUrl: "https://mascop.example.com/c/line-1" };

describe("Teams Adaptive Card", () => {
  test("draws the headline with its change in the tone's colour, each row's change coloured, and the rest left for the web", () => {
    const json = JSON.stringify(adaptiveCardOf(ANSWER));
    expect(json).toContain('{"type":"TextBlock","text":"-1.4%","wrap":true,"color":"Attention"');
    expect(json).toContain('"text":"+1.6%","wrap":true,"horizontalAlignment":"Right","size":"Small","color":"Good"');
    expect(json).toContain("และอีก 4 รายการ ดูต่อในเว็บ");
    expect(adaptiveCardOf(ANSWER).actions).toEqual([{ type: "Action.OpenUrl", title: "ดูต่อในเว็บ", url: ANSWER.webUrl }]);
  });

  test("an approval gets approve and reject buttons that carry only the held approval's id", () => {
    const submits = adaptiveCardOf(ASKING).actions.filter((action) => action.type === "Action.Submit");
    expect(submits.map((action) => action.data)).toEqual([{ actionId: TEAMS_APPROVE, value: "ap1" }, { actionId: TEAMS_REJECT, value: "ap1" }]);
  });
});

describe("LINE Flex", () => {
  test("approve and reject postbacks read back as the decision on the held approval, and nothing else does", () => {
    const flex = flexOf(ASKING);
    const footer = flex.type === "flex" && flex.contents.type === "bubble" ? (flex.contents.footer?.contents ?? []) : [];
    const decisions = footer.flatMap((node) => (node.type === "button" && node.action.type === "postback" ? [decisionOfPostback(node.action.data ?? "")] : []));
    expect(decisions).toEqual([{ approvalId: "ap1", approved: true }, { approvalId: "ap1", approved: false }]);
    expect(decisionOfPostback("approval=ap1&approve=maybe")).toBeNull();
    expect(decisionOfPostback("action=other")).toBeNull();
  });

  test("a bubble never opens with a separator and carries the headline as its notification text", () => {
    const asking = flexOf(ASKING);
    const first = asking.type === "flex" && asking.contents.type === "bubble" ? asking.contents.body?.contents[0] : null;
    expect(first?.type).toBe("text");
    const answer = flexOf({ ...ANSWER, text: "" });
    expect(answer.type === "flex" ? answer.altText : null).toBe("mascop: มูลค่าขายเข้า 1,110.2 ล้านบาท");
  });

  test("markdown marks are dropped for LINE, which shows them literally", () => {
    expect(plainText("## สรุป\n**ภาคอีสาน** ต่ำกว่าเป้า\n- เอเย่นต์ชะลอ")).toBe("สรุป\nภาคอีสาน ต่ำกว่าเป้า\n• เอเย่นต์ชะลอ");
  });
});

describe("composed card for a chat app", () => {
  test("resolves the card's bindings and template rows against the data it was sent with", () => {
    const surface = {
      surfaceId: "m:card:1",
      done: true,
      dataModel: { find_people: { rows: [{ name: "คุณกฤต", role: "ผู้จัดการเขต" }, { name: "คุณนก", role: "พนักงานขาย" }] } },
      components: [
        { id: "root", component: "Card" as const, title: "ทีมขายภาคอีสาน", children: { componentId: "person", path: "/find_people/rows" } },
        { id: "person", component: "ListItem" as const, title: { path: "name" }, subtitle: { path: "role" } },
      ],
    };
    const card = channelCardOfSurface(surface);
    expect(card?.title).toBe("ทีมขายภาคอีสาน");
    expect(card?.rows.map((row) => [row.label, row.value])).toEqual([["คุณกฤต", "ผู้จัดการเขต"], ["คุณนก", "พนักงานขาย"]]);
  });
});
