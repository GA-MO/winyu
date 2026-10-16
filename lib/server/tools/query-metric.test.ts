import { describe, expect, test } from "bun:test";
import { accessFor } from "@/lib/access/policies";
import { METRIC_IDS, type MetricId, type MetricResult } from "@/lib/contracts";
import { DATA_AS_OF, monthEnd, monthStart } from "@/lib/data/dates";
import { findUser } from "@/lib/data/entities/users";
import { runWithAccess, runWithTurn } from "@/lib/server/request-context";
import { ownAgentsFilter } from "@/lib/data/entities/agents";
import { TH } from "@/lib/i18n/th";
import { METRICS, TARGET_METRICS } from "@/lib/semantic/metrics";
import { winyuTools } from "@/lib/server/agent/tools";
import { presentCard } from "@/lib/cards/present";

function dimsNamedFor(description: string, metric: MetricId): string[] | null {
  const table = description.match(/\(any other is refused\): ([^.]+)\./)?.[1] ?? "";
  const group = table.split("; ").map((part) => part.split(": ")).find(([metrics]) => metrics.split(", ").includes(metric));
  return group ? group[1].split(", ") : null;
}

describe("query_metric for a running month against target", () => {
  test("carries attainment against the whole month's target and what is left to reach it, in the result and the summary", async () => {
    const user = findUser("u_krit");
    if (!user) throw new Error("no sales rep");
    const query = { metric: "net_sales_volume", dims: [], filters: {}, range: { from: monthStart(DATA_AS_OF), to: DATA_AS_OF }, grain: "month", compare: "target", limit: null };
    const tool = winyuTools().query_metric;
    const result = (await runWithAccess(accessFor(user), () => tool.execute(tool.inputSchema().parse(query)))) as Extract<MetricResult, { ok: true }>;
    const projection = result.headline.projection;
    expect(projection?.attainmentToDate).toMatch(/^\d+\.\d%$/);
    expect(projection?.remaining).toMatch(/^(เหลืออีก .+ ถึงเป้าทั้งเดือน|ถึงเป้าทั้งเดือนแล้ว)$/);
    expect(result.summary).toContain(projection?.remaining ?? "-");
    expect(result.summary).toContain(projection?.attainmentToDate ?? "-");
  });

  async function askMonthToDate(userId: string, dims: string[]) {
    const user = findUser(userId);
    if (!user) throw new Error(`no ${userId}`);
    const query = { metric: "net_sales_volume", dims, filters: {}, range: { from: monthStart(DATA_AS_OF), to: DATA_AS_OF }, grain: "month", compare: "target", limit: null };
    const tool = winyuTools().query_metric;
    return (await runWithAccess(accessFor(user), () => tool.execute(tool.inputSchema().parse(query)))) as Extract<MetricResult, { ok: true }>;
  }

  test("split by month it keeps the whole month's base: the share done so far, what is left, and the pro-rated figure named เทียบเป้าตามเวลา (AI-53)", async () => {
    const result = await askMonthToDate("u_krit", ["month"]);
    const projection = result.headline.projection;
    if (!projection) throw new Error("no month-end projection for a month-to-date question split by month");
    expect(result.headline.compareLabel).toBe(TH.dash.pacedTarget);
    expect(result.summary).toContain(`${TH.dash.pacedTarget} `);
    expect(result.summary).toContain(TH.dash.monthSoFar(projection));
    const forecast = result.summary.split(" · ").find((part) => part.includes(projection.attainment));
    expect(forecast).toContain(TH.read.ofMonthTarget);
    if (projection.shortBy) expect(forecast).not.toContain(projection.shortBy);
  });

  test("its card says the same as its summary: the hero is the share of the whole month's target, then what is left and where the month ends, every tile on that base (AI-53, AI-156)", async () => {
    const result = await askMonthToDate("u_krit", ["month"]);
    const projection = result.headline.projection;
    if (!projection) throw new Error("no projection");
    const card = presentCard({ title: "t", query: result.query, result });
    expect(card.hero?.value).toBe(projection.attainmentToDate);
    expect(card.hero?.unit).toBe(TH.read.ofMonthTarget);
    const tiles = new Map(card.tiles.map((tile) => [tile.label, tile.value]));
    expect(card.tiles.length).toBeLessThanOrEqual(2);
    if (projection.shortBy) expect(tiles.get(TH.read.toTarget)).toBe(projection.shortBy);
    expect(tiles.get(TH.read.monthEnd)).toBe(projection.attainment);
  });

  test("a breakdown in the running month leads with the share of the whole month's target and what is left, whatever it is split by; the rows are on the same base, read against where the month should be by now (AI-101, AI-141)", async () => {
    const elapsed = Number(DATA_AS_OF.slice(8)) / Number(monthEnd(DATA_AS_OF).slice(8));
    for (const [userId, dims] of [["u_krit", ["agent"]], ["u_thana", ["region"]]] as const) {
      const result = await askMonthToDate(userId, [...dims]);
      const projection = result.headline.projection;
      if (!projection) throw new Error("no projection");
      const card = presentCard({ title: "t", query: result.query, result });
      expect(card.hero?.value).toBe(projection.attainmentToDate);
      expect(card.hero?.unit).toBe(TH.read.ofMonthTarget);
      expect(card.hero?.detail).toBe([TH.read.paceMark(`${Math.round(elapsed * 1000) / 10}%`), projection.shortBy ? `${TH.read.toTarget} ${projection.shortBy}` : null].filter(Boolean).join(" · "));
      if (card.body.kind !== "strip") throw new Error("not a strip");
      expect(card.body.strip.overall?.text).toBe(projection.attainmentToDate);
      expect(card.body.strip.overall?.measure).toBe(Number(projection.attainmentToDate.replace("%", "")));
      expect(card.body.strip.baseline).toBeCloseTo(elapsed * 100, 5);
      if (card.body.strip.rows.some((row) => row.tone === "bad")) expect(card.verdict).toContain(TH.read.pacedGoal);
    }
  });

  test("what is left agrees with the printed month target less the printed actual within their rounding, for every scope and unit (AI-102)", async () => {
    const printed = (label: string) => {
      const [, digits, million] = label.match(/([\d,.]+)\s*(ล้าน)?/) ?? [];
      return Number((digits ?? "").replace(/,/g, "")) * (million ? 1_000_000 : 1);
    };
    for (const userId of ["u_thana", "u_anucha", "u_krit"]) {
      const user = findUser(userId);
      if (!user) throw new Error(`no ${userId}`);
      for (const metric of ["net_sales_volume", "net_sales_value"]) {
        const query = { metric, dims: [], filters: {}, range: { from: monthStart(DATA_AS_OF), to: DATA_AS_OF }, grain: "month", compare: "target", limit: null };
        const tool = winyuTools().query_metric;
        const result = (await runWithAccess(accessFor(user), () => tool.execute(tool.inputSchema().parse(query)))) as Extract<MetricResult, { ok: true }>;
        const projection = result.headline.projection;
        if (!projection || !projection.remaining.startsWith("เหลืออีก")) continue;
        const roundingOfTwoLabels = 100_000;
        expect(Math.abs(printed(projection.monthTarget) - printed(result.headline.value) - printed(projection.remaining))).toBeLessThanOrEqual(roundingOfTwoLabels);
      }
    }
  });
});

describe("a breakdown by the parts that make up the company", () => {
  test("is never cut by a limit: overdue money by region with limit 5 still holds all six regions, ภาคเหนือ included (AI-76)", async () => {
    const user = findUser("u_thana");
    if (!user) throw new Error("no CEO");
    const query = { metric: "ar_overdue", dims: ["region"], filters: {}, range: { from: monthStart(DATA_AS_OF), to: DATA_AS_OF }, grain: "month", compare: "prev_period", sort: "value_desc", limit: 5 };
    const tool = winyuTools().query_metric;
    const result = (await runWithAccess(accessFor(user), () => tool.execute(tool.inputSchema().parse(query)))) as Extract<MetricResult, { ok: true }>;
    expect(result.rows).toHaveLength(6);
    expect(result.rows.map((row) => row.region)).toContain("ภาคเหนือ");
    expect(result.query.limit).toBeNull();
  });
});

describe("a rep asking about their own book", () => {
  const MONTH = { metric: "net_sales_volume", dims: [], filters: {}, range: { from: monthStart(DATA_AS_OF), to: DATA_AS_OF }, grain: "month", compare: "target", limit: null };

  async function ask(userId: string, question: string, query: Record<string, unknown> = MONTH) {
    const user = findUser(userId);
    if (!user) throw new Error(`no ${userId}`);
    const tool = winyuTools().query_metric;
    const turn = { turnId: null, threadId: null, question, queries: [] };
    return (await runWithAccess(accessFor(user), () => runWithTurn(turn, () => tool.execute(tool.inputSchema().parse(query))))) as Extract<MetricResult, { ok: true }>;
  }

  test("'ผมขายได้กี่เปอร์เซ็นต์' reads the agents assigned to the rep, says so, and keeps the target comparison", async () => {
    const own = ownAgentsFilter("u_krit").agent ?? [];
    expect(own.length).toBeGreaterThan(0);
    const result = await ask("u_krit", "ผมขายได้กี่เปอร์เซ็นต์");
    expect(result.query.filters.agent).toEqual(own);
    expect(result.summary).toContain(TH.quick.ownAgentsApplied(own.length));
    expect(result.headline.projection?.monthTarget).toBeDefined();
  });

  test("a question naming a wider place, another role, or a named agent is left as asked", async () => {
    expect((await ask("u_krit", "ยอดทั้งภาคเดือนนี้ผมอยากรู้")).query.filters.agent).toBeUndefined();
    expect((await ask("u_anucha", "ผมขายได้กี่เปอร์เซ็นต์")).query.filters.agent).toBeUndefined();
    expect((await ask("u_krit", "ยอดขายเดือนนี้เท่าไร")).query.filters.agent).toBeUndefined();
    const named = await ask("u_krit", "ของผมที่อีสานรุ่งโรจน์", { ...MONTH, filters: { agent: ["อีสานรุ่งโรจน์"] } });
    expect(named.query.filters.agent?.length).toBe(1);
  });

  test("a province the model took from the rep's title, not from his question, gives way to the agents he owns (AI-134)", async () => {
    const own = ownAgentsFilter("u_krit").agent ?? [];
    const total = await ask("u_krit", "เดือนนี้ผมขายได้กี่เปอร์เซ็นต์ของเป้าทั้งเดือนแล้ว ต้องขายอีกกี่ลิตรถึงจะครบเป้า", { ...MONTH, filters: { province: ["ขอนแก่น"] } });
    expect(total.query.filters.agent).toEqual(own);
    expect(total.query.filters.province).toBeUndefined();
    const agents = await ask("u_krit", "ยอดขายเข้าเอเย่นต์ของผมเดือนนี้เทียบเป้าเป็นอย่างไร", { ...MONTH, dims: ["agent"], filters: { province: ["ขอนแก่น"] } });
    expect(agents.rows).toHaveLength(own.length);
  });

  test("a whole-company ask from someone who sees one region is refused with the request button, not drawn as his region's number (AI-147)", async () => {
    const COMPANY = { metric: "net_sales_value", dims: [], filters: {}, grain: "month", compare: "none", limit: 1, period: "this_month" };
    const refused = (await ask("u_krit", "งั้นขอแค่ยอดรวมทั้งบริษัททุกภาคก็พอ ตัวเดียว", COMPANY)) as unknown as Extract<MetricResult, { ok: false }> & { nextActions?: { kind: string }[] };
    expect(refused.ok).toBe(false);
    expect(refused.code).toBe("PERMISSION_DENIED");
    expect(refused.error).toContain("ภาคอีสาน");
    expect(refused.nextActions?.some((action) => action.kind === "request_access")).toBe(true);
    expect((await ask("u_anucha", "ยอดขายทั้งประเทศเดือนนี้", COMPANY)).ok as boolean).toBe(false);
    expect((await ask("u_thana", "งั้นขอแค่ยอดรวมทั้งบริษัททุกภาคก็พอ ตัวเดียว", COMPANY)).ok).toBe(true);
    const own = await ask("u_krit", "ยอดขายเดือนนี้เท่าไร", COMPANY);
    expect(own.ok).toBe(true);
    expect(own.query.scopeApplied.region).toEqual(["northeast"]);
  });

  test("a province the rep names himself stays as asked", async () => {
    const named = await ask("u_krit", "ยอดขายขอนแก่นของผมเดือนนี้", { ...MONTH, filters: { province: ["ขอนแก่น"] } });
    expect(named.query.filters.agent).toBeUndefined();
    expect(named.query.filters.province?.length).toBe(1);
  });
});

describe("a breakdown whose question names one of its rows", () => {
  async function askAs(userId: string, question: string, query: Record<string, unknown>) {
    const user = findUser(userId);
    if (!user) throw new Error(`no ${userId}`);
    const tool = winyuTools().query_metric;
    const turn = { turnId: null, threadId: null, question, queries: [] };
    return (await runWithAccess(accessFor(user), () => runWithTurn(turn, () => tool.execute(tool.inputSchema().parse(query))))) as Extract<MetricResult, { ok: true }>;
  }

  test("leads with the named group on top with its value and change and says the verdict about it, not the company average (AI-107, AI-156)", async () => {
    const beer = await askAs("u_thana", "ฝ่ายการเงินบอกว่ามาร์จินกลุ่มเบียร์เดือนนี้ขึ้นไป 30% แล้ว ใช่ไหม", { metric: "gross_margin", dims: ["business_unit"], filters: {}, period: "this_month", grain: "month", compare: "none", sort: "value_desc", limit: 10 });
    const beerCard = presentCard({ title: "t", query: beer.query, result: beer, sortBy: "value_desc" });
    if (beerCard.body.kind !== "strip") throw new Error("not a strip");
    const beerRow = beerCard.body.strip.overall;
    expect(beerRow?.label).toBe("กลุ่มเบียร์");
    expect(beerCard.hero?.label).toBe("กลุ่มเบียร์");
    expect(beerRow?.valued).toBe(true);
    expect(beerRow?.text).toBe(String(beer.rows.find((row) => row.business_unit === "กลุ่มเบียร์")?.value_label));
    expect(beerCard.verdict).toStartWith("กลุ่มเบียร์");

    const imports = await askAs("u_thana", "กำไรขั้นต้นกลุ่มนำเข้าเดือนนี้โตขึ้น 5% ตามที่ CFO รายงานใช่ไหม", { metric: "gross_margin", dims: ["month", "business_unit"], filters: {}, period: "this_month", grain: "month", compare: "prev_period", limit: 10 });
    const importCard = presentCard({ title: "t", query: imports.query, result: imports });
    if (importCard.body.kind !== "strip") throw new Error("not a strip");
    const importRow = importCard.body.strip.overall;
    expect(importRow?.label).toBe("กลุ่มนำเข้า");
    expect(importRow?.valued).toBe(true);
    expect(importRow?.sub).toContain("จุด");
    expect(importCard.verdict).toStartWith("กลุ่มนำเข้า");
  });
});

describe("query_metric tells the model what each metric accepts", () => {
  const description = winyuTools().query_metric.description();

  test("every metric's dims are named, exactly the ones the engine accepts", () => {
    for (const metric of METRIC_IDS) expect(dimsNamedFor(description, metric)).toEqual([...METRICS[metric].dims]);
    expect(dimsNamedFor(description, "days_of_cover")).not.toContain("agent");
  });

  test("compare target is offered only for metrics that have a target", () => {
    const targets = description.match(/compare "target" only for ([a-z_, ]+)\./)?.[1].split(", ");
    expect(targets?.sort()).toEqual([...TARGET_METRICS].sort());
    expect(targets).not.toContain("gross_margin");
  });
});
