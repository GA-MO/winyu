/** Who started the work a tool call belongs to: a person in the chat, a person's own MCP client (Claude, Copilot) holding their token, another team's agent asking over A2A with a token IT issued in a person's name, a person writing to the bot in Microsoft Teams or LINE, a background job, or server code outside any run. */
export type Initiator = "person" | "mcp" | "a2a" | "teams" | "line" | "job" | "system";

/** The admin rule that refused a call, as the trace and the audit name it. */
export type RuleRef = { id: string; name: string };

export type AuditEntry = { id: string; at: string; userId: string; tool: string; connector?: string; argsHash: string; decision: "allow" | "deny" | "masked";
  rowsReturned: number; latencyMs: number; code?: string; reason?: string; args?: string; toolCallId?: string; initiator?: Initiator; turnId?: string; threadId?: string; question?: string; rule?: RuleRef };
