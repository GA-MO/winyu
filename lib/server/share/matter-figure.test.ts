import { afterAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import type { MetricResult, NextAction, User } from "@/lib/contracts";
import { AGENTS } from "@/lib/data/entities/agents";
import { findUser } from "@/lib/data/entities/users";
import { presentCard, type CardHero } from "@/lib/cards/present";
import { cardFocus } from "./focus";
import { cardHero } from "./goal";
import { createShare } from "./deliver";
import { shares } from "./shares";
import { openShare } from "./view";

setDefaultTimeout(60_000);

const RSM = "u_anucha";
const REP = "u_krit";
const TEAM_QUESTION = "ทีมผมเดือนนี้ถึงเป้าแค่ไหนแล้ว เอเย่นต์ไหนน่าห่วงสุด";
const REGION_TOTAL = { filters: { region: "northeast" }, grain: "month", compare: "target", period: "this_month", dims: ["region"], metric: "net_sales_value" };
const TEAM_AGENTS = { metric: "net_sales_value", limit: 5, dims: ["agent"], filters: { region: "northeast" }, period: "this_month", grain: "month", sort: "delta_asc", compare: "target" };
const TEAM_CARD = { kind: "tool" as const, reads: [{ tool: "query_metric", input: REGION_TOTAL }, { tool: "query_metric", input: TEAM_AGENTS }] };
const FOCUS_AGENT = "ขอนแก่นมหาชัย";
const made: string[] = [];

type Answer = Extract<MetricResult, { ok: true }>;

function user(id: string): User {
  const found = findUser(id);
  if (!found) throw new Error(`no ${id}`);
  return found;
}

function answerOf(result: unknown): Answer {
  const answer = result as Answer;
  if (!answer?.ok) throw new Error("the read did not answer");
  return answer;
}

async function teamMatter(focus?: string[]) {
  const outcome = await createShare(user(RSM), { card: TEAM_CARD, question: TEAM_QUESTION, ask: "ฝากคุณกฤตเข้าไปคุยกับเอเย่นต์", intent: "act", recipients: [{ userId: REP, channel: "winyu" }], focus });
  if (!outcome.ok) throw new Error(outcome.error);
  made.push(outcome.share.id);
  const matter = shares().get(outcome.share.id);
  if (!matter) throw new Error("matter not stored");
  return matter;
}

afterAll(() => {
  for (const code of made) shares().remove(code);
});

describe("a matter shows its receiver one figure on every surface (AI-203)", () => {
  test("a rep opening his RSM's team card sees the region the RSM sent, with the figure his inbox reads, never his own four agents", async () => {
    const matter = await teamMatter();
    const view = await openShare(matter, user(REP));
    const [total, agents] = view.reads.map((read) => answerOf(read.result));
    expect(agents.query.filters.agent ?? null).toBeNull();
    expect(agents.rows).toHaveLength(TEAM_AGENTS.limit);
    const inboxHero = await cardHero(matter.card, user(REP));
    expect(inboxHero ?? "").toStartWith(total.headline.projection?.attainmentToDate ?? "no projection");
  });
});

describe("a send about one agent opens on that agent (AI-208)", () => {
  test("its goal is the focused agent against target, not the whole region", async () => {
    const matter = await teamMatter([FOCUS_AGENT]);
    const agentId = AGENTS.find((agent) => agent.nameTh === FOCUS_AGENT)?.id;
    expect(matter.goal?.kind).toBe("attainment");
    const filters = matter.goal?.kind === "attainment" ? (matter.goal.query.filters as Record<string, unknown>) : null;
    expect(filters?.agent).toEqual([agentId ?? "missing"]);
  });

  test("the receiver's card leads with the focused agent, its drill asks about that agent, and the inbox reads that agent's figure", async () => {
    const matter = await teamMatter([FOCUS_AGENT]);
    const view = await openShare(matter, user(REP));
    const agents = view.reads.map((read) => read.result).find((result) => answerOf(result).query.dims.includes("agent"));
    const answer = answerOf(agents);
    expect(answer.headline.asked).toEqual([FOCUS_AGENT]);
    const drills = view.reads.map((read) => ((read.result as { nextActions?: NextAction[] }).nextActions ?? []).find((action) => action.kind === "drill")?.prompt ?? "");
    expect(drills).toEqual(view.reads.map(() => expect.stringContaining(FOCUS_AGENT)));
    expect((await cardHero(matter.card, user(REP), matter.focus)) ?? "").toStartWith(FOCUS_AGENT);
  });
});

describe("a focused agent reads on its card's month base on every surface (AI-235)", () => {
  const MONTH_HERO: CardHero = { label: FOCUS_AGENT, value: "85.3%", unit: "ของเป้าทั้งเดือน", delta: null, trend: "down", tone: "bad", detail: "ถึงวันนี้ควรได้ 86.7%" };
  const MONTH_WORDS = "ขอนแก่นมหาชัย 85.3% ของเป้าทั้งเดือน ถึงวันนี้ควรได้ 86.7%";

  test("the send preview shows ขอนแก่นมหาชัย as 85.3% of the month target in the danger tone with the 86.7% pace mark, never 71.0 ล้านบาท −1.6% on the pace base", async () => {
    const focus = await cardFocus(TEAM_CARD, user(RSM), ["ฝากเข้าไปติดตามสถานการณ์และพูดคุยกับขอนแก่นมหาชัย"]);
    expect(focus?.figure).toEqual(MONTH_HERO);
    expect(focus?.hero).toBe(MONTH_WORDS);
  });

  test("the rep's inbox row and the matter headline say the same, with no figure on the pace base", async () => {
    const matter = await teamMatter([FOCUS_AGENT]);
    expect(await cardHero(matter.card, user(REP), matter.focus)).toBe(MONTH_WORDS);
    const view = await openShare(matter, user(REP));
    const agents = answerOf(view.reads.map((read) => read.result).find((result) => answerOf(result).query.dims.includes("agent")));
    const card = presentCard({ title: "", query: agents.query, result: agents });
    expect(card.verdict).toBe("ขอนแก่นมหาชัยช้ากว่าเป้าตามเวลา");
    expect(card.hero).toEqual(MONTH_HERO);
    const strip = card.body.kind === "strip" ? card.body.strip : null;
    expect(strip?.overall?.sub).toBe("71.0 · เป้าทั้งเดือน 83.2 ล้านบาท");
    expect(strip?.total ?? "").toStartWith("รวม");
  });
});
