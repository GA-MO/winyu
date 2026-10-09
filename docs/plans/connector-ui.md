# Connecting other systems from the admin console

Today an IT admin can watch a connector's health, turn it off, kill one of its tools and set who sees its sensitive fields. Adding a connector still takes code: a `defineMcpConnector` call added to `CONFIGURED` in `lib/server/connectors/index.ts`. This note explains how an IT admin adds an MCP server from `/admin` instead, without the UI becoming a way to leak data. Phase 1 is built: the wizard is at `/admin/connect` and replaced the `/dev/connector-ui` prototype. `docs/mcp.md` describes what it does today.

The URL form is the easy part. The hard part is scope. Every connector tool must say which rows each person may see, and today that rule is a function such as `onlyPeopleInView` in `lms-demo.ts`. That function is the permission boundary. A UI that lets an admin type a URL and press "on" without an equally strict scope rule turns one wrong click into a leak.

## Decisions already taken

- **The UI is MCP only.** A system either offers an MCP server or the Winyu team writes a thin MCP wrapper over its REST, SAP or ServiceNow API (see [The wrapper pattern](#the-wrapper-pattern)). The UI has no REST mapping step.
- **The REST connector path goes away.** The CRM demo becomes an MCP server ("CRM (MCP)"), and `defineRestConnector`, `rest.ts` and the REST types are deleted. Another change does that migration. This note treats MCP as the only connector kind.
- **Every outside system is reached over MCP where it can be.** The inventory and migration order are in [`mcp-first.md`](mcp-first.md).

## A stored connector compiles to the connector Winyu already runs

A connector made in the UI is data. The server compiles it into the same `McpConnector` that `defineMcpConnector` returns today, so the gateway, scope pipeline, masking, fencing, audit, kill switches and health pill need no second path.

```ts
type StoredConnector = {
	id: string;                  // CONNECTOR_ID, not a NATIVE_CONNECTORS id, unique across code and UI connectors
	labelTh: string;
	sourceSystemTh: string;
	url: string;                 // https, host on WINYU_CONNECTOR_HOSTS
	auth: { kind: "signed_identity" | "bearer"; secretHint: string };
	timeoutMs: number;
	tools: Record<string, StoredTool>;   // key = remote tool name; only these reach the model
	activatedAt: string | null;          // null = never turned on
	createdBy: string; updatedBy: string; updatedAt: string;
};

type StoredTool = {
	labelTh: string;
	bodyTh: string;
	pinned: { description: string; inputSchema: JsonSchema; hash: string };  // what the server listed when the admin approved it
	description: string;                 // the admin-approved text the model reads
	tier: ToolTier;                      // UNDECLARED_TIER ("destructive") until the admin picks
	roles: RoleId[];                     // explicit, never "all"
	scope: { kind: "none"; reason: string } | { kind: "scoped"; filters: [FilterPreset, ...FilterPreset[]]; inject: InjectPreset[] };
	sensitive: { field: string; byRole: Partial<Record<RoleId, Visibility>>; ownerField: string | null }[];
	write: WriteSpec | null;             // required when tier !== "read"
	test: { hash: string; asUser: string; at: string } | null;
};
```

The stored type has no "unset" scope and no empty filter list. A draft in the wizard can be incomplete, but the server parses the draft into `StoredTool` before it saves, so an incomplete tool cannot be stored as complete.

`compileStored(stored, secret)` in a new `lib/server/connectors/stored.ts` builds an `McpConnectorConfig`:

- `transport` is `{ type: "http", url }`. Stdio is never offered from the UI, because a command is code execution on the Winyu server.
- `auth` is `signedIdentityHeaders(access, secret)` or `{ authorization: "Bearer …" }`.
- Each tool gets `description: fence(stored.description)`, `input: z.fromJSONSchema(pinned.inputSchema)` with property descriptions removed, the tier, the roles, the scope compiled from presets (below), and the sensitive fields.
- The result goes through `defineMcpConnector`, so every assert in `define.ts` runs on UI connectors too.

`remoteConnectors()` returns the code connectors plus every stored connector with `activatedAt` set, compiled once per store version. `registerConnectors` already rejects a tool name declared twice, and the same check refuses a stored id that collides with a code connector.

**Storage.** Stored connectors live in `.data/connectors.json` through `collection()`. Secrets live apart in `.data/connector-secrets.json`, encrypted with AES-256-GCM under `WINYU_CONNECTOR_KEY` (server env). A missing key makes the UI read-only, so a secret is never stored in plain text. The client sees `secretHint`, the last four characters, as MCP tokens already do. For signed identity, Winyu generates the secret and shows it once for the admin to install on the other system, or the admin pastes the one the other system issued.

## Scope comes only from presets

There is no free code. Each preset is a row in one table, and each compiles to the `ScopeRule` shape that `output.ts` already runs (`scopedArgs`, `scopedRows`). The prototype's `app/dev/connector-ui/compile.ts` is that compiler, tested in `compile.test.ts` against real personas.

| Preset | Parameters | Compiles to | A scoped caller keeps | Who sees everything |
|---|---|---|---|---|
| `own_rows` | `field`, `key`: `employee_id` or `department_id` | filter | rows where `row[field]` equals the caller's own value | nobody |
| `people_line` | `field` holding an employee id | filter, via `peopleViewOf` with views `team` and `hr` | self and every report below | HR and the CEO |
| `region_rows` | `field` holding a region id | filter on `access.regions` | rows in the caller's regions | callers with `regions: "all"` |
| `brand_rows` | `field` holding a brand id | filter on `access.brands` | rows of the caller's brands | callers with `brands: "all"` |
| `inject_regions` | `arg` | inject `{ [arg]: "bkk,north" }` or `null` for all | not a boundary on its own | |
| `inject_identity` | `arg`, `key` | inject the caller's employee id or department | not a boundary on its own | |
| `none` | `reason`, at least 10 characters | `{ kind: "none", reason }` | every row | everyone with the tool |

Three rules come with the table:

- **A filter is required; inject is optional.** Inject only asks the other system to narrow its answer, so it trusts that system's code. The agreed direction listed "inject the user's regions" as a scope on its own. It is not one: an inject-only tool leaks the moment the other system ignores the argument. The stored type makes inject-only unrepresentable.
- **A row without the field fails closed.** A scoped caller never keeps a row whose filter field is missing or `null`. The test run reports how many rows were dropped that way, so a wrong field shows up as "40 received, 0 kept" before anyone turns the tool on.
- **Values must use Winyu's ids.** `region_rows` matches `northeast`, not `NE` or `ภาคอีสาน`. A wrapper translates codes. The UI does not offer value maps in the first phase.

Sensitive fields default to hidden. A field marked sensitive is `none` for every role until the admin widens it per role, and the existing `fieldVisibilityOf` overrides still apply. `ownerField` shows a field in full on the caller's own row, for example a sick-leave reason that only HR and the person who took the leave may read.

## Write tools need four more declarations

A read can only leak. A write changes another system, often for good. Everything below runs on MCP tools, and most of it is simpler when the server is a Winyu-written wrapper.

- **Approval.** Write and destructive tools already pause for the person's approval (`asksApproval`, the approval card, `approvals.ts`). An approval is spent once by `markAnswered`, so pressing approve twice runs nothing twice. `MCP_TOOL_TIERS` keeps write tools away from MCP clients, which have no approval card.
- **Pins and guards (scope on the input).** A row filter on a write's reply does not stop a write. A write is scoped by what it is allowed to touch:
	- A pin overwrites an argument with the caller's own value: `requester_id`, `holder_id` and `approver_id` become the caller's employee id whatever the model sent.
	- A guard checks an argument against a scoped read before sending: `decide_leave_request.request_id` must be a row the caller sees in `list_leave_requests` under its `people_line` scope. The prototype test shows a manager's approval of a request outside his line refused before anything is sent.
	- A write must pin the caller into an argument or have a guard. Today `Capability.ready` is synchronous, so the guard runs inside the gated call, after the approval card. The real build moves the guard into an async `ready`, so nobody approves a call the guard then refuses.
- **Redact.** The admin ticks which arguments are personal text (`reason`, `purpose`, `note`). They become the capability's `redact`, and the audit keeps "[ข้อความส่วนตัว]" instead of the text. The wizard pre-ticks arguments whose names look like free text.
- **Verify.** `CLAUDE.md` requires a `verify` post-condition on every write, and today that is code. Two presets cover the systems in scope:
	- `echo`: the write's own reply carries an id field, and the chosen fields equal the arguments sent.
	- `read_back`: Winyu calls a declared read tool on the same connector with the returned id (for example `get_requisition` with `req_no`) and compares the chosen fields.

	A write with no verify preset cannot be turned on. When verify fails, the gateway's existing recovery withholds the success claim instead of telling the person it worked.
- **Idempotency.** The gateway never retries a write, but a timeout after the other system saved the record still invites the person to ask again. The fix is an idempotency key: a pin of kind `call_id` puts the gated call's `toolCallId` into an argument such as `idempotency_key`, and the wrapper returns the first record for a repeated key. This needs one plumbing change: `gated` passes `ref.toolCallId` to the run function, which today receives only the input. A system with no key gets an explicit admin acknowledgement that a timeout can duplicate a record.
- **Amount limits.** A rule such as "a requisition above 20,000 baht" is an admin CEL rule, for example `tool.name == "requisition__create_requisition" && args.amount_thb > 20000 && user.role == "sales_rep"`. CEL rules only deny. Winyu has no "ask the manager instead" for a tool call, so above the limit the person is refused and told why. Routing to a manager belongs to the other system's own approval workflow (SAP release strategy, the HRIS approver chain), which a wrapper exposes as a status the read tools return.

**Recommendation: write tools from the UI come in phase 2, not the first release.** Reads first is also a dependency, because `read_back` and guards need a read tool that already works. A wrong read preset leaks rows that the audit shows per call. A wrong write preset changes another system with no way back. The verify and guard presets also need the `toolCallId` plumbing and the async `ready`. Until phase 2, write tools stay code-defined, and the prototype marks its write section "ระยะที่ 2".

## A connector moves through five states

The state is derived from the stored record, the switch and the last reconcile, never stored as a second flag.

| State | Means | Reaches the model | How it leaves |
|---|---|---|---|
| Draft | some tool has a blocker | no | fix every blocker |
| Ready | every included tool is declared and its test matches its config hash | no | admin presses **เปิดใช้** (`activatedAt` set, `connector:<id>` switch on) |
| Live | activated and switched on | yes, for the chosen roles | Disable, an edit, or drift |
| Disabled | `connector:<id>` switch off | no | Enable |
| Changed upstream | reconcile found a tool whose description or input schema hash differs from `pinned.hash`, or a tool that disappeared | the other tools yes, that tool no | admin reviews the diff and approves the new text and schema |

An edit to a live tool changes its config hash, so its test no longer counts and that tool leaves the surface until it is tested again. The rest of the connector stays live. A new tool the server starts offering stays closed, as `reconcileConnectors` already logs today.

## The server validates, the client only shows

The wizard's blockers (`toolBlockers` in the prototype's `model.ts`) are for the admin's convenience. The server runs the same parse on save and on activate, and refuses anything incomplete: a server action is a public endpoint and the client can be edited. The server also re-runs `defineMcpConnector`, checks `it_admin` on every action, and writes an audit row for create, edit, test, activate, disable and secret rotation. The test run happens on the server, as the chosen person, and the client gets counts, field names and masked field names, never row values. The prototype follows that rule.

## Threats and their guards

| Threat | Guard |
|---|---|
| A wrong preset leaks rows | No preset means no activation. Filters fail closed on a missing field. The test shows received against kept per person. The review matrix lists what each role keeps. An edit voids the test. |
| Inject-only scope trusted to the other system | Not representable. A filter is always required. |
| Prompt injection in a remote description | Shown framed as data with invisible characters made visible and instruction blocks struck through. The admin approves the text that the model reads. That text goes through `fence()` and a 1,200-character cap. Input property descriptions are stripped. Drift pauses the tool. |
| Prompt injection in returned rows | Unchanged: `fencedRows` and `remoteErrorText` already fence every string. |
| SSRF through the URL | Discovery and every call go only to hosts on `WINYU_CONNECTOR_HOSTS`, a server-side list, because internal systems sit on private addresses and a blanket private-IP block would stop the main use. No credentials in the URL, redirects refused (`egress.ts` wraps the transport's fetch, as `rest.ts` does with `redirect: "error"`), a timeout, a response size cap, and the resolved address is pinned per request against DNS rebinding. Cloud metadata addresses are always refused. The prototype allows only loopback. |
| Secret exposure | Encrypted at rest, never sent to the client, last four characters only, rotation audited. Signed identity keeps the secret off the wire entirely: only the HMAC travels. |
| A write tool runs without approval | The tier defaults to destructive. Remote hints can raise the tier and never lower it: a tool the server marks `destructiveHint` or `readOnlyHint: false` cannot be declared Read. Write tools are never on the MCP server surface. |
| A write acts on someone else's record | Pins and guards, both required for a write. |
| Catalog drift | Description and schema are pinned by hash. Reconcile pauses a changed tool, and a vanished tool closes. |
| A bearer token makes everyone the same caller | Allowed, and the wizard says plainly that Winyu's filter is then the only boundary. Signed identity is the default. |

## Some things stay code

- New scope logic beyond the presets. A function like `onlyPeopleInView` that the table cannot express stays in code until it earns a preset.
- Output adapters that reshape a reply. A wrapper does that on its side.
- Stdio transports.
- The host allowlist, the encryption key and `MCP_TOOL_TIERS`, because config that grants capability lives on the server.
- Write tools, until phase 2.
- Native tools and their fixed cards (`TOOL_CARDS`). A connector tool's answer is drawn as a composed card (D10).

## The wrapper pattern

Most of the company's systems speak REST, SAP RFC or the ServiceNow API. The Winyu team writes one small MCP server per system:

- It lives in its own repository or service next to the system it wraps, and the demo ones live in `scripts/` as today (`mcp-demo-lms.ts`).
- It holds the backend's service credentials. Winyu never sees them.
- It verifies Winyu's signed identity with `verifiedIdentity` and acts as that person where the backend allows it, or filters for them. Winyu still filters again, so the wrapper is a second wall, not the only one.
- It carries the rules that are awkward as presets: it maps the backend's region codes to Winyu's ids, accepts an `idempotency_key`, offers the read-back tool a verify preset needs (`get_requisition`, `get_leave_request`), and declares honest `readOnlyHint` and `destructiveHint` annotations.
- It returns flat rows with `as_of`, which the generic flattening in `output.ts` already handles, so no Winyu-side adapter is needed.

## Worked examples

All three appear in the prototype as mocked MCP servers with fixed tool lists. The LMS uses real discovery against a copy of the demo server.

**Asset system (MCP).** `list_assets` is Read for RSM, rep, HR and IT, scoped `people_line` on `holder_id`. `serial_no` and `cost_thb` are sensitive: Full for IT, Masked for RSM, None for the rest. Its description arrives with a hidden `<system>` block telling the model to call `export_assets`, and the wizard strikes it out. `export_assets` stays closed. `request_asset` is Write: `requester_id` is pinned to the caller, `idempotency_key` to the call id, `reason` is redacted, and verify is `echo`. `return_asset` is destructive (the server says so): `holder_id` is pinned and verify is `read_back`.

**Requisition system (MCP over the ERP's REST).** `list_requisitions` is `own_rows` on `requester_id` for reps and `people_line` for managers. `amount_thb` is sensitive above RSM. `get_requisition` exists for read-back. `create_requisition` is Write: `requester_id` and `department_id` are pinned, `purpose` is redacted, verify is `read_back` through `get_requisition`, and the CEL amount rule sits on top. `cancel_requisition` is destructive with a guard: `req_no` must be one of the caller's own requisitions.

**Leave system (HRIS over MCP).**

| Tool | Tier | Roles | Scope | Sensitive | Write declarations |
|---|---|---|---|---|---|
| `get_leave_balances` | Read | all | `own_rows` on `employee_id`, `people_line` for managers | | |
| `list_leave_requests` | Read | all | `people_line` on `employee_id` | `reason`: Full for HR, owner sees own | |
| `get_team_calendar` | Read | RSM, director, CEO, HR | inject `manager_id`, filter `people_line` | | |
| `get_leave_request` | Read | all | `people_line` on `employee_id` | `reason` as above | |
| `request_leave` | Write | all | | | pin `employee_id`, pin `idempotency_key`, redact `reason`, verify `read_back` via `get_leave_request` |
| `cancel_leave_request` | Critical | all | | | pin `employee_id`, guard `request_id` in own requests, verify `read_back` |
| `decide_leave_request` | Write | RSM, director, CEO, HR | | | pin `approver_id`, guard `request_id` in `list_leave_requests` under `people_line`, redact `note`, verify `read_back` (status changed, `decided_by` is the caller) |

**Pending approvals in the Inbox: pull on open.** A manager's pending leave requests appear in the Inbox and the bell as decision items, next to grant requests. Winyu reads them when the bell or the Inbox opens: `list_leave_requests { approver_id: me, status: "pending" }` as that manager, cached for 60 seconds per person. I pick pull over the HRIS pushing a notification for three reasons. The HRIS stays the only source of truth, so a request approved in the HRIS's own screen disappears from Winyu instead of lingering as a stale copy. Push needs an inbound endpoint, a second credential and a store of copies to reconcile. Users visit occasionally, and pull shows the right list at the moment they come. The cost is one call per bell render, bounded by the cache. A Teams or LINE nudge when a request arrives is the one thing pull cannot do. If that is wanted, a scheduled job polls and calls `notify`, which is still pull, on Winyu's clock. The approve and decline buttons run `decide_leave_request` through the gateway, so the approval card, guard, verify and audit all apply.

**Moving the native leave tools onto this connector costs every eval recording.** `request_leave` and `get_policy` read the generator `LeavePort` and file into Winyu's own Inbox. Replacing them with `hris_leave__…` tools changes tool names and descriptions on every persona's surface. `toolsHash` in `lib/eval/fingerprint.ts` hashes a person's whole tool list, so all 67 recordings go stale, not only `policy-leave`, the one case that calls a leave tool. At the median recorded cost of $0.0054 a case (measured from `evals/recordings/*.json`), a re-record is about $0.36. The card changes too: `get_policy` has a composed card today and a connector reply would compose a different one. Recommendation: keep the native leave tools until a real HRIS is chosen. Then move the `LeavePort` behind an MCP client first (no tool change, no stale recording), and replace the tools only when the HRIS offers something the native tools cannot express, such as the manager's decision.

## Turning a connector on changes the tool surface the eval does not see

New tools change the tool surface of every role that gets them. The review step says so before **เปิดใช้**, with the roles touched, the recorded cases of those roles and the extra prompt tokens per question (description and input schema, divided by 3 characters per token, a rough guess). As built, `bun run eval` seeds a fresh data folder, so console connectors are never part of an eval and `--stale` does not list those cases. Measuring the model with a console connector needs an eval mode that copies the connector records in, which does not exist yet.

## Test plan

- Preset compiler (`compile.test.ts`, already in the prototype): `region_rows` keeps a rep to his region and drops rows with no region, while the CEO keeps all; `own_rows` keeps one asset; `people_line` keeps a manager, his reports and nobody from another region; owner visibility; pins overwrite the model's `requester_id`; redaction; `echo` verify catches a changed field; a guard refuses a request outside the line; blockers for a fresh tool, a stale test, a short reason, and a Read tier on a tool the server says writes.
- Parity: a stored config equal to `lms_demo` gives the same rows as the code connector for u_krit, u_anucha and the CEO against the demo server.
- Parse: the server refuses an inject-only scope, an empty role list, a missing reason, a write without verify, pin or guard, and an id that collides.
- Secrets: render `/admin` and the wizard's server action replies and assert the secret is absent from the HTML and the JSON.
- Egress: refuse a host off the allowlist, `169.254.169.254`, `file:`, credentials in the URL, a redirect, and a name that resolves to a refused address.
- Drift: change the demo server's description, run reconcile, and see that tool leave the surface while the others stay.
- Eval: activate a connector on a scratch data folder and check that `--stale` lists the touched roles' cases.
- Browser: the walkthrough on `/dev/connector-ui` for each step, then the tool answering in chat for two roles with different scopes.

## Files that would change

New: `lib/server/connectors/stored.ts` (types, parse, compile, store), `lib/server/connectors/presets.ts` (the preset table and compiler, from the prototype's `compile.ts`), `lib/server/connectors/secrets.ts`, `lib/server/connectors/egress.ts`, `components/admin/connector-wizard/*`, and server actions in `app/(app)/admin/actions.ts`. Changed: `lib/server/connectors/index.ts` (stored connectors in `remoteConnectors`), `reconcile.ts` (hash drift pauses a tool), `pool.ts` (egress check), `components/admin/tools-tab.tsx` (**เชื่อมต่อระบบใหม่** and the draft and changed-upstream states), `lib/server/audit` (connector events), `lib/i18n/th.ts`, `docs/mcp.md`, `docs/plan.md`. Phase 2 adds `lib/harness/gateway.ts` (`toolCallId` to the run, async `ready`) and `lib/harness/types.ts`.

## Phases

1. **MVP: read tools from the UI.** MCP only, signed identity or bearer, the four filter presets and two inject presets, sensitive fields with owner visibility, the test run, the lifecycle, drift pause, the egress allowlist, encrypted secrets, and the eval warning.
2. **Write tools from the UI.** Pins, guards, redact, the two verify presets, the `call_id` idempotency pin, the async `ready`, and the gateway plumbing. The Inbox pull for pending decisions arrives with the first HRIS connector.
3. **Later.** Value maps for codes, a hidden helper tool that guards and verifies can use without offering it to the model, OAuth for servers that need it, and a second admin's approval before activation if the user wants it.

## Open decisions

These are product choices for the user.

1. Should turning on a new connector need a second IT admin to approve it, or is one admin enough?
2. Write tools from the UI in the first release, or read tools first and writes in phase 2 as recommended?
3. When a requisition is over the limit, is refusing with the reason enough, or should Winyu offer to send it to the manager as a handoff?
4. Who keeps the list of systems Winyu may connect to: IT edits a server setting, or a short list in the admin console that only changes with a deploy?
5. For a manager's pending leave approvals: is "shown when they open Winyu" enough, or do they also want a Teams or LINE message when a request arrives?
6. Keep the native leave tools until a real HRIS is picked (recommended), or move them to an HRIS connector now and pay for re-recording the evals?
7. Should IT see actual values when testing a connector, or only row counts and field names as the prototype does?
