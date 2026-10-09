# Reaching every outside system over MCP

The user's principle is "ทำเป็น MCP มากที่สุดเท่าที่จะเป็นไปได้": every system outside Winyu is reached over MCP. This plan sorts today's integrations into what moves, what stays, and what needs a decision, and gives the order and the cost of each move. It is a plan only. Nothing here is migrated yet.

## MCP can sit at two seams, and the cheaper one changes no tool

Winyu already has a seam for this. `lib/server/ports/index.ts` defines one port per system of record (`metrics`, `directory`, `recruiting`, `learning`, `leave`, `sites`, `calendar`, `mail`), and `GENERATOR_PORTS` answers all of them from the demo generator. `registerPorts` swaps one without touching the logic above it. An outside system can come in over MCP at either of two places:

- **Behind a port.** An MCP client implements the port's interface: `LeavePort.usedThisYear` becomes a call to the HRIS wrapper's tool. The native tools above it (`get_policy`, `request_leave`), their names, descriptions, fixed cards, scope code and `verify` stay exactly as they are. Ports take requests Winyu has already scoped and return records Winyu scopes again, so the client calls as Winyu itself (`signedIdentityHeaders(null, …)`).
- **As connector tools.** The remote server's tools become model-facing tools (`hris_leave__list_leave_requests`) with presets for scope, as in [`connector-ui.md`](connector-ui.md). This is the right seam for a system Winyu has no native tool for, and the wrong one for a system a native tool already serves well.

The difference in cost is large and measurable. `toolsHash` in `lib/eval/fingerprint.ts` hashes each person's whole tool list. Any change to a tool name or description makes every recording of every persona who sees that tool stale. Most native tools reach every persona in the eval set. The table below comes from running each connector's tools against the recordings' personas: renaming or redescribing the tools of any one native connector stales all 67 recordings, except `mail` (58) and the A2A `logistics` tool (47). The median recorded cost is $0.0054 a case and the total for all 67 is $0.45, so one full re-record costs about $0.36 at the median. A move behind a port changes no tool and stales nothing.

The rule this plan follows: **put MCP behind the port for every system a native tool already serves, and use connector tools for new systems.** That is MCP everywhere at the transport, at no eval cost, and it keeps the domain logic that makes Winyu's answers safe (scope injection, masking, compact rows with labels, `verify`) in one place.

## Inventory of today's integrations

The classes are (a) an outside system's data, which moves to MCP, (b) Winyu's own data, which stays native, and (c) unclear, with what decides it.

| Integration | Today | Class | Where MCP goes | Eval cost of the move |
|---|---|---|---|---|
| `metrics` port: `readFacts`, `masterData`, `listMetrics`, `describeEntity` | generator facts | (a) data warehouse | behind the port, a data-team MCP server | none |
| `query_metric`, `list_metrics`, `describe_entity` | native over `metrics` | (b) the semantic layer | stays native | none |
| `get_alerts`, `get_forecast`, `explain_gap` | Winyu's own jobs over `metrics` | (b) | stays native | none |
| `directory` port: employees, open positions | generator | (a) HRIS | behind the port, an HRIS wrapper | none |
| `find_people`, `get_person` | native over `directory` | (b) people scope and salary masking are Winyu's | stay native | none |
| `recruiting` port, `list_candidates` | generator | (a) ATS | behind the port | none |
| `learning` port, `list_courses`, `enroll_course` | generator, enrolment into Winyu's Inbox | (a) LMS | behind the port; the port gains `enroll` | none for reads; `enroll_course` changes only if its behaviour or description changes |
| `lms_demo__training_history` | MCP connector | (a) | already MCP | |
| `leave` port, `get_policy`, `request_leave` | generator, requests into Winyu's Inbox | (a) HRIS leave | behind the port first; connector tools only for what the native tools cannot express | none behind the port; all 67 if the tools are replaced |
| `sites` port, `get_site` | generator | (a) safety (EHS) system | behind the port | none |
| `calendar` port, `get_calendar` | generator: holidays, alcohol ban days, festivals | (c) | behind the port if HR or the legal team keeps it in a system; native if IT keeps a yearly table in Winyu | none |
| `mail` port, `send_email` | the in-app outbox | (b) the outbox is Winyu's record of what it sent | stays native; delivery uses SMTP or Microsoft Graph, where MCP adds nothing | none |
| `search_documents` | Winyu's own index (`docs/rag.md`) | (c) | the index and the search stay Winyu's; ingestion may read SharePoint or a DMS through an MCP wrapper | none |
| `crm_demo__store_visits` | REST connector | (a) | becoming "CRM (MCP)" in a separate change | that change's own |
| `ask_logistics_partner` | A2A to Siam Freight's agent | (a), but another company's agent | stays A2A: MCP is for tools, A2A is for agents | |
| `create_handoff`, `share_card`, `pin_widget`, `watch_metric`, `recall_memory`, `resolve_owner`, `run_job`, `set_permission`; memory, handoff packets, shares, grants, dashboard, watches, audit | Winyu | (b) | stay native | |

Behind a port, two things need care. First, bulk loads: `directory.load()` returns every employee, and a wrapper must offer one tool that returns the whole directory, with a cache in the port adapter (a few minutes), not one call per person. Second, latency: a native tool that used to read memory now waits on a network call, so every port adapter gets a timeout and a clear "ข้อมูลไม่พร้อม" refusal.

## Metrics stay a semantic layer in Winyu, with the warehouse behind MCP

The data team will offer MCP whatever Winyu decides, so `MetricsPort` becomes an MCP client to the data team's server. The semantic layer stays in Winyu. `runMetric` in `lib/server/metrics.ts` injects the caller's scope into every request, formats values and labels, decides masking, and attaches `Provenance` (certified, source system, as-of, filters and scope applied). It is the permission boundary for every number, and two callers use it: the dashboard, server-side with no model, and `query_metric`. Moving it out would put the boundary in another team's code.

**The contract Winyu needs from the data team's MCP server.** It is the port's interface at the semantic level, not SQL. Comparisons and grain are Winyu's job: `runMetric` already turns `compare: "prev_year"` into a second `FactRequest` with a `labelShift`.

- `read_facts({ requests: FactRequest[] })` returns `FactResult[]` in the same order, each with `as_of` and `source_system`. A `FactRequest` is `{ metric, measure, dims, filters, range, labelShift }`, with `filters` already holding the caller's scope. A bad request is `{ ok: false, code: "BAD_QUERY", error }`, as today.
- `master_data()` returns the dimension tables Winyu labels with: regions, business units, provinces, agents, brands, packs, SKUs and DCs. Winyu caches it for 15 minutes.
- `list_metrics({ search })` returns the metrics the warehouse can compute with `certified`, `owner`, `source_system` and the dimensions each supports.
- `describe_entity({ kind, query })` resolves a name to an agent, SKU, DC, campaign or user.

The request carries no caller identity for filtering, because Winyu sends requests already scoped. It carries Winyu's signed identity so the data team's audit sees who calls. If the data team wants to know which person asked, the adapter can add the person's id from the request context as an audit-only header, never used to filter. That is a choice for the data team (open decision 3).

**Why `query_metric`, `list_metrics` and `describe_entity` stay native and unchanged.** Their names, descriptions and input schemas are what the model reads and what `toolsHash` covers. The swap happens below them, so no eval recording goes stale. The recordings also stay valid as evidence, because the model's choices depend on the tool surface, not on which server answered.

**Performance for the dashboard.** A dashboard opens with many cards and each card can need two or three fact requests.

- One batch call per page: `readFacts` already takes an array. The adapter collects a render's requests and sends one `read_facts` call.
- A short cache keyed by the scoped request (the `FactRequest` itself, which already includes the scope), 60 seconds by default, shared by everyone with the same scope. Two RSMs of the same region hit one entry. Two regions never share one.
- A timeout per call (the connector `timeoutMs` plus `LIMITS.toolTimeoutMs`). When the server is down, every card shows "ข้อมูลไม่พร้อม" with the time of the last good answer, and the health pill on `/admin` turns Offline through the existing `markReachable`.
- A latency budget to agree with the data team: for example a batch of 20 requests under 1.5 seconds at the 95th percentile.

**The demo.** `scripts/connectors-demo.ts` gains a third server, a warehouse MCP on its own port that serves `read_facts`, `master_data`, `list_metrics` and `describe_entity` from the generator (`readGeneratorFacts`, `GENERATOR_MASTER`). A `WINYU_METRICS=mcp` setting registers the MCP port adapter with `registerPorts({ metrics })`. The same `lib/server/metrics.test.ts` cases then run against both the generator and the MCP adapter and must return the same rows.

**What the data team must guarantee.**

- Filters are applied exactly as sent, with nothing widened or dropped. Winyu also filters rows after the call on any dimension that appears in them, as a second wall.
- Small-cell rules are the data team's to state. If they suppress cells below a count, Winyu shows the suppression as masked, not as zero.
- `as_of` per result, and `certified` per metric, are true and current.
- The latency budget and an error shape that separates "bad request" from "unavailable".
- A change to a metric's definition or dimensions is announced, because it changes `list_metrics` and so the model's catalog.

## Order of the moves

Each move behind a port changes no tool, so none costs an eval re-record. The risk is in the wrapper and the latency. The order puts the smallest, least shared systems first.

1. **Learning (LMS).** Read-only courses, one small wrapper, and the LMS demo server already exists. Low risk.
2. **Leave (HRIS leave).** Balances and policy behind the port. The risk is `request_leave`, which today files into Winyu's Inbox. A real HRIS takes the request itself, so the native tool's `verify` (`leaveHolds`) becomes a read-back through the port. That changes behaviour but not the tool's description, so it costs no re-record unless the description changes.
3. **Recruiting and sites.** Read-only, few users.
4. **Directory (HRIS).** Medium risk: everything people-related reads it, and `peopleViewOf` depends on `managerId` being right. It needs the bulk tool and the cache.
5. **Metrics (warehouse).** Highest traffic and the most callers. It goes last, once the data team's server meets the latency budget and the parity tests pass.
6. **Calendar and documents.** Only when the decision in the inventory table is made.

Replacing a native tool with connector tools is a separate decision for each system, taken only when the remote system offers something the native tool cannot express. It costs a full re-record of every persona who sees the tool, about $0.36 at today's 67 cases. Run `bun run eval --live --changed` first, which prints the estimate and spends nothing.

## Open decisions

These are product choices for the user.

1. The company calendar (holidays, alcohol ban days): does a system outside Winyu own it, or does IT keep a yearly table in Winyu?
2. Documents: should Winyu keep its own search index fed from SharePoint, or ask the document system's own search over MCP and give up Winyu's ranking and scope filter?
3. Should the data team's audit see which person asked for each number, or only that Winyu asked?
4. What latency is acceptable for the dashboard when the warehouse answers over MCP: is 1.5 seconds for a full page the right target?
