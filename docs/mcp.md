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
- **Demo servers.** `bun run connectors:demo` serves the demo systems the connectors call, from one process: the LMS's training history on `:3299/mcp` and the CRM on `:3298/mcp` (both code connectors), and an asset register on `:3290/mcp` (`scripts/mcp-demo-assets.ts`) whose `request_asset` and `return_asset` are write tools for trying phase 2 of the admin console (connect it at `/admin/connect` with the secret `winyu-assets-demo-local-only`). `scripts/mcp-demo-server.ts` handles the JSON-RPC and the signature check for all of them. Each URL variable (`WINYU_LMS_DEMO_URL`, `WINYU_CRM_DEMO_URL`, `WINYU_ASSETS_MCP_URL`) moves a server and the URL Winyu calls together, because the demo listens on the port in that URL.

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

# Systems of record behind ports

Winyu holds none of the business data it shows. Every system of record sits behind a port in `lib/server/ports/` (`metrics`, `directory`, `recruiting`, `learning`, `leave`, `sites`, `calendar`, `mail`), and the native tools only call the port. A deployment fills each port with an adapter for the customer's system: SQL to the warehouse, the HRIS's API, the LMS's API, and so on. The demo fills every port with the generator (`lib/server/ports/generator.ts`), which plays those systems with deterministic data, including the leave system's requests (`generator-leave.ts`) and the LMS's enrollments (`generator-learning.ts`). Tests swap a port with `registerPorts`.

An adapter that cannot reach its system throws `PortUnavailable` (`lib/server/ports/unavailable.ts`). The gateway turns it into `{ ok: false, code: "CONNECTOR_UNAVAILABLE" }` with a **ข้อมูลไม่พร้อม** message that names the system, a write files nothing, and a feed section whose system does not answer shows one **ข้อมูลไม่พร้อม** item instead of an empty list.
