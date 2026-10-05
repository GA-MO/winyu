import { randomUUID } from "node:crypto";
import { liveAccessFor, toolsFor } from "@/lib/access/enforce";
import { presentCard } from "@/lib/cards/present";
import type { MetricQuery, MetricResult } from "@/lib/contracts";
import { addDays, TODAY } from "@/lib/data/dates";
import { findUser } from "@/lib/data/entities/users";
import { newRun, runWithRun, saveRun } from "@/lib/harness/runtime";
import { winyuTools } from "@/lib/server/agent/tools";
import { runWithAccess, runWithTurn } from "@/lib/server/request-context";

export const runtime = "nodejs";

const QUESTION = "ยอดขายเป็นเงินเดือนนี้แยกตามภาค";
const REVENUE_QUERY: MetricQuery = {
  metric: "net_sales_value",
  dims: ["region"],
  filters: {},
  range: { from: addDays(TODAY, -21), to: TODAY },
  grain: "month",
  compare: "prev_period",
  limit: null,
};

function isMetricResult(value: unknown): value is MetricResult {
  return typeof value === "object" && value !== null && "ok" in value;
}

/** Proves the domain runs inside Next: one persona's access, its tool list, and query_metric through the same nesting a chat turn uses. Development only. */
export async function GET(req: Request): Promise<Response> {
  if (process.env.NODE_ENV === "production") return new Response(null, { status: 404 });
  const userId = new URL(req.url).searchParams.get("user");
  const user = userId ? findUser(userId) : null;
  if (!user) return Response.json({ error: `unknown user ${userId}` }, { status: 400 });
  const access = liveAccessFor(user);
  const queryMetric = winyuTools().query_metric;
  const input = queryMetric.inputSchema().parse(REVENUE_QUERY);
  const run = newRun(access.userId, null);
  const turn = { turnId: run.id, threadId: null, preloadPacketId: null, question: QUESTION, queries: [] };
  const output = await runWithAccess(access, () => runWithTurn(turn, () => runWithRun(run, () => queryMetric.execute(input, { toolCallId: randomUUID() }))));
  saveRun(run);
  const result = isMetricResult(output) ? output : null;
  const card = result ? presentCard({ title: QUESTION, query: REVENUE_QUERY, result }) : null;
  return Response.json({
    user: { id: user.id, role: access.role, regions: access.regions, brands: access.brands },
    tools: toolsFor(access),
    question: QUESTION,
    ok: result?.ok ?? false,
    headline: result?.ok ? result.headline.value : null,
    hero: card?.hero ?? null,
    rowCount: result?.ok ? result.rows.length : 0,
    rows: result?.ok ? result.rows.map((row) => row.region) : [],
    refusal: output && typeof output === "object" && "error" in output ? output.error : null,
  });
}
