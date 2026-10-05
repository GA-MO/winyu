/** Who started the work a tool call belongs to: a person in the chat, a person's own MCP client (Claude, Copilot, another agent) holding their token, a background job, or server code outside any run. */
export type Initiator = "person" | "mcp" | "job" | "system";

/** The admin rule that refused a call, as the trace and the audit name it. */
export type RuleRef = { id: string; name: string };

export type AuditEntry = { id: string; at: string; userId: string; tool: string; connector?: string; argsHash: string; decision: "allow" | "deny" | "masked";
  rowsReturned: number; latencyMs: number; code?: string; reason?: string; args?: string; toolCallId?: string; initiator?: Initiator; turnId?: string; threadId?: string; question?: string; rule?: RuleRef };
