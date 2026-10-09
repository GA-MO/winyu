# MCP server

Winyu serves its governed tools to MCP clients (Claude Code, Claude Desktop, Copilot, other agents) at `/api/mcp`. Each client acts as one Winyu user, chosen by the token it presents. No model runs on the Winyu side: the client's own model calls the tools.

## What a client gets

- **The person's own tools.** The list is `toolsFor(access)` for the token's user, after role policy, admin role overrides and kill switches. A tool the person cannot use is neither listed nor callable.
- **Read tools only.** `MCP_TOOL_TIERS` in `lib/server/mcp.ts` is the one switch. Write and destructive tools wait for the person's approval in the chat, and an MCP client has no approval prompt, so they are not exposed. Adding `"write"` to the switch would let those tools run with no one approving them. The gateway would still apply policy, admin rules, verification and audit.
- **The same gateway as the chat.** Every call runs inside `runWithAccess`, `runWithTurn` and `runWithRun` as that user, so scope filters, masking, CEL deny rules, the tool budget, `redact` and the audit apply unchanged. The audit row has `initiator: "mcp"`, and each call is a saved run whose trace opens with "ผู้ใช้เรียกผ่าน MCP". An admin rule can target the channel, for example `initiator == "mcp" && tool.name == "query_metric"`.
- **Compact JSON.** A result is the JSON the chat cards draw from, wrapped in the same data fence as other untrusted text (`fenceAsData`) and capped at 24,000 characters. A refusal comes back as `{ "ok": false, "code": ..., "error": ... }`.

## Tokens

An IT admin issues and revokes tokens on **/admin → MCP**. The plain token shows once, beside the endpoint and a ready Claude Code command. `.data/mcp-tokens.json` keeps only its SHA-256 hash and last four characters. A missing, unknown or revoked token gets HTTP 401 with `WWW-Authenticate: Bearer`.

The bearer token is checked at the route, not through OAuth. Mastra's `createOAuthMiddleware` fits an external authorization server. These tokens are opaque per-user credentials that Winyu issues itself, so the route maps the token to the user and the gateway enforces the rest.

## Protocol versions

`lib/harness/adapters/mastra/mcp.ts` builds a Mastra `MCPServer` per request with the caller's tools. A client that speaks MCP 2026-07-28 goes through Mastra's own Streamable HTTP transport. Mastra rejects 2025-era clients, and most SDK clients still connect that way by default, so a stateless shim serves them from the same Mastra server (`getToolListInfo`, `executeTool`). Both paths return the same tools and rows.

## Connect from Claude

1. An IT admin opens **/admin → MCP**, picks the user and presses **Issue token**, then copies the token.
2. Add the server.

   **Claude Code**

   ```bash
   claude mcp add --transport http winyu http://localhost:3100/api/mcp --header "Authorization: Bearer mcp_..."
   ```

   **Claude Desktop** (Settings → Developer → Edit Config, `claude_desktop_config.json`)

   ```json
   {
     "mcpServers": {
       "winyu": {
         "command": "npx",
         "args": ["-y", "mcp-remote", "http://localhost:3100/api/mcp", "--header", "Authorization: Bearer mcp_..."]
       }
     }
   }
   ```

3. Ask, for example, "ยอดขายเข้าแยกตามภาคไตรมาสนี้". The answer holds only the rows that person may see.

Replace `localhost:3100` with the deployed host. To check a token without a model, run `bun run mcp:probe mcp_... --url=http://localhost:3100/api/mcp`. Add `--legacy` to connect the way a 2025-era client does.

## Connectors to other systems

Winyu also reaches other systems as an MCP client, and MCP is the only way it does. A system that has no MCP server gets a thin one, written by the Winyu team, that wraps its REST API. `scripts/mcp-demo-crm.ts` is the example: it serves the demo CRM's visit list as one MCP tool.

- **Declare the connector.** Write it with `defineMcpConnector` in `lib/server/connectors/` and add it to `CONFIGURED` in `index.ts`. Only the tools that the config names reach the model. Each tool declares its tier, roles, scope (`inject` arguments, `filter` rows, or `none` with a reason) and sensitive fields. It can also declare its own description, input schema and output adapter.
- **One pipeline.** Every call passes the gateway as the person asking. The MCP client sends that person's identity in headers that `signed-identity.ts` signs. Winyu injects scope arguments on the way in. On the way out, it filters, masks, caps at 60 rows and fences every string. A server that does not answer within `timeoutMs` reads as `CONNECTOR_UNAVAILABLE`.
- **Drift.** At boot `reconcileConnectors` compares each server's tool list with the config, and a probe every five minutes keeps the admin's Online/Offline pill current.
- **Demo servers.** `bun run connectors:demo` serves the LMS on `:3299/mcp` and the CRM on `:3298/mcp` (`scripts/mcp-demo-server.ts` handles the JSON-RPC and the signature check for both). `WINYU_LMS_DEMO_URL` and `WINYU_CRM_DEMO_URL` move a server and the URL Winyu calls together, because the demo listens on the port in that URL.

# Metrics from the data team's MCP

The section above covers Winyu as an MCP server. Winyu is also an MCP client for its metrics: the data team serves the warehouse over MCP, and Winyu reads facts and dimension tables from it.

## What stays in Winyu

The semantic layer stays in Winyu: `lib/server/metrics.ts` and `lib/semantic/`. Winyu plans every question, injects the caller's scope into the filters, formats the numbers, adds certified, source and as-of, and applies the small-cell and masking rules. The data team's server never sees a question or a caller's access. It answers requests that Winyu has already scoped, so it never decides scope.

The model-facing tools `query_metric`, `list_metrics` and `describe_entity` stay native. Their descriptions and schemas do not change with the source, so eval recordings do not go stale.

## Select the source

| Env | Effect |
| --- | --- |
| unset | The in-process generator answers `MetricsPort` (`lib/server/ports/generator.ts`). Tests and `bun run eval` always use it. |
| `WINYU_METRICS=mcp` | `metricsMcpPort` (`lib/server/ports/metrics-mcp.ts`) answers `MetricsPort` over MCP. |
| `WINYU_METRICS_MCP_URL` | The server's Streamable HTTP endpoint. Default `http://127.0.0.1:3297/mcp`. |
| `WINYU_METRICS_MCP_SECRET` | The secret both sides sign identities with. The default is for the local demo only. |
| `WINYU_METRICS_MCP_TIMEOUT_MS` | How long one call may take, connect included. Default 4000. |

`make up` starts `bun run metrics:mcp` on :3297 beside the other demo connectors and runs dev with `WINYU_METRICS=mcp`. Run `make up METRICS=generator` to keep the in-process port. `make stop` and `make status` include :3297. To run the demo server alone on another port, set `WINYU_METRICS_MCP_PORT`.

## The contract the data team's server provides

`lib/server/ports/metrics-mcp-contract.ts` holds the contract as zod schemas. There is one tool per `MetricsPort` method. Arguments are plain JSON. Each result is a JSON object in `structuredContent`, or the same JSON as the first text content.

| Tool | Arguments | Result |
| --- | --- | --- |
| `query_facts` | One `FactRequest`: `metric`, `measure` (`actual` or `target`), `dims`, `filters`, `range`, `labelShift` | One `FactResult`: `{ ok: true, rows: [{ dims, value, weight }] }` or `{ ok: false, code: "BAD_QUERY", error }` |
| `master_data` | `{}` | `MasterData`: regions, business units, provinces, agents, brands, packs, SKUs, DCs, plants, campaigns, departments, channels, chains, makers, `ownMaker` |
| `list_metrics` | `{ search: string \| null }` | `{ metrics: MetricDef[] }` |
| `describe_entity` | `{ kind, query }` | `{ ok: true, data, summary }` or `{ ok: false, error }` |

The server must also do the following:

- Accept only requests that carry Winyu's signed identity headers (`x-winyu-user`, `x-winyu-role`, `x-winyu-regions`, `x-winyu-signature`, HMAC-SHA256 as in `lib/server/connectors/signed-identity.ts`). Refuse any other request with HTTP 401.
- Log the caller for its own audit. A chat tool call signs as the person asking. Dashboard and background reads sign as `winyu`.
- Return a group's `value` summed, and for ratio metrics its denominator in `weight`. Return `weight: 1` otherwise.

`scripts/metrics-mcp.ts` is the demo implementation. It serves the generator warehouse with the MCP SDK and prints one audit line per call.

## How the client behaves

- **Parallel calls.** Each scoped `FactRequest` is one `query_facts` call, and a comparison or a dashboard fans out in parallel.
- **Short cache.** A request with the same scoped arguments within 30 seconds is answered once. The key ignores key order. A failed call is not cached.
- **Pooled clients.** Calls go through the connector pool (`lib/server/connectors/pool.ts`), one client per caller.
- **Parsed at the boundary.** Every result is parsed against the contract's zod schema. A result that does not match is an error, never data.
- **One typed error.** A timeout, an unreachable server, a refused call or a malformed result throws `MetricsUnavailable`. The semantic layer returns it as `{ ok: false, code: "CONNECTOR_UNAVAILABLE" }`. Chat cards and dashboard widgets draw it as **ข้อมูลไม่พร้อม** and never show zeros. The harness classifies the code as an unavailable source (`lib/harness/recovery.ts`), so a read may run once more before the model gets the failure.
- **Master data through an outage.** The dictionary keeps the last master data the source gave and tries again every 30 seconds. A cold start with the source down has no names to show, so pages that need names fail until the source answers.
- **Health.** The source reports under the Data Warehouse connector. With `WINYU_METRICS=mcp`, **/admin → Tools** shows it as an MCP connection with its online or offline status, and the overview lists it when it is offline.
