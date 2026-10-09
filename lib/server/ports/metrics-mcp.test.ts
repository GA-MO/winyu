import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import type { AccessContext, FactRequest, MetricQuery } from "@/lib/contracts";
import { accessFor } from "@/lib/access/policies";
import { presentCard } from "@/lib/cards/present";
import { TODAY } from "@/lib/data/dates";
import { findUser } from "@/lib/data/entities/users";
import { TH } from "@/lib/i18n/th";
import { registerClientFactory, resetClientPool } from "@/lib/server/connectors/pool";
import { signedIdentityHeaders } from "@/lib/server/connectors/signed-identity";
import { runMetric } from "@/lib/server/metrics";
import { describeEntityTool } from "@/lib/server/tools/describe-entity";
import { runWithAccess } from "@/lib/server/request-context";
import { metricsMcpFetch } from "@/scripts/metrics-mcp";
import { GENERATOR_PORTS } from "./generator";
import { registerPorts, resetPorts } from "./index";
import type { MetricsPort } from "./metrics";
import { PortUnavailable } from "./unavailable";
import { metricsMcpPort } from "./metrics-mcp";

const SECRET = "metrics-mcp-test-secret";
const TIMEOUT_MS = 300;
const SLOW_MS = 1_000;
const MONTH_START = `${TODAY.slice(0, 8)}01`;
const RANGE = { from: "2026-08-01", to: "2026-09-22" };
const TOTAL: FactRequest = { metric: "net_sales_volume", measure: "actual", dims: [], filters: {}, range: RANGE, labelShift: { days: 0, months: 0 } };

const PEOPLE: Record<string, AccessContext> = {
  ceo: accessFor(findUser("u_thana")!),
  rep: accessFor(findUser("u_krit")!),
  hr: accessFor(findUser("u_may")!),
  it: accessFor(findUser("u_ton")!),
};

const QUESTIONS: MetricQuery[] = [
  { metric: "net_sales_value", dims: ["region"], filters: {}, range: RANGE, grain: "month", compare: "prev_period", limit: null },
  { metric: "net_sales_volume", dims: [], filters: {}, range: { from: MONTH_START, to: TODAY }, grain: "month", compare: "target", limit: null },
  { metric: "net_sales_volume", dims: ["agent"], filters: {}, range: RANGE, grain: "month", compare: "prev_year", limit: 10, sort: "delta_asc" },
  { metric: "days_of_cover", dims: ["dc"], filters: {}, range: RANGE, grain: "week", compare: "none", limit: null },
  { metric: "avg_salary", dims: ["department"], filters: {}, range: RANGE, grain: "month", compare: "none", limit: null },
];

type Served = { url: string; audit: string[]; stop: () => void };

function serve(port: MetricsPort, secret = SECRET): Served {
  const audit: string[] = [];
  const server = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: metricsMcpFetch({ port, secret, audit: (line) => audit.push(line) }) });
  return { url: `${server.url}mcp`, audit, stop: () => server.stop(true) };
}

function slowPort(): MetricsPort {
  const wait = () => new Promise((resolve) => setTimeout(resolve, SLOW_MS));
  return { ...GENERATOR_PORTS.metrics, readFacts: async (requests) => (await wait(), GENERATOR_PORTS.metrics.readFacts(requests)) };
}

async function onGenerator<T>(work: () => Promise<T>): Promise<T> {
  resetPorts();
  return work();
}

async function onMcp<T>(port: MetricsPort, work: () => Promise<T>): Promise<T> {
  registerPorts({ metrics: port });
  return work();
}

let demo: Served;

beforeAll(() => {
  demo = serve(GENERATOR_PORTS.metrics);
});

afterAll(() => demo.stop());

afterEach(() => {
  resetPorts();
  resetClientPool();
});

describe("the metrics port over the data team's MCP", () => {
  test("every scoped question reads the same through MCP as in-process, for a CEO, a rep, HR and a role without access", async () => {
    const port = metricsMcpPort({ url: demo.url, secret: SECRET, timeoutMs: 5_000 });
    for (const [who, access] of Object.entries(PEOPLE)) {
      for (const question of QUESTIONS) {
        const local = await onGenerator(() => runMetric(question, access));
        const remote = await onMcp(port, () => runMetric(question, access));
        expect({ who, question: question.metric, result: remote }).toEqual({ who, question: question.metric, result: local });
      }
    }
    expect(demo.audit.length).toBeGreaterThan(0);
  });

  test("master data, the metric list and entity lookups come back unchanged", async () => {
    const port = metricsMcpPort({ url: demo.url, secret: SECRET, timeoutMs: 5_000 });
    const local = GENERATOR_PORTS.metrics;
    expect(await port.masterData()).toEqual(await local.masterData());
    expect(await port.listMetrics(null)).toEqual(await local.listMetrics(null));
    expect(await port.listMetrics("ยอดขาย")).toEqual(await local.listMetrics("ยอดขาย"));
    expect(await port.describeEntity("dc", "dc_bkk")).toEqual(await local.describeEntity("dc", "dc_bkk"));
    expect(await port.describeEntity("agent", "ไม่มีเอเย่นต์นี้")).toEqual(await local.describeEntity("agent", "ไม่มีเอเย่นต์นี้"));
  });

  test("the same scoped request within the window is asked once, even with keys in another order", async () => {
    const port = metricsMcpPort({ url: demo.url, secret: SECRET, timeoutMs: 5_000 });
    const request: FactRequest = { metric: "net_sales_volume", measure: "actual", dims: ["region"], filters: { region: ["north"] }, range: RANGE, labelShift: { days: 0, months: 0 } };
    const reordered: FactRequest = { labelShift: { months: 0, days: 0 }, range: { to: RANGE.to, from: RANGE.from }, filters: { region: ["north"] }, dims: ["region"], measure: "actual", metric: "net_sales_volume" };
    const before = demo.audit.length;
    const [first] = await port.readFacts([request]);
    const [again] = await port.readFacts([reordered]);
    expect(again).toEqual(first);
    expect(demo.audit.length - before).toBe(1);
  });

  test("a source slower than the timeout is a typed error, which the semantic layer turns into ข้อมูลไม่พร้อม instead of zeros", async () => {
    const slow = serve(slowPort());
    try {
      const port = metricsMcpPort({ url: slow.url, secret: SECRET, timeoutMs: TIMEOUT_MS });
      const failure = await port.readFacts([TOTAL]).catch((error: unknown) => error);
      expect(failure).toBeInstanceOf(PortUnavailable);
      expect((failure as PortUnavailable).reason).toBe("timeout");
      const result = await onMcp(port, () => runMetric(QUESTIONS[0], PEOPLE.ceo));
      expect(result).toEqual({ ok: false, code: "CONNECTOR_UNAVAILABLE", error: TH.cards.failed.metricsDown });
      const card = presentCard({ title: "ยอดขาย", query: QUESTIONS[0], result });
      expect(card.denied).toEqual({ title: TH.cards.failed.unavailableTitle, body: TH.cards.failed.unavailable });
      expect(card.hero).toBeNull();
    } finally {
      slow.stop();
    }
  });

  test("an entity lookup with the source down answers ข้อมูลไม่พร้อม rather than throwing", async () => {
    const port = metricsMcpPort({ url: "http://127.0.0.1:9/mcp", secret: SECRET, timeoutMs: TIMEOUT_MS });
    const result = await onMcp(port, () => runWithAccess(PEOPLE.ceo, () => describeEntityTool.execute({ kind: "dc", query: "dc_bkk" })));
    expect(result).toMatchObject({ ok: false, code: "CONNECTOR_UNAVAILABLE" });
  });

  test("the server refuses a request Winyu did not sign, and one signed with another secret", async () => {
    const unsigned = await fetch(demo.url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) });
    expect(unsigned.status).toBe(401);
    const forged = await fetch(demo.url, { method: "POST", headers: { "content-type": "application/json", ...signedIdentityHeaders(null, "not-the-secret") }, body: "{}" });
    expect(forged.status).toBe(401);
    const port = metricsMcpPort({ url: demo.url, secret: "not-the-secret", timeoutMs: 2_000 });
    const failure = await port.masterData().catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(PortUnavailable);
  });

  test("a result that is not the contract is rejected at the boundary", async () => {
    registerClientFactory(async () => ({
      listTools: async () => ({ tools: [] }),
      callTool: async () => ({ content: [], structuredContent: { ok: true, rows: [{ dims: {}, value: "12", weight: 1 }] } }),
      close: async () => undefined,
    }));
    const port = metricsMcpPort({ url: "http://127.0.0.1:9/mcp", secret: SECRET, timeoutMs: 2_000 });
    const failure = await port.readFacts([TOTAL]).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(PortUnavailable);
    expect((failure as PortUnavailable).reason).toBe("malformed");
  });
});
