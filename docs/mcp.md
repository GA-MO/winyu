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

- **Declare the connector.** Write it with `defineMcpConnector` in `lib/server/connectors/` and add it to `CODE_CONNECTORS` in `code.ts`, or let an IT admin add it from the console (next section). Only the tools that the config names reach the model. Each tool declares its tier, roles, scope (`inject` arguments, `filter` rows, or `none` with a reason) and sensitive fields. It can also declare its own description, input schema and output adapter.
- **One pipeline.** Every call passes the gateway as the person asking. The MCP client sends that person's identity in headers that `signed-identity.ts` signs. Winyu injects scope arguments on the way in. On the way out, it filters, masks, caps at 60 rows and fences every string. A server that does not answer within `timeoutMs` reads as `CONNECTOR_UNAVAILABLE`.
- **Drift.** At boot `reconcileConnectors` compares each server's tool list with the config, and a probe every five minutes keeps the admin's Online/Offline pill current.
- **Demo servers.** `bun run connectors:demo` serves every demo system over MCP from one process: the LMS on `:3299/mcp`, the CRM on `:3298/mcp`, the HRIS on `:3293/mcp`, the safety (EHS) system on `:3292/mcp` and the company calendar on `:3291/mcp`. `scripts/mcp-demo-server.ts` handles the JSON-RPC and the signature check for all of them. Each URL variable (`WINYU_LMS_DEMO_URL`, `WINYU_CRM_DEMO_URL`, `WINYU_HRIS_MCP_URL`, `WINYU_EHS_MCP_URL`, `WINYU_CALENDAR_MCP_URL`) moves a server and the URL Winyu calls together, because the demo listens on the port in that URL. Each server also runs alone with `bun run scripts/mcp-demo-<system>.ts`.

## Connecting a system from the admin console

An IT admin adds an MCP server from **/admin → เครื่องมือ → เชื่อมต่อระบบใหม่** (`/admin/connect`), without code. The design is in [`plans/connector-ui.md`](plans/connector-ui.md). Phase 1 opens read tools only.

The stored connector is data (`lib/connectors/spec.ts`, parsed with zod at every read and write). `compileStored` in `lib/server/connectors/stored.ts` turns it into the same `McpConnector` that `defineMcpConnector` builds. Every assert, the gateway, the scope pipeline, masking, fencing, the audit and the kill switches therefore apply to console connectors as they do to code connectors. `remoteConnectors()` returns the code connectors and the live console ones, compiled once per store version.

The wizard has five steps:

1. **Connect.** The admin enters a name, an id, the MCP URL, the authentication (Winyu's signed identity or a bearer token) and the secret. Winyu lists the server's tools and stores a draft. Changing the URL or the authentication requires the secret again, so a stored secret never goes to a new host.
2. **Tools.** The admin picks tools. A remote description is shown as data: invisible characters are spelled out and instruction blocks are struck through. The model reads only the text the admin approves, through `fence()`, capped at 1,200 characters. Input property descriptions are removed from the schema. A tool the server marks as writing shows **ระยะที่ 2** and cannot be included. A tool that duplicates a native tool name, a tool a port reads from the same server, or a tool a code connector opens there is refused (`reserved.ts`).
3. **Roles.** The admin ticks roles one by one. There is no default.
4. **Scope.** Every tool needs a preset (`presets.ts`): `own_rows`, `people_line`, `region_rows` or `brand_rows` as the filter, with optional `inject_regions` or `inject_identity`, or no limit with a reason of at least 10 characters. An inject-only scope cannot be stored. A row without the filter field never reaches a scoped caller. Sensitive fields are hidden from every role until the admin widens them per role, and `ownerField` shows a field in full on the caller's own row. Field names come from a sample read as a chosen person, and only the names leave the server.
5. **Review.** The admin tests each tool as chosen people. The test returns counts and field names only: rows received, rows kept, rows without the filter field, and the fields that role would not see in full. **เปิดใช้** turns the connector on when every tool is tested at its current configuration.

A connector's state is derived from the record, its switch and the server's last listing:

| State | Means |
|---|---|
| Draft | A tool is untested, or its test is from an older configuration. |
| Ready | Every tool is tested. |
| Live | Activated and switched on. Its tested tools reach the roles chosen. |
| Disabled | The `connector:<id>` switch is off. |
| Changed upstream | The server changed a tool's description, schema or hints, or dropped it. That tool leaves the surface and the others stay. Saving the tool again approves the change, and it needs a new test. A tool that returns to what was approved comes back by itself. |

An edit to a tool voids its test through a hash of everything that changes its behaviour (`configHash`), so that tool leaves the surface until it is tested again. The probe every five minutes, the boot reconcile and **ตรวจระบบปลายทาง** in the tools tab list each live console connector's tools again.

Every console step is an audit row (`connector_admin`): created, tools saved, field names sampled, tested, activated, switched, upstream checked, and refusals. Only `it_admin` can run the server actions. Each action parses its input with zod and checks the role again.

### Server settings

| Env | Effect |
|---|---|
| `WINYU_CONNECTOR_KEY` | 32 bytes as base64 or hex (`openssl rand -base64 32`). Secrets are sealed with AES-256-GCM under it in `.data/connector-secrets.json`. Without a valid key the console is read-only and no secret is stored. Changing the key leaves existing console connectors off until their secrets are entered again. |
| `WINYU_CONNECTOR_HOSTS` | Comma-separated hosts Winyu may connect to: names, `name:port`, IP addresses or CIDR ranges. Unset allows nothing. The console shows the list read-only. |

Every request of a console connector goes through `egressFetch` (`egress.ts`). It accepts http and https only, refuses credentials in the URL and any host off the list, and refuses redirects. It resolves the name and refuses cloud metadata and link-local addresses even when listed, and refuses a private address unless that address or its range is on the list. Replies are capped at 2 MB. The address is checked on every request but not pinned for the connection, so a name that changes its address between the check and the connect is not caught. List internal systems by IP or CIDR, not only by name.

### Eval recordings

`bun run eval` runs on a fresh data folder, so console connectors are never part of an eval and `--stale` does not count them. The review step says how many recorded cases belong to the roles a connector reaches and how many prompt tokens it adds per question.

# Systems of record over MCP

The sections above cover Winyu as an MCP server and its connector tools. Winyu is also an MCP client for every system of record behind its ports (`lib/server/ports/`). Each port becomes a client of that system's MCP server, and the model-facing tools above it keep their names, descriptions and schemas. Eval recordings therefore do not go stale when a port moves.

## Which system serves which port

| Port | System and demo server | Default URL | Contract tools | Cache | Admin connector |
| --- | --- | --- | --- | --- | --- |
| `metrics` | The data team's warehouse, `scripts/metrics-mcp.ts` | `:3297` | `query_facts`, `master_data`, `list_metrics`, `describe_entity` | 30 s | Data Warehouse |
| `learning` | The LMS, `scripts/mcp-demo-lms.ts`, beside its `training_history` connector tool | `:3299` | `list_courses` | 1 min | LMS |
| `directory` | The HRIS, `scripts/mcp-demo-hris.ts` | `:3293` | `load_directory` | 5 min | HRIS |
| `leave` | The HRIS leave module | `:3293` | `leave_policy`, `leave_used_this_year` | 1 min | Leave |
| `recruiting` | The HRIS recruiting module | `:3293` | `list_candidates` | 1 min | HRIS |
| `sites` | The safety (EHS) system, `scripts/mcp-demo-ehs.ts` | `:3292` | `load_sites` | 1 min | Sites |
| `calendar` | The company calendar, `scripts/mcp-demo-calendar.ts` | `:3291` | `load_calendar` | 30 min | Calendar |
| `mail` | Stays in-process: the outbox is Winyu's own record of what it sent | | | | |

Recruiting sits on the HRIS server because the admin already shows HRIS and recruiting as one connector, and `list_candidates` needs the directory to decide who sees which opening. Each contract is a zod module that the demo server and Winyu's client share: `metrics-mcp-contract.ts`, `learning-mcp-contract.ts`, `hris-mcp-contract.ts`, `sites-mcp-contract.ts` and `calendar-mcp-contract.ts`.

## Select the source

| Env | Effect |
| --- | --- |
| `WINYU_PORTS` unset, empty or `generator` | The in-process generator answers every port (`lib/server/ports/generator.ts`). `bun test` and `bun run eval` always delete `WINYU_PORTS`. |
| `WINYU_PORTS=mcp` | Every port except `mail` reads over MCP. |
| `WINYU_PORTS=metrics,directory` | Only the named ports read over MCP. Names that are not ports are ignored. |
| `WINYU_<SYSTEM>_MCP_URL` | The server's endpoint, for `METRICS`, `HRIS`, `EHS` and `CALENDAR`. The LMS keeps `WINYU_LMS_DEMO_URL`, shared with its connector. |
| `WINYU_<SYSTEM>_MCP_SECRET` | The secret both sides sign identities with. The LMS keeps `WINYU_LMS_DEMO_SECRET`. The defaults are for the local demo only. |
| `WINYU_<SYSTEM>_MCP_TIMEOUT_MS` | How long one call may take, connect included. `WINYU_LMS_MCP_TIMEOUT_MS` for the LMS. Default 4000. |

`make up` starts `bun run connectors:demo` and `bun run metrics:mcp`, then runs dev with `WINYU_PORTS=mcp`. Run `make up PORTS=generator` to keep every port in-process, or pass a list such as `make up PORTS=metrics,calendar`. `make stop` and `make status` include :3291, :3292, :3293, :3297, :3298 and :3299. To run the metrics server alone on another port, set `WINYU_METRICS_MCP_PORT`.

## What every server must do

- Accept only requests that carry Winyu's signed identity headers (`x-winyu-user`, `x-winyu-role`, `x-winyu-regions`, `x-winyu-signature`, HMAC-SHA256 as in `lib/server/connectors/signed-identity.ts`). Refuse any other request with HTTP 401.
- Offer one tool per port method. Arguments are plain JSON. Each result is a JSON object in `structuredContent`, or the same JSON as the first text content.
- Refuse arguments that do not parse as a tool error (`isError`), never as an empty result.
- Log the caller for its own audit. A chat tool call signs as the person asking. Dashboard and background reads sign as `winyu`.

## How the client behaves

`mcpPortClient` in `lib/server/ports/mcp-port.ts` is the one client every port uses.

- **Short cache.** A call with the same arguments within the port's cache window is answered once. The key ignores key order. A failed call is not cached, and an expired entry is never served.
- **Pooled clients.** Calls go through the connector pool (`lib/server/connectors/pool.ts`), one client per caller.
- **Parsed at the boundary.** Every result is parsed against the contract's zod schema. A result that does not match is an error, never data, so a directory missing a field is never read as a smaller directory.
- **One typed error.** A timeout, an unreachable server, a refused call or a malformed result throws `PortUnavailable`, which names the port and the reason.
- **Tools.** The gateway turns `PortUnavailable` from any tool into `{ ok: false, code: "CONNECTOR_UNAVAILABLE" }` with a **ข้อมูลไม่พร้อม** message that names the system and tells the model not to guess. The harness classifies the code as an unavailable source (`lib/harness/recovery.ts`), so a read may run once more before the model gets the failure. A change such as `request_leave` or `enroll_course` files nothing.
- **Pages.** A feed section whose system does not answer shows one item, labelled with the system, that says **ข้อมูลไม่พร้อม**. Team stories, which need the directory, are left untold. The landing, the inbox and the dashboard still render.
- **The directory fails closed.** Nothing in `lib/access` loads the directory: `peopleViewOf` and `canSeeCandidates` take a loaded `Directory` from their caller. When the HRIS does not answer, the load throws and the call stops there, with no fallback to an empty or stale directory. People, candidate, site and training-history tools refuse for every user, and no feed carries a people matter. `lib/server/ports/hris-mcp.test.ts` checks this for all 26 users.
- **Health.** Each port reports under its admin connector. With a port on MCP, **/admin → Tools** shows that connector as an MCP connection with its online or offline status, and the overview lists it when it is offline. The HRIS server reports as both HRIS and Leave.

# Metrics from the data team's MCP

The data team serves the warehouse over MCP, and Winyu reads facts and dimension tables from it.

## What stays in Winyu

The semantic layer stays in Winyu: `lib/server/metrics.ts` and `lib/semantic/`. Winyu plans every question, injects the caller's scope into the filters, formats the numbers, adds certified, source and as-of, and applies the small-cell and masking rules. The data team's server never sees a question or a caller's access. It answers requests that Winyu has already scoped, so it never decides scope.

The model-facing tools `query_metric`, `list_metrics` and `describe_entity` stay native.

## The contract the data team's server provides

`lib/server/ports/metrics-mcp-contract.ts` holds the contract as zod schemas. There is one tool per `MetricsPort` method. Arguments are plain JSON. Each result is a JSON object in `structuredContent`, or the same JSON as the first text content.

| Tool | Arguments | Result |
| --- | --- | --- |
| `query_facts` | One `FactRequest`: `metric`, `measure` (`actual` or `target`), `dims`, `filters`, `range`, `labelShift` | One `FactResult`: `{ ok: true, rows: [{ dims, value, weight }] }` or `{ ok: false, code: "BAD_QUERY", error }` |
| `master_data` | `{}` | `MasterData`: regions, business units, provinces, agents, brands, packs, SKUs, DCs, plants, campaigns, departments, channels, chains, makers, `ownMaker` |
| `list_metrics` | `{ search: string \| null }` | `{ metrics: MetricDef[] }` |
| `describe_entity` | `{ kind, query }` | `{ ok: true, data, summary }` or `{ ok: false, error }` |

Beyond what every server must do, the warehouse returns a group's `value` summed, and for ratio metrics its denominator in `weight`. It returns `weight: 1` otherwise.

`scripts/metrics-mcp.ts` is the demo implementation. It serves the generator warehouse with the MCP SDK and prints one audit line per call.

## Metrics-specific client behaviour

- **Parallel calls.** Each scoped `FactRequest` is one `query_facts` call, and a comparison or a dashboard fans out in parallel.
- **Cards.** The semantic layer returns `PortUnavailable` as `{ ok: false, code: "CONNECTOR_UNAVAILABLE" }`. Chat cards and dashboard widgets draw it as **ข้อมูลไม่พร้อม** and never show zeros.
- **Master data through an outage.** The dictionary keeps the last master data the source gave and tries again every 30 seconds. A cold start with the source down has no names to show, so pages that need names fail until the source answers.
