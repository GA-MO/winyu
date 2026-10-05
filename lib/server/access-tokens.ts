import { createHash, randomBytes, randomUUID } from "node:crypto";
import { findUser } from "@/lib/data/entities/users";
import { collection } from "@/lib/server/store/json-store";

export const ACCESS_TOKENS_COLLECTION = "mcp-tokens";

export const TOKEN_CHANNELS = ["mcp", "a2a"] as const;

/** Where a token works: `mcp` for an MCP client's tool calls, `a2a` for another agent asking Winyu's agent; a token of one channel is refused on the other. */
export type TokenChannel = (typeof TOKEN_CHANNELS)[number];

const TOKEN_BYTES = 32;
const HINT_CHARS = 4;
const MAX_CALLER_CHARS = 80;

/** One token as the store keeps it: whose it is, its channel, the calling agent IT named (A2A only), its hash (never the token), the last characters an admin recognises it by, who issued it and when, and when it was revoked or last used. */
export type AccessToken = { id: string; userId: string; channel: TokenChannel; caller: string | null; hash: string; hint: string; issuedBy: string; issuedAt: string; revokedAt: string | null; lastUsedAt: string | null };

/** A token just issued: the plain token, shown to the admin once, and the record that keeps only its hash. */
export type IssuedToken = { token: string; record: AccessToken };

/** Who a presented token acts as: the Winyu user whose role and scope every call runs under, and the agent IT issued it to. */
export type TokenHolder = { userId: string; caller: string | null; tokenId: string };

type StoredToken = Omit<AccessToken, "channel" | "caller"> & Partial<Pick<AccessToken, "channel" | "caller">>;

function tokenStore() {
  return collection<StoredToken>(ACCESS_TOKENS_COLLECTION);
}

function hashOf(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function prefixOf(channel: TokenChannel): string {
  return `${channel}_`;
}

function recordOf(stored: StoredToken): AccessToken {
  return { ...stored, channel: stored.channel ?? "mcp", caller: stored.caller ?? null };
}

/** Every token ever issued, newest first, revoked ones included so the admin sees the history. */
export function accessTokens(): AccessToken[] {
  return tokenStore().all().map(recordOf).sort((left, right) => right.issuedAt.localeCompare(left.issuedAt));
}

/** Issues a token that lets a client of one channel act as this user; an A2A token names the calling agent. Null for an unknown user or an A2A token without a caller. */
export function issueToken(userId: string, issuedBy: string, channel: TokenChannel = "mcp", caller: string | null = null): IssuedToken | null {
  if (!findUser(userId)) return null;
  const named = caller?.trim().slice(0, MAX_CALLER_CHARS) || null;
  if (channel === "a2a" && !named) return null;
  const token = `${prefixOf(channel)}${randomBytes(TOKEN_BYTES).toString("base64url")}`;
  const record: AccessToken = { id: randomUUID(), userId, channel, caller: channel === "a2a" ? named : null, hash: hashOf(token), hint: token.slice(-HINT_CHARS), issuedBy, issuedAt: new Date().toISOString(), revokedAt: null, lastUsedAt: null };
  tokenStore().put(record);
  return { token, record };
}

/** Revokes a token; the next request that presents it is refused. */
export function revokeToken(id: string): boolean {
  const record = tokenStore().get(id);
  if (!record || record.revokedAt) return false;
  tokenStore().put({ ...record, revokedAt: new Date().toISOString() });
  return true;
}

/** Who a token presented on this channel acts as, or null when it is unknown, revoked, of another channel, or its user no longer exists; marks the token used. */
export function holderOfToken(token: string, channel: TokenChannel): TokenHolder | null {
  if (!token.startsWith(prefixOf(channel))) return null;
  const hash = hashOf(token);
  const stored = tokenStore().all().find((candidate) => candidate.hash === hash);
  if (!stored) return null;
  const record = recordOf(stored);
  if (record.channel !== channel || record.revokedAt || !findUser(record.userId)) return null;
  tokenStore().put({ ...stored, lastUsedAt: new Date().toISOString() });
  return { userId: record.userId, caller: record.caller, tokenId: record.id };
}
