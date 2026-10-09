import type { z } from "zod";
import type { McpTransportConfig, MCPClient } from "./mcp-client";
import type { AccessContext, ConnectorDef, RoleId, ToolTier } from "@/lib/contracts";
import type { Visibility } from "@/lib/access/role-overrides";
import type { WinyuTool } from "@/lib/server/tools/define";
import type { WriteGuard, WritePin, WriteVerify } from "@/lib/connectors/spec";

export type ConnectorRow = Record<string, unknown>;
export type McpCallResult = Awaited<ReturnType<MCPClient["callTool"]>>;

export type ScopeRule =
  | { kind: "inject"; args: (access: AccessContext) => Record<string, unknown> | Promise<Record<string, unknown>> }
  | { kind: "filter"; rows: (rows: ConnectorRow[], access: AccessContext) => ConnectorRow[] | Promise<ConnectorRow[]> };

/** How a connector tool stays inside the caller's scope: nothing ties it to a person or region (say why), or Winyu rewrites its arguments and/or filters its rows. */
export type ConnectorScope = { kind: "none"; reason: string } | readonly [ScopeRule, ...ScopeRule[]];

/** A field only some roles see in full; the rest get it masked or not at all, overridable per role like a metric. `ownerField` shows it in full on the caller's own row. */
export type SensitiveField = { field: string; labelTh: string; full: readonly RoleId[] | "all"; masked?: readonly RoleId[]; ownerField?: string };

/** Rows in Winyu's shape, from an adapter that knows the server's raw result. */
export type ConnectorOutput = { summary?: string; rows: ConnectorRow[]; asOf?: string };

/** What a write or destructive tool may touch and how its effect is checked: pins overwrite arguments with the caller's own values or the call id, guards check an argument against a read tool of the same connector, `redact` names the personal-text arguments, and `verify` the post-condition. */
export type ConnectorWrite = { pins: readonly WritePin[]; guards: readonly WriteGuard[]; redact: readonly string[]; verify: WriteVerify };

export type McpToolConfig = {
  as?: string;
  labelTh: string;
  bodyTh?: string;
  description?: string;
  tier?: ToolTier;
  roles: readonly RoleId[] | "all";
  input?: z.ZodObject;
  output?: (raw: McpCallResult) => ConnectorOutput;
  scope: ConnectorScope;
  sensitive?: readonly SensitiveField[];
  write?: ConnectorWrite;
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

export type ConnectorField = { key: string; connector: string; field: string; labelTh: string; ownerField: string | null; defaultFor: (role: RoleId) => Visibility };

/** One remote tool as Winyu binds it; `helper` finds another tool of the same connector by its remote name, for a write's guards and read-back. */
export type ConnectorToolBinding = { name: string; remoteName: string; tier: ToolTier; config: McpToolConfig; fields: ConnectorField[]; helper: (remoteName: string) => ConnectorToolBinding | null };

export type McpConnector = { def: ConnectorDef; config: McpConnectorConfig; tools: WinyuTool[]; fields: ConnectorField[] };
