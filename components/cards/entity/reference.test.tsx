import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { accessFor } from "@/lib/access/policies";
import { DATA_AS_OF, monthStart } from "@/lib/data/dates";
import { findUser } from "@/lib/data/entities/users";
import { TH } from "@/lib/i18n/th";
import { winyuTools } from "@/lib/server/agent/tools";
import { runWithAccess } from "@/lib/server/request-context";
import { EntityCard, GapCard } from "./reference";
import { withoutInternalIds } from "@/components/chat/markdown";

type GapAnswer = { contributors: { share_label: string }[]; rest: { share_label: string } | null; share_note?: string | null };

const RANGES = [
  { from: monthStart(DATA_AS_OF), to: DATA_AS_OF },
  { from: monthStart(DATA_AS_OF, 1), to: DATA_AS_OF },
];

async function explainGapAs(userId: string, compare: "prev_year" | "target", range: { from: string; to: string }): Promise<GapAnswer> {
  const user = findUser(userId);
  if (!user) throw new Error(`no user ${userId}`);
  const input = { metric: "net_sales_volume", split: "agent", filters: {}, range, compare };
  return runWithAccess(accessFor(user), () => winyuTools().explain_gap.execute(input) as Promise<GapAnswer>);
}

function overWhole(answer: GapAnswer): boolean {
  return [...answer.contributors, ...(answer.rest ? [answer.rest] : [])].some((row) => Number.parseFloat(row.share_label) > 100);
}

function gapFixture(shareLabel: string, shareNote: string | null) {
  return {
    summary: "ช่องว่างเทียบปีก่อน",
    period_label: "พ.ย. 2569",
    actual_label: "3.9 ล้านลิตร",
    compare_label: "4.1 ล้านลิตร",
    gap_label: "-0.2 ล้านลิตร",
    attainment_label: null,
    contributors: [{ label: "อุบลศรีสุข เทรดดิ้ง", gap_label: "-0.3 ล้านลิตร", share_label: shareLabel }],
    rest: null,
    offsetting: [{ label: "ขอนแก่นมหาชัย", gap_label: "+0.1 ล้านลิตร" }],
    share_note: shareNote,
    projection: null,
  };
}

describe("explain_gap shares above 100%", () => {
  test("the tool adds the note exactly when a share passes 100%", async () => {
    const answers = await Promise.all(
      ["u_thana", "u_anucha"].flatMap((userId) => (["prev_year", "target"] as const).flatMap((compare) => RANGES.map((range) => explainGapAs(userId, compare, range)))),
    );
    for (const answer of answers) expect(Boolean(answer.share_note?.includes(TH.cards.gap.overHundred))).toBe(overWhole(answer));
  });

  test("the card shows the note only when the answer carries one", () => {
    expect(renderToStaticMarkup(<GapCard result={gapFixture("149.8%", TH.cards.gap.overHundred)} />)).toContain(TH.cards.gap.overHundred);
    expect(renderToStaticMarkup(<GapCard result={gapFixture("62.0%", null)} />)).not.toContain(TH.cards.gap.overHundred);
  });
});

describe("internal ids never reach the person (AI-78)", () => {
  test("an entity card shows its Thai fields, never ownerId or id", () => {
    const result = { ok: true, summary: "s", data: { id: "ag_nea_02", "ชื่อ": "อีสานรุ่งโรจน์ ค้าส่ง", "จังหวัด": "ขอนแก่น", "พนักงานขายที่ดูแล": "คุณกฤต จันทร์เสน", ownerId: "u_krit" } };
    const html = renderToStaticMarkup(<EntityCard result={result} />);
    expect(html).toContain("ขอนแก่น");
    expect(html).not.toContain("ownerId");
    expect(html).not.toContain("u_krit");
  });

  test("a reply drops an id the model put in parentheses and keeps the Thai name", () => {
    expect(withoutInternalIds("รายงานด้วยมูลค่าขายเข้าสุทธิ (net_sales_value) ระหว่าง 1–22 ก.ย.")).toBe("รายงานด้วยมูลค่าขายเข้าสุทธิ ระหว่าง 1–22 ก.ย.");
    expect(withoutInternalIds("ดูบันทึกเยี่ยมร้าน (`store_visits`) ได้ · คุณกฤต (u_krit)")).toBe("ดูบันทึกเยี่ยมร้าน ได้ · คุณกฤต");
    expect(withoutInternalIds("ยอด (sell-in) และ (SAP SD) คงไว้")).toBe("ยอด (sell-in) และ (SAP SD) คงไว้");
  });
});
