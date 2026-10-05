import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

const USAGE = "usage: bun run mcp:probe <token> [--url=http://localhost:3100/api/mcp] [--legacy]";
const DEFAULT_URL = "http://localhost:3100/api/mcp";
const BY_REGION = { metric: "net_sales_volume", dims: ["region"], filters: {}, range: { from: "2026-07-01", to: "2026-09-30" }, grain: "month", compare: "none", limit: 10 };

type Row = { region?: string; value_label?: string };

const args = process.argv.slice(2);
const token = args.find((arg) => !arg.startsWith("--"));
const url = args.find((arg) => arg.startsWith("--url="))?.slice("--url=".length) ?? DEFAULT_URL;
const mode = args.includes("--legacy") ? "legacy" : "auto";
if (!token) {
  console.error(USAGE);
  process.exit(2);
}

const transport = new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { Authorization: `Bearer ${token}` } } });
const client = new Client({ name: "winyu-mcp-probe", version: "1.0.0" }, { versionNegotiation: { mode } });
try {
  await client.connect(transport);
} catch (error) {
  console.log(`connect refused: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

const { tools } = await client.listTools();
console.log(`${url} · negotiation ${mode} · ${tools.length} tools: ${tools.map((tool) => tool.name).join(", ")}`);
const result = await client.callTool({ name: "query_metric", arguments: BY_REGION });
const text = "content" in result && Array.isArray(result.content) && result.content[0]?.type === "text" ? String(result.content[0].text) : "";
const body = JSON.parse(text.split("\n").slice(1, -1).join("\n")) as { ok: boolean; code?: string; error?: string; rows?: Row[]; summary?: string };
console.log(`query_metric net_sales_volume by region, Q3 2026 → ok ${body.ok}${body.code ? ` ${body.code}: ${body.error}` : ""}`);
for (const row of body.rows ?? []) console.log(`  ${row.region} ${row.value_label}`);
if (body.summary) console.log(`  summary: ${body.summary}`);
await client.close();
