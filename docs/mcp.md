# MCP server

mascop serves its governed tools to MCP clients (Claude Code, Claude Desktop, Copilot, other agents) at `/api/mcp`. Each client acts as one mascop user, chosen by the token it presents. No model runs on the mascop side: the client's own model calls the tools.

## What a client gets

- **The person's own tools.** The list is `toolsFor(access)` for the token's user, after role policy, admin role overrides and kill switches. A tool the person cannot use is neither listed nor callable.
- **Read tools only.** `MCP_TOOL_TIERS` in `lib/server/mcp.ts` is the one switch. Write and destructive tools wait for the person's approval in the chat, and an MCP client has no approval prompt, so they are not exposed. Adding `"write"` to the switch would let those tools run with no one approving them. The gateway would still apply policy, admin rules, verification and audit.
- **The same gateway as the chat.** Every call runs inside `runWithAccess`, `runWithTurn` and `runWithRun` as that user, so scope filters, masking, CEL deny rules, the tool budget, `redact` and the audit apply unchanged. The audit row has `initiator: "mcp"`, and each call is a saved run whose trace opens with "ผู้ใช้เรียกผ่าน MCP". An admin rule can target the channel, for example `initiator == "mcp" && tool.name == "query_metric"`.
- **Compact JSON.** A result is the JSON the chat cards draw from, wrapped in the same data fence as other untrusted text (`fenceAsData`) and capped at 24,000 characters. A refusal comes back as `{ "ok": false, "code": ..., "error": ... }`.

## Tokens

An IT admin issues and revokes tokens on **/admin → MCP**. The plain token shows once, beside the endpoint and a ready Claude Code command. `.data/mcp-tokens.json` keeps only its SHA-256 hash and last four characters. A missing, unknown or revoked token gets HTTP 401 with `WWW-Authenticate: Bearer`.

The bearer token is checked at the route, not through OAuth. Mastra's `createOAuthMiddleware` fits an external authorization server. These tokens are opaque per-user credentials that mascop issues itself, so the route maps the token to the user and the gateway enforces the rest.

## Protocol versions

`lib/harness/adapters/mastra/mcp.ts` builds a Mastra `MCPServer` per request with the caller's tools. A client that speaks MCP 2026-07-28 goes through Mastra's own Streamable HTTP transport. Mastra rejects 2025-era clients, and most SDK clients still connect that way by default, so a stateless shim serves them from the same Mastra server (`getToolListInfo`, `executeTool`). Both paths return the same tools and rows.

## Connect from Claude

1. An IT admin opens **/admin → MCP**, picks the user and presses **Issue token**, then copies the token.
2. Add the server.

   **Claude Code**

   ```bash
   claude mcp add --transport http mascop http://localhost:3200/api/mcp --header "Authorization: Bearer mcp_..."
   ```

   **Claude Desktop** (Settings → Developer → Edit Config, `claude_desktop_config.json`)

   ```json
   {
     "mcpServers": {
       "mascop": {
         "command": "npx",
         "args": ["-y", "mcp-remote", "http://localhost:3200/api/mcp", "--header", "Authorization: Bearer mcp_..."]
       }
     }
   }
   ```

3. Ask, for example, "ยอดขายเข้าแยกตามภาคไตรมาสนี้". The answer holds only the rows that person may see.

Replace `localhost:3200` with the deployed host. To check a token without a model, run `bun run mcp:probe mcp_... --url=http://localhost:3200/api/mcp`. Add `--legacy` to connect the way a 2025-era client does.
