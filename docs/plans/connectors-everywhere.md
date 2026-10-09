# Every outside system through an admin-configured connector

In a real deployment almost every system Winyu reads is the customer's: the warehouse, the HRIS, the LMS, the EHS system, the company calendar, mail. Today the demo splits them three ways: ports configured by env (`WINYU_PORTS`, `WINYU_<SYSTEM>_MCP_URL`), code connectors (`lms_demo`, `crm_demo`) and console connectors. An IT admin can configure only the last kind. This plan makes the connection to every outside system an admin-configured connector, and keeps in code only what Winyu computes on top of the data.

## The split that holds

- **A capability** is a native tool: Winyu's own work on data (the semantic layer, people rules, leave arithmetic, anomaly detection). It stays code, reviewed in git and covered by the recorded eval.
- **A connection** is where a capability's data comes from: URL, auth, secret, health, a switch, a test as a person. It belongs to the admin.

A fixed card is not a reason to keep a tool native. A card is presentation that can be added for any tool whose rows have a known shape.

## Native tools, surveyed 2026-10-09

The surface has 27 native tools. Almost all of them reach every role, so a change to any tool's name, description or schema makes all 67 recordings stale. One full re-record costs about $0.36 at the median recorded cost, which is small. The kind of work a tool does matters more than its eval cost.

| Tool | Reads | Winyu's work on top | Kind |
|---|---|---|---|
| `query_metric` | metrics port, dictionary | semantic layer, scope filters injected into every query, masking, grants, small-cell suppression, month-end projection | engine |
| `explain_gap` | metrics port | the same scope as `query_metric` (grants not applied), gap breakdown | engine |
| `list_metrics` | metrics port | drops metrics the role cannot see, refresh labels | rules |
| `describe_entity` | metrics port (`describe_entity` passed straight through) | none, not even a scope filter | fetch |
| `get_calendar` | calendar port + metrics port | impact of past events on sell-out (joins two systems) | engine |
| `get_site` | sites port + directory port | safety status, lost-time-injury day count, people on site through `peopleViewOf` | rules |
| `find_people` | directory port, dictionary | `peopleViewOf` (team, hr and directory views hide different fields), derived flags, lead first, cap of 12, open positions | rules → engine |
| `get_person` | directory port | facts tiered by view, salary gate, certificate days left, risk for HR only | rules |
| `list_candidates` | recruiting + directory ports | manager-chain gate, salary gate, pipeline headline | rules |
| `list_courses` | learning + directory ports, Winyu requests | seats net of Winyu requests, certificate renewal relevance for me and my team | engine |
| `get_policy` | leave, directory and calendar ports, Winyu requests | entitlement by tenure, balance net of pending requests, working-day arithmetic, approver | engine |
| `request_leave` | as `get_policy` | validation, then **a packet in the approver's Winyu Inbox**; nothing reaches the leave system | engine |
| `enroll_course` | learning port, Winyu requests | validation, then **a Winyu Inbox packet** that holds a seat in Winyu's own count; nothing reaches the LMS | engine |
| `ask_logistics_partner` | partner agent over A2A | DC scope check before the call, fenced reply | fetch |
| `send_email`, `share_card` | mail port; Teams and LINE for shares | recipient checks, verify | external write |
| `get_alerts`, `get_forecast`, `recall_memory`, `search_documents`, `resolve_owner`, `create_handoff`, `pin_widget`, `watch_metric`, `set_permission`, `run_job` | Winyu's own stores | Winyu's own features | Winyu data |

Every outside system already sits behind one of six ports: metrics, directory, leave, recruiting and learning, sites, calendar, and mail. Each port except mail has an MCP contract: `METRICS_MCP_TOOLS`, `HRIS_MCP_TOOLS`, `LEARNING_MCP_TOOLS`, `SITES_MCP_TOOLS` and `CALENDAR_MCP_TOOLS`, all read-only. **The thing to make admin-configurable is therefore the port connection, not the tools.**

## What the survey turned up

1. **The anomaly, forecast and watch engines read the generator directly** (`runSeries` → `readGeneratorFacts` in `lib/data/query.ts:138`; called from `lib/engine/series.ts`, `forecast.ts` and `hypothesis.ts`). With a real warehouse connected, `query_metric` answers from the warehouse but alerts, forecasts and watches still compute on demo data. This must change before any real deployment.
2. **`describe_entity` passes the lookup straight to the metrics system with no scope filter.** It returns master data (agents, SKUs, DCs, campaigns, users), which may be fine for every role. That needs a decision, and in any case it should not depend on the warehouse filtering for us.
3. **The leave and course writes never reach the external system.** `LeavePort` and `LearningPort` are read-only. A request becomes a Winyu Inbox packet, and a seat is held in Winyu's own count. That is right for the demo. A deployment needs write tools in the HRIS and LMS contracts, using the phase 2 machinery (pins, guards, verify, idempotency) and the Inbox pull for pending decisions.
4. **Mail has no MCP contract and no delivery.** The only implementation writes the `outbox` collection.
5. **Connections are env-only.** URL, secret and the choice between generator and MCP live in `.env` and `WINYU_PORTS`, so a customer's IT cannot see, test or rotate them.

## Phases

### 1. Port connections in the admin console

The wizard gains a second kind of connector, **ต่อเข้า port** (connect a port), next to **เพิ่มเครื่องมือให้ model** (add a tool for the model, phases 1 and 2 of `connector-ui.md`).

- The admin picks which port the system serves: warehouse, HRIS (directory, leave, recruiting), LMS, EHS or calendar. Then they give the URL and auth with a sealed secret, through the same egress allowlist and the same `discoverConnector` step.
- **Contract check instead of declarations.** The listing must contain every contract tool, and each input schema must accept what Winyu sends. Winyu keeps the contract's hash beside the listing hash, and drift pauses the port the way it pauses a console tool.
- **Test as a person.** Call the contract's read tools as the chosen person and show counts, field names and parse errors per tool, never values. A row that fails the contract's zod output schema is reported by field.
- **Switch.** A port is either on its connector or on the demo generator. Turning a connector off falls back to the generator in dev and to "ข้อมูลไม่พร้อม" (data unavailable) in production. Health, last check and secret rotation are audited.
- Env stays as the developer default. A stored port connection overrides it. `WINYU_PORTS` keeps working for `make up` and tests.
- Native tools, `lib/access` and the eval do not change. The eval keeps generator ports.
- Reuse: `stored.ts`, `secrets.ts`, `egress.ts`, `pool.ts`, the connect step of the wizard, and `ports/index.ts` (`configuredPorts` reads stored connections before env).

### 2. Data paths that bypass the ports

- Route `runSeries` (anomaly, forecast, watches, hypotheses) through `ports().metrics`, so every engine reads the connected warehouse.
- Decide `describe_entity`: filter its answer in Winyu (an agent outside the caller's regions comes back out of scope), or declare master data open to every role in writing.
- Mail: a mail port contract (`send_mail`), with Microsoft Graph or SMTP behind a wrapper.

### 3. Writes into the systems of record

- Add `submit_leave_request`, `get_leave_request` and `decide_leave_request` to the HRIS contract, and `enroll` with `get_enrollment` to the LMS contract. These are write tools with the phase 2 pins, guards, verify and idempotency.
- `request_leave` and `enroll_course` then write through the port. The Inbox shows pending decisions by pull from the HRIS (`connector-ui.md`, worked examples).
- This changes tool behaviour and probably descriptions: all 67 recordings go stale, about $0.36 to re-record.

### 4. Thin tools and code connectors

- `crm_demo` becomes a console connector: `region_rows` on `region` plus `inject_regions`. Its `visitsOutput` adapter goes away (the wrapper returns flat rows with `as_of`).
- `lms_demo` (training history) either joins the learning contract, if training history is a core capability, or becomes a console connector.
- `describe_entity` and `ask_logistics_partner` are candidates for console connectors once phase 2 has settled `describe_entity`'s scope.
- After this phase, "code connector" is no longer a category.

## Engine: connectors do not go through Mastra

Remote MCP servers are reached with `@ai-sdk/mcp` (`lib/server/connectors/mcp-client.ts`) in Winyu's own connector layer. Each remote tool becomes a `WinyuTool` whose only execute is the gateway (scope, pins, guards, masking, fence, audit, verify). The Mastra adapter (`lib/harness/adapters/mastra/tools.ts`) then wraps it as a Mastra tool, the same as a native tool. `@mastra/mcp` is used only in the other direction: Winyu's own MCP server at `/api/mcp` (`adapters/mastra/mcp.ts`). Keep it this way:

- Mastra's MCP client would hand the agent the remote tools directly, which bypasses the gateway.
- `lib/harness/boundary.test.ts` allows `@mastra/*` only in the adapter.
- The AI SDK jobs use the same `WinyuTool`s.

## Open decisions

1. In production, does a port with no connector fall back to the demo generator, or report "ข้อมูลไม่พร้อม"? The recommendation is "ข้อมูลไม่พร้อม", with the generator in dev only.
2. Is master data from `describe_entity` open to every role?
3. Is training history a core capability (a learning contract tool) or an add-on (a console connector)?
4. Order: phase 1 first (no eval cost, no model cost), then phase 2, which is needed before any real deployment, then phase 3 when a real HRIS is chosen.
