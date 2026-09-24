export type AuditEntry = { id: string; at: string; userId: string; tool: string; connector?: string; argsHash: string; decision: "allow" | "deny" | "masked";
  rowsReturned: number; latencyMs: number };
