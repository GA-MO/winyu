import type { z } from "zod";
import type { McpTransportConfig, MCPClient } from "@/lib/harness/adapters/vexa/server";
import type { AccessContext, ConnectorDef, RoleId, ToolTier } from "@/lib/contracts";
import type { Visibility } from "@/lib/access/role-overrides";
import type { WinyuTool } from "@/lib/server/tools/define";

export type ConnectorRow = Record<string, unknown>;
export type McpCallResult = Awaited<ReturnType<MCPClient["callTool"]>>;

export type ScopeRule =
  | { kind: "inject"; args: (access: AccessContext) => Record<string, unknown> }
  | { kind: "filter"; rows: (rows: ConnectorRow[], access: AccessContext) => ConnectorRow[] | Promise<ConnectorRow[]> };

/** How a connector tool stays inside the caller's scope: nothing ties it to a person or region (say why), or Winyu rewrites its arguments and/or filters its rows. */
export type ConnectorScope = { kind: "none"; reason: string } | readonly [ScopeRule, ...ScopeRule[]];

/** A field only some roles see in full; the rest get it masked or not at all, overridable per role like a metric. */
export type SensitiveField = { field: string; labelTh: string; full: readonly RoleId[] | "all"; masked?: readonly RoleId[] };

/** Rows in Winyu's shape, from an adapter that knows the server's raw result. */
export type ConnectorOutput = { summary?: string; rows: ConnectorRow[]; asOf?: string };

type ConnectorToolBase = {
  labelTh: string;
  bodyTh?: string;
  tier?: ToolTier;
  roles: readonly RoleId[] | "all";
  scope: ConnectorScope;
  sensitive?: readonly SensitiveField[];
};

export type McpToolConfig = ConnectorToolBase & {
  as?: string;
  description?: string;
  input?: z.ZodObject;
  output?: (raw: McpCallResult) => ConnectorOutput;
};

export type RestMethod = "GET" | "POST";

/** One endpoint of a REST API: no catalog to read, so Winyu writes the description, the input schema and the adapter itself. `{name}` in the path is filled from the argument of that name. */
export type RestToolConfig = ConnectorToolBase & {
  method: RestMethod;
  path: string;
  description: string;
  input: z.ZodObject;
  output: (body: unknown) => ConnectorOutput;
};

export type ConnectorToolConfig = McpToolConfig | RestToolConfig;

export type McpConnectorConfig = {
  id: string;
  labelTh: string;
  sourceSystemTh: string;
  transport: McpTransportConfig;
  auth: (access: AccessContext | null) => Record<string, string>;
  timeoutMs: number;
  tools: Record<string, McpToolConfig>;
};

export type ConnectorField = { key: string; connector: string; field: string; labelTh: string; defaultFor: (role: RoleId) => Visibility };

export type RestConnectorConfig = {
  id: string;
  labelTh: string;
  sourceSystemTh: string;
  baseUrl: string;
  auth: (access: AccessContext | null) => Record<string, string>;
  timeoutMs: number;
  tools: Record<string, RestToolConfig>;
};

/** What Winyu needs to know about any connector to call it and speak of it. */
export type ConnectorIdentity = { id: string; labelTh: string; sourceSystemTh: string };

export type ConnectorToolBinding<Config extends ConnectorToolConfig = ConnectorToolConfig> = { name: string; remoteName: string; tier: ToolTier; config: Config; fields: ConnectorField[] };

/** What came back from the other system: rows in Winyu's shape, a failure in its own words, or no answer at all. */
export type RemoteOutcome = { ok: true; output: ConnectorOutput } | { ok: false; reason: "unavailable" } | { ok: false; reason: "failed"; text: string };

/** Asks the other system once, as the person asking, with arguments Winyu already scoped. */
export type RemoteCaller = (args: Record<string, unknown>, access: AccessContext) => Promise<RemoteOutcome>;

export type McpConnector = { def: ConnectorDef & { kind: "mcp" }; config: McpConnectorConfig; tools: WinyuTool[]; fields: ConnectorField[] };

export type RestConnector = { def: ConnectorDef & { kind: "rest" }; config: RestConnectorConfig; tools: WinyuTool[]; fields: ConnectorField[] };

export type RemoteConnector = McpConnector | RestConnector;
