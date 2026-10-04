/** Who started the work a tool call belongs to: a person in the chat, a background job, or server code outside any run. */
export type Initiator = "person" | "job" | "system";

export type AuditEntry = { id: string; at: string; userId: string; tool: string; connector?: string; argsHash: string; decision: "allow" | "deny" | "masked";
  rowsReturned: number; latencyMs: number; code?: string; reason?: string; args?: string; toolCallId?: string; initiator?: Initiator; turnId?: string; threadId?: string; question?: string };
