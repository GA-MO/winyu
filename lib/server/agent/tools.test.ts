import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { accessFor } from "@/lib/access/policies";
import { liveAccessFor, setHandoffEnabled, withAdminSwitches } from "@/lib/access/enforce";
import { resetRoleOverrides } from "@/lib/access/role-overrides";
import type { AccessContext, MetricQuery, MetricResult } from "@/lib/contracts";
import { findUser } from "@/lib/data/entities/users";
import { auditLog } from "@/lib/server/audit";
import { TH } from "@/lib/i18n/th";
import { runWithAccess, runWithTurn } from "@/lib/server/request-context";
import { notifications, outbox, packets } from "./collections";
import type { WinyuTool } from "@/lib/server/tools/define";
import { toolSurface } from "@/lib/server/tools/registry";
import { winyuTools, toolsForAccess } from "./tools";

const TODAY = "2026-09-22";
const MONTH_START = "2026-09-01";

function accessOf(userId: string): AccessContext {
  const user = findUser(userId);
  if (!user) throw new Error(`no user ${userId}`);
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
    limit: 10,
    ...partial,
  };
}

function toolNamesOf(tools: WinyuTool[]): string[] {
  return tools.map((tool) => tool.entry.name);
}

async function call<T>(userId: string, name: string, input: unknown): Promise<T> {
  const access = accessOf(userId);
  const { execute } = winyuTools()[name];
  return runWithAccess(access, () => execute(input) as Promise<T>);
}

const NATIONAL_WEEKLY_FLOOR_HL = 30_000;

describe("query_metric", () => {
  test("an RSM cannot read another region", async () => {
    const result = await call<MetricResult>("u_anucha", "query_metric", query({ filters: { region: ["south"] } }));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a denial");
    expect(result.code).toBe("PERMISSION_DENIED");
    expect(result.error).toMatch(/south|ภาคใต้/);
  });

  test("an unfiltered RSM question is narrowed to its own region", async () => {
    const result = await call<MetricResult>("u_anucha", "query_metric", query({}));
    if (!result.ok) throw new Error(result.error);
    expect(result.provenance.scopeApplied).toEqual({ region: ["northeast"] });
    expect(result.rows.every((row) => row.region === "ภาคอีสาน")).toBe(true);
  });

  test("the CEO reads every region", async () => {
    const result = await call<MetricResult>("u_thana", "query_metric", query({ filters: { region: ["south"] } }));
    if (!result.ok) throw new Error(result.error);
    expect(result.rows.length).toBeGreaterThan(0);
    expect(result.rows[0].region).toBe("ภาคใต้");
    expect(result.provenance.masked).toEqual([]);
  });

  test("avg_salary comes back masked for a sales rep and in full for HR", async () => {
    const masked = await call<MetricResult>("u_krit", "query_metric", query({ metric: "avg_salary", dims: ["department"] }));
    if (!masked.ok) throw new Error(masked.error);
    expect(masked.provenance.masked.length).toBeGreaterThan(0);
    expect(masked.rows.every((row) => row.value === "***")).toBe(true);
    expect(masked.rows.length).toBeGreaterThan(0);

    const full = await call<MetricResult>("u_may", "query_metric", query({ metric: "avg_salary", dims: ["department"] }));
    if (!full.ok) throw new Error(full.error);
    expect(full.provenance.masked).toEqual([]);
    expect(typeof full.rows[0].value).toBe("number");
  });

  test("a metric the role cannot see at all is denied", async () => {
    const result = await call<MetricResult>("u_krit", "query_metric", query({ metric: "gross_margin", dims: ["region"] }));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a denial");
    expect(result.code).toBe("PERMISSION_DENIED");
  });
});

describe("list_metrics", () => {
  test("lists only the metrics the caller's role can see, so HR is not shown the sales catalogue", async () => {
    type Listed = { data: { id: string }[] };
    const hr = await call<Listed>("u_may", "list_metrics", { search: null });
    const ceo = await call<Listed>("u_thana", "list_metrics", { search: null });
    expect(hr.data.map((row) => row.id).sort()).toEqual(["attrition_rate", "avg_salary", "headcount"]);
    expect(ceo.data.length).toBeGreaterThan(hr.data.length);
  });
});

describe("audit", () => {
  test("one entry per tool call, with the decision", async () => {
    const before = auditLog().all().length;
    await call("u_anucha", "query_metric", query({}));
    await call("u_anucha", "query_metric", query({ filters: { region: ["south"] } }));
    const entries = auditLog().all();
    expect(entries.length).toBe(before + 2);
    const mine = entries.slice(-2);
    expect(mine.every((entry) => entry.userId === "u_anucha" && entry.tool === "query_metric")).toBe(true);
    expect(mine.map((entry) => entry.decision)).toEqual(["allow", "deny"]);
    expect(mine[0].argsHash).not.toBe(mine[1].argsHash);
    expect(mine[0].rowsReturned).toBeGreaterThan(0);
  });

  test("a masked result is audited as masked", async () => {
    await call("u_krit", "query_metric", query({ metric: "avg_salary", dims: ["department"] }));
    const last = auditLog().all().slice(-1)[0];
    expect(last.decision).toBe("masked");
  });
});

describe("resolve_owner", () => {
  test("sales in the northeast resolves to the RSM of that region", async () => {
    const result = await call<{ ok: boolean; data: { userId: string; reason: string } }>("u_thana", "resolve_owner", {
      metric: "net_sales_volume",
      dims: { region: "northeast" },
    });
    expect(result.ok).toBe(true);
    expect(result.data.userId).toBe("u_anucha");
    expect(result.data.reason.length).toBeGreaterThan(0);
  });
});

describe("create_handoff", () => {
  test("writes a packet, a notification and an outbox entry", async () => {
    const result = await call<{ ok: boolean; data: { packetId: string } }>("u_anucha", "create_handoff", {
      toUserId: "u_pim",
      title: "ยอดขายภาคอีสานต่ำกว่าเป้า",
      ask: "ช่วยตรวจสอบเอเย่นต์ที่ยอดตก",
      urgency: "high",
      evidence: [query({ filters: { region: ["northeast"] } })],
      alertIds: [],
    });
    expect(result.ok).toBe(true);
    const packet = packets().get(result.data.packetId);
    expect(packet?.toUserId).toBe("u_pim");
    expect(packet?.status).toBe("open");
    expect(packet?.evidence.length).toBe(1);
    expect(notifications().where((item) => item.refId === result.data.packetId).length).toBe(1);
    expect(outbox().where((item) => item.refId === result.data.packetId).length).toBe(1);
  });

  test("the packet carries the sender's conversation, so the recipient's agent reads what was asked before the handoff", async () => {
    const transcript = async () => [
      { role: "user", text: "ยอดขายภาคอีสานเดือนนี้เทียบเป้า" },
      { role: "assistant", text: "ภาคอีสานต่ำกว่าเป้า 10%" },
    ];
    const turn = { turnId: "turn-handoff-digest", threadId: "thread-handoff-digest", preloadPacketId: null, question: "ส่งงานให้ผู้รับผิดชอบ", queries: [], transcript };
    const input = { toUserId: "u_pim", title: "ยอดอีสานต่ำกว่าเป้า", ask: "ช่วยตรวจสอบ", urgency: "medium", evidence: [], alertIds: [] };
    const { execute } = winyuTools().create_handoff;
    const result = (await runWithAccess(accessOf("u_anucha"), () => runWithTurn(turn, () => execute(input)))) as { ok: boolean; data: { packetId: string } };
    const digest = packets().get(result.data.packetId)?.conversationDigest ?? "";
    expect(digest).toContain("ยอดขายภาคอีสานเดือนนี้เทียบเป้า");
    expect(digest).toContain("ต่ำกว่าเป้า 10%");
  });

  test("an unknown recipient is rejected", async () => {
    const result = await call<{ ok: boolean; error: string }>("u_anucha", "create_handoff", {
      toUserId: "u_nobody",
      title: "x",
      ask: "y",
      urgency: "low",
      evidence: [],
      alertIds: [],
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("u_nobody");
  });
});

describe("analytics plane tools", () => {
  test("alerts and forecasts come from the engine, memory answers empty when nothing matches", async () => {
    const alerts = await call<{ ok: boolean; summary: string; rows: { severity: string; hypothesis: string }[] }>("u_anucha", "get_alerts", { status: "open", limit: null });
    expect(alerts.ok).toBe(true);
    expect(alerts.rows.length).toBeGreaterThan(0);
    for (const row of alerts.rows) expect(row.hypothesis.length).toBeGreaterThan(10);
    const forecast = await call<{ summary: string; weeks: unknown[] }>("u_anucha", "get_forecast", { metric: "net_sales_volume", dims: { region: "northeast", brand: "leo" }, weeks: 8 });
    expect(forecast.weeks).toHaveLength(8);
    expect(forecast.summary).toContain("MAPE");
    const national = await call<{ summary: string; weeks: { value: number }[] }>("u_thana", "get_forecast", { metric: "net_sales_volume", dims: {}, weeks: 8 });
    expect(national.summary).toContain("รวม 48 ชุดพยากรณ์ย่อย");
    expect(national.weeks[0].value).toBeGreaterThan(NATIONAL_WEEKLY_FLOOR_HL);
    const memory = await call<{ summary: string }>("u_anucha", "recall_memory", { query: "ไม่มีความจำไหนตรงกับคำนี้แน่นอน" });
    expect(memory.summary).toContain("ยังไม่มี");
  });
});

describe("run_job", () => {
  test("an IT admin can re-run the detection engine", async () => {
    const result = await call<{ ok: boolean; data: { alerts: number } }>("u_ton", "run_job", { job: "anomaly" });
    expect(result.ok).toBe(true);
    expect(result.data.alerts).toBeGreaterThan(0);
  });
});

describe("set_permission", () => {
  test("an IT admin hides a metric from a role in chat, and the role's queries follow", async () => {
    const result = await call<{ ok: boolean; summary: string; data: { before: string; after: string; affectedUsers: number } }>("u_ton", "set_permission", {
      role: "sales_rep",
      kind: "metric",
      key: "net_sales_value",
      value: "none",
    });
    expect(result.ok).toBe(true);
    expect(result.data.after).toBe(TH.admin.acl.none);
    expect(result.data.affectedUsers).toBeGreaterThan(0);
    expect(liveAccessFor(findUser("u_krit")!).metricAcl.net_sales_value).toBe("none");
    resetRoleOverrides();
  });

  test("an unknown metric and a destructive grant are refused", async () => {
    const unknown = await call<{ ok: boolean }>("u_ton", "set_permission", { role: "sales_rep", kind: "metric", key: "profit", value: "full" });
    expect(unknown.ok).toBe(false);
    const grant = await call<{ ok: boolean }>("u_ton", "set_permission", { role: "sales_rep", kind: "tool", key: "run_job", value: "allow" });
    expect(grant.ok).toBe(false);
  });

  test("only IT reaches the tool", () => {
    expect(toolNamesOf(toolsForAccess(accessOf("u_ton")))).toContain("set_permission");
    expect(toolNamesOf(toolsForAccess(accessOf("u_thana")))).not.toContain("set_permission");
  });
});

describe("toolsForAccess", () => {
  test("returns only the allowed subset", () => {
    expect(toolNamesOf(toolsForAccess(accessOf("u_krit")))).not.toContain("create_handoff");
    expect(toolNamesOf(toolsForAccess(accessOf("u_ton")))).toContain("run_job");
    expect(toolNamesOf(toolsForAccess(accessOf("u_thana")))).not.toContain("run_job");
  });

  test("the admin handoff switch takes handoff and mail away from everyone, then gives them back", () => {
    setHandoffEnabled(false, "u_ton");
    expect(toolNamesOf(toolsForAccess(accessOf("u_anucha")))).not.toContain("create_handoff");
    expect(toolNamesOf(toolsForAccess(accessOf("u_anucha")))).not.toContain("send_email");
    expect(withAdminSwitches(accessOf("u_anucha")).toolAllow).not.toContain("create_handoff");
    setHandoffEnabled(true, "u_ton");
    expect(toolNamesOf(toolsForAccess(accessOf("u_anucha")))).toContain("create_handoff");
  });
});

describe("tool definitions for the prompt cache", () => {
  function surfaceOf(userId: string): string {
    return JSON.stringify(toolsForAccess(accessOf(userId)).map((tool) => ({ name: tool.entry.name, description: tool.description(), input: z.toJSONSchema(tool.inputSchema(), { unrepresentable: "any", io: "input" }) })));
  }

  test("come in surface order, byte for byte the same for two users of one role", () => {
    expect(surfaceOf("u_ploy")).toBe(surfaceOf("u_krit"));
    const names = toolsForAccess(accessOf("u_krit")).map((tool) => tool.entry.name);
    expect(names).toEqual(toolSurface().map((entry) => entry.name).filter((name) => names.includes(name)));
  });
});
