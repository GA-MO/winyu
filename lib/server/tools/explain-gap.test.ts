import { describe, expect, test } from "bun:test";
import { accessFor } from "@/lib/access/policies";
import { findUser } from "@/lib/data/entities/users";
import { DATA_AS_OF, dataDay, monthStart } from "@/lib/data/dates";
import { runWithAccess } from "@/lib/server/request-context";
import { winyuTools } from "@/lib/server/agent/tools";
import { presentGap, type GapAnswer } from "@/lib/cards/present";
import { TH } from "@/lib/i18n/th";

type GapResult = {
  ok: true;
  compare_label: string;
  attainment_label: string | null;
  share_note: string | null;
  contributors: { label: string; share_label: string }[];
  other_splits?: { split_label: string; moved_harder: { label: string; share_label: string; change_label: string }[]; note: string }[] | null;
  projection: { done_so_far_label: string; left_from_today_label: string; month_end_short_label: string | null } | null;
};

async function gapAs(userId: string, input: Record<string, unknown>): Promise<GapResult> {
  const user = findUser(userId);
  if (!user) throw new Error(`no ${userId}`);
  const tool = winyuTools().explain_gap;
  return (await runWithAccess(accessFor(user), () => tool.execute(tool.inputSchema().parse(input)))) as GapResult;
}

describe("explain_gap says when no part stands out", () => {
  test("a company-wide weekly drop split by agent, where the biggest agent is a few percent of the gap, carries the broad note (AI-145)", async () => {
    const result = await gapAs("u_thana", { metric: "net_sales_value", split: "agent", filters: {}, range: { from: dataDay(-3), to: DATA_AS_OF }, compare: "prev_period" });
    expect(result.ok).toBe(true);
    expect(result.share_note).toContain("ไม่มีส่วนไหนเด่น");
    expect(result.share_note).toContain(result.contributors[0]?.share_label ?? "-");
  });

  test("Isan's month against target, where two agents make most of the gap, carries no broad note", async () => {
    const result = await gapAs("u_thana", { metric: "net_sales_value", split: "agent", filters: { region: ["northeast"] }, range: { from: monthStart(DATA_AS_OF), to: DATA_AS_OF }, compare: "target" });
    expect(result.share_note ?? "").not.toContain("ไม่มีส่วนไหนเด่น");
  });
});

const WEEK_BY_REGION = { metric: "net_sales_value", split: "region", filters: {}, range: { from: dataDay(-3), to: DATA_AS_OF }, compare: "prev_period" };

describe("a drop the first split leaves without a main cause is checked along other splits before anything is named (AI-214)", () => {
  test("the CEO's weekly drop by region, two regions about equal and together under half of it, names no main region and says so", async () => {
    const result = await gapAs("u_thana", WEEK_BY_REGION);
    const [first, second] = result.contributors;
    expect(Math.abs(Number.parseFloat(first?.share_label ?? "0") - Number.parseFloat(second?.share_label ?? "0"))).toBeLessThan(1);
    expect(result.share_note).toContain(TH.cards.gap.noMain);
    const card = presentGap({ answer: result as unknown as GapAnswer, metric: "net_sales_value", split: "region" });
    expect(card.verdict).toContain(TH.cards.gap.spread);
    expect(card.verdict).not.toContain("มากสุด");
  });

  test("the same drop is checked along channel and brand, where every part fell alike, so the reply can say which splits were checked and found even", async () => {
    const result = await gapAs("u_thana", WEEK_BY_REGION);
    expect(result.other_splits?.map((split) => split.split_label)).toEqual([TH.dash.dimUnit.channel, TH.dash.dimUnit.brand]);
    for (const split of result.other_splits ?? []) {
      expect(split.moved_harder).toEqual([]);
      expect(split.note).toMatch(new RegExp(`^ทุก${split.split_label}เปลี่ยนใกล้เคียงกัน \\(−\\d+\\.\\d% ถึง −\\d+\\.\\d%\\)`));
    }
  });

  test("the period it is compared with is named, with its dates: the same days a week back are 'สัปดาห์ก่อน', so the card never reads 'ต่ำกว่าช่วงก่อนหน้า' (AI-214, AI-223)", async () => {
    const result = await gapAs("u_thana", WEEK_BY_REGION);
    expect(result.compare_label).toMatch(/^สัปดาห์ก่อน \(\d+ พ\.ย\. 2569 – \d+ พ\.ย\. 2569\) [\d,.]+ ล้านบาท$/);
    const card = presentGap({ answer: result as unknown as GapAnswer, metric: "net_sales_value", split: "region" });
    expect(card.verdict).toContain("ต่ำกว่าสัปดาห์ก่อน");
    const lastMonth = await gapAs("u_thana", { metric: "net_sales_value", split: "region", filters: {}, range: { from: "2026-10-01", to: "2026-10-31" }, compare: "prev_period" });
    expect(lastMonth.compare_label.startsWith("เดือนก่อน (")).toBe(true);
    const lastYear = await gapAs("u_thana", { ...WEEK_BY_REGION, compare: "prev_year" });
    expect(lastYear.compare_label.startsWith("ปีก่อน (")).toBe(true);
  });

  test("the week's own change is on the gap card, since the gap card is the one card of a why answer and the week total it repeats draws none (AI-253)", async () => {
    const result = (await gapAs("u_thana", WEEK_BY_REGION)) as GapResult & { change_label?: string | null };
    expect(result.change_label).toMatch(/^−\d+\.\d%$/);
    const card = presentGap({ answer: result as unknown as GapAnswer, metric: "net_sales_value", split: "region" });
    expect(card.hero?.delta).toBe(result.change_label ?? "-");
    const target = (await gapAs("u_thana", { ...WEEK_BY_REGION, compare: "target" })) as GapResult & { change_label?: string | null };
    expect(target.change_label ?? null).toBeNull();
  });

  test("a gap with a clear main cause, or two agents that made it together, is not split again", async () => {
    const isan = await gapAs("u_thana", { metric: "net_sales_value", split: "agent", filters: { region: ["northeast"] }, range: { from: monthStart(DATA_AS_OF), to: DATA_AS_OF }, compare: "target" });
    expect(isan.other_splits).toBeNull();
    expect(isan.share_note ?? "").toContain(isan.contributors[1]?.label ?? "-");
  });
});

describe("a month still running reaches the model on the month's own base (AI-204, AI-207)", () => {
  test("the gap is named against the target to date, its paced share is gone, and the month end carries its own shortfall apart from what is left from today", async () => {
    const result = await gapAs("u_anucha", { metric: "net_sales_value", split: "agent", filters: { region: ["northeast"] }, range: { from: monthStart(DATA_AS_OF), to: DATA_AS_OF }, compare: "target" });
    expect(result.attainment_label).toBeNull();
    expect(result.compare_label.startsWith(`${TH.read.pacedGoal} `)).toBe(true);
    const projection = result.projection;
    if (!projection) throw new Error("no projection for Isan's month so far");
    expect(projection.done_so_far_label.endsWith(TH.read.ofMonthTarget)).toBe(true);
    expect(projection.left_from_today_label).toContain("ถึงวันนี้ยังขาด");
    expect(projection.month_end_short_label).toMatch(/ล้านบาท$/);
    expect(projection.month_end_short_label).not.toBe(projection.left_from_today_label);
    expect(JSON.stringify(result)).not.toContain("remaining_label");
  });
});

const ISAN_MONTH_BY_AGENT = { metric: "net_sales_value", split: "agent", filters: { region: ["northeast"] }, range: { from: monthStart(DATA_AS_OF), to: DATA_AS_OF }, compare: "target" };

describe("a share of the gap names the gap it divides (AI-248)", () => {
  test("Isan's month splits the gap to date, and each share the reply copies says so, so 45.4% never sits beside the 52.9 month-end shortfall as its share", async () => {
    const result = await gapAs("u_anucha", ISAN_MONTH_BY_AGENT);
    expect(result.contributors.slice(0, 2).map((part) => `${part.label} ${part.share_label}`)).toEqual(["อีสานรุ่งโรจน์ ค้าส่ง 45.4% ของช่องว่างถึงวันนี้", "อุบลศรีสุข เทรดดิ้ง 42.0% ของช่องว่างถึงวันนี้"]);
    expect(result.share_note ?? "").toStartWith("อีสานรุ่งโรจน์ ค้าส่ง (45.4% ของช่องว่างถึงวันนี้) และ อุบลศรีสุข เทรดดิ้ง (42.0% ของช่องว่างถึงวันนี้)");
  });

  test("the card drawn from it still reads each part as its share of the gap row above it", async () => {
    const result = await gapAs("u_anucha", ISAN_MONTH_BY_AGENT);
    const card = presentGap({ answer: result as unknown as GapAnswer, metric: "net_sales_value", split: "agent" });
    if (card.body.kind !== "strip" && card.body.kind !== "exceptions") throw new Error(`no strip: ${card.body.kind}`);
    const parts = card.body.strip.rows.filter((row) => result.contributors.some((part) => part.label === row.label));
    expect(parts.slice(0, 2).map((row) => [row.label, row.sub, row.measure])).toEqual([
      ["อีสานรุ่งโรจน์ ค้าส่ง", "45.4% ของช่องว่าง", 45.4],
      ["อุบลศรีสุข เทรดดิ้ง", "42.0% ของช่องว่าง", 42],
    ]);
  });
});

describe("a filtered gap names its scope (AI-296)", () => {
  test("the rep's gap for one store by brand names the store, so a screenshot never reads as his whole territory", async () => {
    const result = (await gapAs("u_krit", { metric: "net_sales_value", split: "brand", filters: { agent: ["อีสานรุ่งโรจน์ ค้าส่ง"] }, range: { from: monthStart(DATA_AS_OF), to: DATA_AS_OF }, compare: "target" })) as GapResult & { scope_labels?: string[] };
    expect(result.scope_labels).toContain("อีสานรุ่งโรจน์ ค้าส่ง");
    const card = presentGap({ answer: result as unknown as GapAnswer, metric: "net_sales_value", split: "brand" });
    expect(card.footer?.line).toContain("อีสานรุ่งโรจน์ ค้าส่ง");
  });

  test("a company-wide gap names no scope", async () => {
    const result = (await gapAs("u_thana", WEEK_BY_REGION)) as GapResult & { scope_labels?: string[] };
    expect(result.scope_labels).toEqual([]);
  });
});
