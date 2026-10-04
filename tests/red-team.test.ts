import { afterAll, describe, expect, test } from "bun:test";
import type { Tool } from "ai";
import { accessFor } from "@/lib/access/policies";
import { killTool, reviveTool, toolsFor } from "@/lib/access/enforce";
import { SUPPRESSED_VALUE } from "@/lib/access/suppression";
import type { AccessContext, MetricQuery, MetricResult, Region, RoleId, ToolName } from "@/lib/contracts";
import { findUser } from "@/lib/data/entities/users";
import { REGION_LABELS_TH } from "@/lib/data/entities/org";
import { memoryFacts, packets } from "@/lib/server/agent/collections";
import { winyuTools, toolsForAccess } from "@/lib/server/agent/tools";
import { createPacket, packetsFor, resolveEvidence } from "@/lib/server/handoff";
import { personaFor, relevantMemory } from "@/lib/server/agent/persona";
import { runWithAccess, runWithTurn } from "@/lib/server/request-context";

const TODAY = "2026-09-22";
const MONTH_START = "2026-09-01";
const MIN_PROBES = 60;
const NO_TURN = { turnId: null, threadId: null, preloadPacketId: null, question: null, queries: [] };
const planted: { facts: string[]; packets: string[] } = { facts: [], packets: [] };

let probeCount = 0;
const leaks: string[] = [];

function access(userId: string): AccessContext {
  const user = findUser(userId);
  if (!user) throw new Error(`missing demo user ${userId}`);
  return accessFor(user);
}

function query(partial: Partial<MetricQuery>): MetricQuery {
  return {
    metric: "net_sales_volume",
    dims: ["region"],
    filters: {},
    range: { from: MONTH_START, to: TODAY },
    grain: "month",
    compare: "none",
    limit: 20,
    ...partial,
  };
}

async function ask<T>(userId: string, name: string, input: unknown): Promise<T> {
  const definition = winyuTools()[name] as Tool;
  const execute = definition.execute as (args: unknown, options: unknown) => Promise<T>;
  return runWithAccess(access(userId), () => execute(input, {}));
}

function numbersIn(result: MetricResult): number[] {
  if (!result.ok) return [];
  return result.rows.flatMap((row) => Object.values(row).filter((value): value is number => typeof value === "number"));
}

function record(label: string, leaked: boolean): void {
  probeCount += 1;
  if (leaked) leaks.push(label);
}

/** One cross-scope probe: it may be denied or narrowed, but it must never return a number from outside the scope. */
async function probeRegion(userId: string, foreign: Region, partial: Partial<MetricQuery>): Promise<void> {
  const label = `${userId} → ${foreign} (${partial.metric ?? "net_sales_volume"})`;
  const result = await ask<MetricResult>(userId, "query_metric", query({ ...partial, filters: { region: [foreign], ...partial.filters } }));
  if (!result.ok) return record(label, result.code !== "PERMISSION_DENIED");
  const foreignLabel = REGION_LABELS_TH[foreign];
  record(label, result.rows.some((row) => row.region === foreignLabel));
}

async function probeMetric(userId: string, metric: MetricQuery["metric"], dims: MetricQuery["dims"], allowed: boolean): Promise<void> {
  const label = `${userId} → ${metric}`;
  const result = await ask<MetricResult>(userId, "query_metric", query({ metric, dims }));
  if (allowed) return record(label, !result.ok);
  if (!result.ok) return record(label, result.code !== "PERMISSION_DENIED");
  record(label, numbersIn(result).length > 0);
}

const RSM_REGIONS: [string, Region][] = [
  ["u_kanok", "bkk"],
  ["u_somchai", "central"],
  ["u_nattaya", "north"],
  ["u_anucha", "northeast"],
  ["u_wichai", "east"],
  ["u_saranya", "south"],
];

const FOREIGN_OF: Record<Region, Region> = { bkk: "south", central: "north", north: "northeast", northeast: "south", east: "bkk", south: "central" };
const REPS: [string, Region][] = [["u_krit", "northeast"], ["u_ploy", "north"], ["u_arm", "south"], ["u_golf", "east"], ["u_ice", "central"]];
const AGENT_OUTSIDE: Record<Region, string> = {
  bkk: "ag_sou_01",
  central: "ag_nor_01",
  north: "ag_nea_01",
  northeast: "ag_sou_03",
  east: "ag_bkk_01",
  south: "ag_cen_01",
};

const EVERY_ROLE: [string, RoleId][] = [
  ["u_thana", "ceo"],
  ["u_siriporn", "cfo"],
  ["u_prasit", "sales_director"],
  ["u_anucha", "sales_rsm"],
  ["u_krit", "sales_rep"],
  ["u_ben", "marketing_lead"],
  ["u_wee", "supply_planner"],
  ["u_mint", "finance_analyst"],
  ["u_may", "hr_manager"],
  ["u_ton", "it_admin"],
];

describe("red team: region scope", () => {
  test("no regional manager reads another region through a region filter", async () => {
    for (const [userId, own] of RSM_REGIONS) await probeRegion(userId, FOREIGN_OF[own], {});
    for (const [userId, own] of REPS) await probeRegion(userId, FOREIGN_OF[own], { metric: "sell_out_volume" });
  });

  test("no regional manager reads another region through an agent or province filter", async () => {
    for (const [userId, own] of RSM_REGIONS) {
      const label = `${userId} → agent ${AGENT_OUTSIDE[own]}`;
      const result = await ask<MetricResult>(userId, "query_metric", query({ dims: ["agent"], filters: { agent: [AGENT_OUTSIDE[own]] } }));
      record(label, result.ok);
    }
  });

  test("an unfiltered question is narrowed to the caller's own region", async () => {
    for (const [userId, own] of RSM_REGIONS) {
      const label = `${userId} → unfiltered`;
      const result = await ask<MetricResult>(userId, "query_metric", query({}));
      if (!result.ok) {
        record(label, true);
        continue;
      }
      expect(result.provenance.scopeApplied).toEqual({ region: [own] });
      record(label, result.rows.some((row) => row.region !== REGION_LABELS_TH[own]));
    }
  });

  test("stock and production questions stay inside the region too", async () => {
    for (const [userId, own] of RSM_REGIONS) await probeRegion(userId, FOREIGN_OF[own], { metric: "days_of_cover", dims: ["region"] });
  });
});

describe("red team: metric ACL", async () => {
  test("only HR and the CEO read salary", async () => {
    for (const [userId, role] of EVERY_ROLE) await probeMetric(userId, "avg_salary", ["department"], role === "hr_manager" || role === "ceo");
  });

  test("sales and supply roles cannot read HR headcount or attrition", async () => {
    for (const userId of ["u_anucha", "u_krit", "u_wee"]) {
      await probeMetric(userId, "headcount", ["department"], false);
      await probeMetric(userId, "attrition_rate", ["department"], false);
    }
  });

  test("margin is closed to the roles that do not own it", async () => {
    for (const userId of ["u_anucha", "u_krit", "u_wee", "u_ben"]) await probeMetric(userId, "gross_margin", ["business_unit"], false);
  });

  test("a masked metric returns no number and says which fields are closed", async () => {
    const result = await ask<MetricResult>("u_siriporn", "query_metric", query({ metric: "avg_salary", dims: ["department"] }));
    if (!result.ok) throw new Error(result.error);
    record("u_siriporn → avg_salary masked", numbersIn(result).length > 0);
    expect(result.provenance.masked).toContain("value");
    expect(result.rows.every((row) => row.value === SUPPRESSED_VALUE)).toBe(true);
  });
});

describe("red team: aggregation", async () => {
  test("a roll-up covering fewer than three agents is suppressed for every role that can read it", async () => {
    for (const userId of ["u_siriporn", "u_mint", "u_thana"]) {
      const label = `${userId} → ar_overdue by province`;
      const result = await ask<MetricResult>(userId, "query_metric", query({ metric: "ar_overdue", dims: ["province"], limit: 40 }));
      if (!result.ok) {
        record(label, true);
        continue;
      }
      const phuket = result.rows.find((row) => row.province === "ภูเก็ต");
      record(label, phuket !== undefined && phuket.value !== SUPPRESSED_VALUE);
    }
  });

  test("the dc roll-up of a single-agent province is suppressed as well", async () => {
    const result = await ask<MetricResult>("u_siriporn", "query_metric", query({ metric: "ar_overdue", dims: ["province"], filters: { province: ["pv_phuket"] }, limit: 5 }));
    if (!result.ok) throw new Error(result.error);
    record("u_siriporn → ar_overdue pv_phuket", result.rows.some((row) => row.value !== SUPPRESSED_VALUE));
  });
});

describe("red team: other users' state", async () => {
  test("memory of one user is invisible to another", async () => {
    const fact = memoryFacts().put({
      id: "rt_fact_pim",
      userId: "u_pim",
      type: "interest",
      value: "แคมเปญปุระน้ำแร่ในอีสาน",
      confidence: 0.9,
      sourceThreadId: null,
      createdAt: new Date().toISOString(),
      decayAt: null,
    });
    planted.facts.push(fact.id);
    for (const userId of ["u_anucha", "u_thana", "u_ton"]) {
      const label = `${userId} → memory of u_pim`;
      const result = await ask<{ data: { userId: string }[] }>(userId, "recall_memory", { query: "ปุระ" });
      record(label, result.data.some((row) => row.userId === "u_pim"));
    }
  });

  test("the context retriever never puts one user's memory in another user's prompt, even when the question names it", async () => {
    const fact = memoryFacts().put({
      id: "rt_fact_pim_context",
      userId: "u_pim",
      type: "interest",
      value: "งบลับแคมเปญปุระฝั่งอีสาน",
      confidence: 0.95,
      sourceThreadId: null,
      createdAt: new Date().toISOString(),
      decayAt: null,
    });
    planted.facts.push(fact.id);
    for (const userId of ["u_anucha", "u_thana", "u_ton", "u_ben"]) {
      const user = findUser(userId);
      if (!user) throw new Error(`missing demo user ${userId}`);
      const question = "งบลับแคมเปญปุระฝั่งอีสาน";
      const retrieved = relevantMemory(userId, question);
      const prompt = runWithTurn({ ...NO_TURN, question }, () => personaFor(access(userId), user, { today: TODAY, context: {}, tools: { read: [], write: [], destructive: [] } })).join("\n");
      record(`${userId} → retrieved memory of u_pim`, retrieved.some((entry) => entry.userId !== userId));
      record(`${userId} → prompt carries memory of u_pim`, prompt.includes(fact.value));
    }
    const own = findUser("u_pim");
    if (!own) throw new Error("missing demo user u_pim");
    record("u_pim → own memory reaches the prompt", !relevantMemory("u_pim", "ปุระ").some((entry) => entry.id === fact.id));
  });

  test("a packet addressed to someone else is not in this user's inbox", async () => {
    const recipient = findUser("u_pim");
    if (!recipient) throw new Error("missing demo user u_pim");
    const packet = (await createPacket(
      {
        toUserId: "u_pim",
        title: "ทดสอบเรดทีม",
        ask: "ตรวจยอดอีสาน",
        urgency: "low",
        evidence: [query({ filters: { region: ["northeast"] } })],
        alertIds: [],
        digest: "",
        suggestedActions: [],
        threadId: null,
      },
      findUser("u_anucha"),
      recipient,
    ));
    planted.packets.push(packet.id);
    for (const userId of ["u_krit", "u_ben", "u_ton"]) {
      record(`${userId} → packet of u_pim`, packetsFor(userId).some((entry) => entry.id === packet.id));
    }
  });

  test("packet evidence is re-run under the reader's own scope", async () => {
    const packet = packets().get(planted.packets[0]);
    if (!packet) throw new Error("planted packet is gone");
    const views = await resolveEvidence(packet, access("u_saranya"));
    record("u_saranya → northeast evidence", views.some((view) => view.rows.some((row) => row.region === REGION_LABELS_TH.northeast)));
  });
});

describe("red team: tool surface", async () => {
  test("a sales rep has no outbound or admin tool", () => {
    const rep = toolsFor(access("u_krit"));
    for (const name of ["create_handoff", "send_email", "run_job"]) {
      record(`u_krit → ${name}`, rep.includes(name as (typeof rep)[number]));
    }
    record("u_krit → toolset", Object.keys(toolsForAccess(access("u_krit"))).includes("run_job"));
  });

  test("a tool outside the role's grant is refused at call time, not only left off the tool set", async () => {
    const outside: [string, string, unknown][] = [
      ["u_krit", "create_handoff", { toUserId: "u_anucha", title: "probe", ask: "probe", urgency: "low", evidence: [], alertIds: [] }],
      ["u_krit", "send_email", { toUserId: "u_krit", subject: "probe", body: "probe" }],
      ["u_krit", "run_job", { job: "compose" }],
      ["u_krit", "set_permission", { role: "sales_rep", kind: "tool", key: "run_job", value: "allow" }],
      ["u_thana", "set_permission", { role: "sales_rep", kind: "metric", key: "avg_salary", value: "full" }],
    ];
    for (const [userId, name, input] of outside) {
      const allowed = toolsFor(access(userId)).includes(name as ToolName);
      const result = await ask<{ ok?: boolean; code?: string }>(userId, name, input);
      record(`${userId} → ${name} executed directly`, !allowed && result.code !== "TOOL_NOT_ALLOWED");
    }
  });

  test("a tool the admin killed is refused at call time for every role", async () => {
    killTool("list_courses", "u_ton");
    try {
      for (const [userId] of EVERY_ROLE) {
        const result = await ask<{ code?: string }>(userId, "list_courses", { month: null, query: null });
        record(`${userId} → killed list_courses`, result.code !== "TOOL_NOT_ALLOWED");
      }
    } finally {
      reviveTool("list_courses");
    }
  });

  test("only IT runs batch jobs", () => {
    for (const [userId, role] of EVERY_ROLE) {
      const allowed = toolsFor(access(userId)).includes("run_job");
      record(`${userId} → run_job`, allowed !== (role === "it_admin"));
    }
  });

  test("alerts come back only for the caller's scope", async () => {
    for (const [userId, own] of RSM_REGIONS.slice(0, 3)) {
      const label = `${userId} → alerts`;
      const result = await ask<{ rows: { scope: { region?: string } }[] }>(userId, "get_alerts", { status: "open", limit: 20 });
      record(label, result.rows.some((row) => row.scope.region !== undefined && row.scope.region !== own));
    }
  });
});

describe("red team: verdict", async () => {
  test(`${MIN_PROBES}+ cross-scope probes leak nothing`, () => {
    expect(probeCount).toBeGreaterThanOrEqual(MIN_PROBES);
    expect(leaks).toEqual([]);
  });
});

afterAll(() => {
  for (const id of planted.facts) memoryFacts().remove(id);
  for (const id of planted.packets) packets().remove(id);
});
