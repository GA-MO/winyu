import { afterAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import type { MetricResult, NextAction, User } from "@/lib/contracts";
import { AGENTS } from "@/lib/data/entities/agents";
import { findUser } from "@/lib/data/entities/users";
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
    const drill = ((agents as { nextActions?: NextAction[] }).nextActions ?? []).find((action) => action.kind === "drill");
    expect(drill?.prompt ?? "").toContain(FOCUS_AGENT);
    expect((await cardHero(matter.card, user(REP), matter.focus)) ?? "").toStartWith(FOCUS_AGENT);
  });
});
