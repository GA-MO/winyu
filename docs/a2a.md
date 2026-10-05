# A2A (agent to agent)

mascop speaks the [A2A protocol](https://a2a-protocol.org/) v0.3 in both directions. Another team's agent (a finance agent, an HR agent, a vendor's agent) can ask mascop's agent a question. mascop's agent can ask an outside agent a question through a tool. Both directions go through the harness gateway, so role policy, data scope, masking, admin rules, kill switches and the audit apply as they do in the chat.

## Ask mascop from another agent

### What a caller gets

- **One person's view.** Every A2A token is issued in the name of one mascop user. The question runs as that user: the same role policy, regions, brands, masked fields and admin rules as their chat. A CEO token sees every region. A token for `u_krit` (sales rep, northeast) sees ภาคอีสาน only.
- **Read tools only.** `A2A_TOOL_TIERS` in `lib/server/a2a.ts` is the one switch. Write tools (handoff, email, pin, leave, permissions) wait for the person's approval in the chat, and an A2A caller has no one to approve. The agent gets no write tool, so a task never stops at `input-required`. Widening the switch would let writes run with no one approving them.
- **Text plus the rows.** A finished task has two artifacts. `response.txt` holds the answer in Thai plain text (no cards). `tool-data.json` holds a data part `{ tools: [{ tool, args, result }] }` with every tool result the answer rests on, in the same compact rows the chat cards draw from.
- **One question per message.** mascop's A2A agent keeps no conversation memory. Send the whole question each time.

### Endpoints

| What | Where | Auth |
|---|---|---|
| Agent card | `GET /.well-known/agent-card.json` | none |
| JSON-RPC | `POST /api/a2a` | `Authorization: Bearer a2a_...` |

The card declares a bearer security scheme and `capabilities.streaming: false`. The endpoint serves `message/send`, `tasks/get` and `tasks/cancel`. `message/stream` and `tasks/resubscribe` return `-32004` (unsupported). A request with `A2A-Version: 1.0` returns `-32009`. A missing, unknown, revoked or MCP token returns HTTP 401 with `WWW-Authenticate: Bearer`.

### Connect

1. An IT admin opens **/admin → MCP · A2A**, picks the user, sets **Channel** to **A2A · agent ของทีมอื่น**, types the calling agent's name (for example "Finance agent (ทีมการเงิน)") and presses **Issue token**.
2. The page shows the agent card URL, the token and a ready `curl` call once. Copy the token now. The store keeps only its SHA-256 hash.
3. Point the other agent at the card. With Mastra:

   ```typescript
   import { A2AAgent } from "@mastra/core/a2a";

   const mascop = new A2AAgent({
     url: "https://mascop.example.com/.well-known/agent-card.json",
     headers: { Authorization: `Bearer ${process.env.MASCOP_A2A_TOKEN}` },
   });
   const result = await mascop.generate("ยอดขายเข้าแยกตามภาคไตรมาสนี้");
   ```

   Any A2A v0.3 client works the same way. To check a token without writing code, run `bun run a2a:probe a2a_... "ยอดขายเข้าแยกตามภาคไตรมาสนี้" --card=http://localhost:3200/.well-known/agent-card.json`. One probe is one question to the real model (about $0.008).

### Security model

- **The token is the identity.** IT issues it on `/admin`. It maps to a mascop user, and permission comes from that user's role, never from the caller. A service that needs a narrower view gets a token in the name of a user whose role has that view. The calling agent's name is recorded with the token and shown in the audit, but it grants nothing.
- **Channels do not mix.** A token starts with `a2a_` or `mcp_` and is refused on the other endpoint (`holderOfToken` in `lib/server/access-tokens.ts`).
- **What the caller sends is input, not instructions.** Only text parts reach the model. Personal data in them (Thai national IDs, phones, personal emails, bank accounts) is masked before the model, the audit or the trace sees it, exactly like a person's typed message. An instruction aimed at the model is recorded as a guard finding and passed on, because permission is enforced in code.
- **Tasks are per person.** Each user's tasks live in their own task store, so `tasks/get` with another person's task id returns task-not-found.
- **Everything is audited.** Each question is one harness run with `initiator: "a2a"`. Its audit rows carry the question and the token's user, the admin audit tab marks them **ผ่าน A2A**, and the run trace opens with "<agent> ถามผ่าน A2A ในนามผู้ใช้". An admin rule can target the channel, for example `initiator == "a2a" && tool.name == "query_metric"`.
- **Revoke at any time.** **Revoke** on `/admin → MCP · A2A` refuses the token's next request.

Task records live in process memory (Mastra's `InMemoryTaskStore`), so `tasks/get` works only until the server restarts. Nothing waits on a task, because a task always finishes in the `message/send` that started it.

## Ask an outside agent from mascop

`ask_logistics_partner` (`lib/server/tools/ask-logistics-partner.ts`) asks Siam Freight's logistics agent, a fictional outside company, which trucks are heading to one distribution centre and when they arrive. It is a native read tool on the `logistics` connector, defined with `defineTool`, so the gateway authorizes, times out, audits and traces every call.

- **Scope before the call.** The tool takes a DC id. A DC outside the person's regions is refused with `PERMISSION_DENIED` before anything leaves mascop.
- **Only the DC name leaves.** The outbound message is `ETA to DC Lamphun`. No question text, user name or business data is sent.
- **The answer is untrusted data.** The partner's text comes back wrapped by `fenceAsData`. Every string in its rows passes through `fence`, which strips hidden characters and neutralizes role markup and fake fence markers. The chat's `ToolResultInjectionGuard` then cuts any sentence that tries to instruct the model.
- **Failures stay quiet.** A partner that is down, slow (8 s) or refuses mascop's token comes back as `UNAVAILABLE`, which the model reports instead of retrying.

The result has the connector shape (`summary`, `rows`, `provenance`), so the chat draws it with the connector card.

### Run the demo

```bash
bun run a2a:demo        # Siam Freight's agent on http://127.0.0.1:3297 (model-free, scripted shipments)
bun run dev             # then, as u_wee (supply planner): "รถที่กำลังไปศูนย์กระจายสินค้าลำพูนจะถึงเมื่อไหร่"
```

`MASCOP_A2A_PARTNER_URL` (the partner's card URL) and `MASCOP_A2A_PARTNER_TOKEN` (the bearer token mascop presents) override the local defaults in `lib/server/connectors/logistics-partner-config.ts`.

### Add another outside agent

1. Put its card URL and credential in a config module that reads env, like `logistics-partner-config.ts`. Credentials never reach the client.
2. Write a native tool with `defineTool`: a narrow input (an id, not free text), a scope check against `AccessContext` before the call, `askRemoteAgent` from `lib/harness/adapters/mastra/a2a-client.ts` for the call, and fenced output in the connector shape.
3. Add the tool name to `NativeToolName`, its connector to `NATIVE_CONNECTORS`, its Thai label in `TH.admin.tools` and `TH.admin.connectors`, and register it in `lib/server/tools/registry.ts` and `components/cards/registry.tsx`.
4. Pick the roles that may call it. Admins can still switch the tool or its connector off on `/admin`.

Only `lib/harness/adapters/mastra/` imports `@mastra/*` (`a2a.ts` serves, `a2a-client.ts` calls), so the rest of mascop stays engine-neutral.
