import type { z } from "zod";
import type { McpTransportConfig, MCPClient } from "vexa/server";
import type { AccessContext, ConnectorDef, RoleId, ToolTier } from "@/lib/contracts";
import type { Visibility } from "@/lib/access/role-overrides";
import type { CopTool } from "@/lib/server/tools/define";

export type ConnectorRow = Record<string, unknown>;
export type McpCallResult = Awaited<ReturnType<MCPClient["callTool"]>>;

export type ScopeRule =
  | { kind: "inject"; args: (access: AccessContext) => Record<string, unknown> }
  | { kind: "filter"; rows: (rows: ConnectorRow[], access: AccessContext) => ConnectorRow[] | Promise<ConnectorRow[]> };

/** How a connector tool stays inside the caller's scope: nothing ties it to a person or region (say why), or Cop rewrites its arguments and/or filters its rows. */
export type ConnectorScope = { kind: "none"; reason: string } | readonly [ScopeRule, ...ScopeRule[]];

/** A field only some roles see in full; the rest get it masked or not at all, overridable per role like a metric. */
export type SensitiveField = { field: string; labelTh: string; full: readonly RoleId[] | "all"; masked?: readonly RoleId[] };

/** Rows in Cop's shape, from an adapter that knows the server's raw result. */
export type ConnectorOutput = { summary?: string; rows: ConnectorRow[]; asOf?: string };

export type McpToolConfig = {
  as?: string;
  labelTh: string;
  bodyTh?: string;
  description?: string;
  tier?: ToolTier;
  roles: readonly RoleId[] | "all";
  input?: z.ZodObject;
  scope: ConnectorScope;
  sensitive?: readonly SensitiveField[];
  output?: (raw: McpCallResult) => ConnectorOutput;
};

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

export type ConnectorToolBinding = { name: string; remoteName: string; tier: ToolTier; config: McpToolConfig; fields: ConnectorField[] };

export type McpConnector = { def: ConnectorDef; config: McpConnectorConfig; tools: CopTool[]; fields: ConnectorField[] };
