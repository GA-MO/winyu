import { createVexaHandler, type VexaHandlerConfig } from "vexa/server";
import type { AgentEngine } from "./agent";

export { fence, fenceAsData, openMcpClient, prefixedToolName } from "vexa/server";
export type { HostPrepareStep, MCPClient, McpTransportConfig, ModelRegistry, PersonaContext } from "vexa/server";
export { createScriptedModel, MOCK_MODEL_ID } from "vexa/mock";
export type { MockScript, MockStep } from "vexa/mock";

export type EngineConfig = Omit<VexaHandlerConfig, "toolApprovalSecret">;

/** The agent engine Winyu runs on: Vexa's handler with Winyu's catalog, persona, rules and gated tools, and approvals signed by the server so a browser cannot forge one. */
export function vexaEngine(config: EngineConfig, approvalSecret: string): AgentEngine {
  return createVexaHandler({ ...config, toolApprovalSecret: approvalSecret });
}
