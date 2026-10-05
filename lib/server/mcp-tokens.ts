import { createHash, randomBytes, randomUUID } from "node:crypto";
import { findUser } from "@/lib/data/entities/users";
import { collection } from "@/lib/server/store/json-store";

export const MCP_TOKENS_COLLECTION = "mcp-tokens";

const TOKEN_PREFIX = "mcp_";
const TOKEN_BYTES = 32;
const HINT_CHARS = 4;

/** One MCP token as the store keeps it: whose it is, its hash (never the token), the last characters an admin recognises it by, who issued it and when, and when it was revoked or last used. */
export type McpToken = { id: string; userId: string; hash: string; hint: string; issuedBy: string; issuedAt: string; revokedAt: string | null; lastUsedAt: string | null };

/** A token just issued: the plain token, shown to the admin once, and the record that keeps only its hash. */
export type IssuedMcpToken = { token: string; record: McpToken };

function tokenStore() {
  return collection<McpToken>(MCP_TOKENS_COLLECTION);
}

function hashOf(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Every token ever issued, newest first, revoked ones included so the admin sees the history. */
export function mcpTokens(): McpToken[] {
  return tokenStore().all().sort((left, right) => right.issuedAt.localeCompare(left.issuedAt));
}

/** Issues a token that lets an MCP client act as this user; returns null for an unknown user. */
export function issueMcpToken(userId: string, issuedBy: string): IssuedMcpToken | null {
  if (!findUser(userId)) return null;
  const token = `${TOKEN_PREFIX}${randomBytes(TOKEN_BYTES).toString("base64url")}`;
  const record: McpToken = { id: randomUUID(), userId, hash: hashOf(token), hint: token.slice(-HINT_CHARS), issuedBy, issuedAt: new Date().toISOString(), revokedAt: null, lastUsedAt: null };
  tokenStore().put(record);
  return { token, record };
}

/** Revokes a token; the next request that presents it is refused. */
export function revokeMcpToken(id: string): boolean {
  const record = tokenStore().get(id);
  if (!record || record.revokedAt) return false;
  tokenStore().put({ ...record, revokedAt: new Date().toISOString() });
  return true;
}

/** The user a presented token acts as, or null when the token is unknown, revoked, or its user no longer exists; marks the token used. */
export function userIdForMcpToken(token: string): string | null {
  if (!token.startsWith(TOKEN_PREFIX)) return null;
  const hash = hashOf(token);
  const record = tokenStore().all().find((candidate) => candidate.hash === hash);
  if (!record || record.revokedAt || !findUser(record.userId)) return null;
  tokenStore().put({ ...record, lastUsedAt: new Date().toISOString() });
  return record.userId;
}
