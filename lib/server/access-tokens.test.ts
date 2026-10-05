import { afterEach, describe, expect, test } from "bun:test";
import { ACCESS_TOKENS_COLLECTION, accessTokens, holderOfToken, issueToken, revokeToken } from "./access-tokens";
import { collection } from "./store/json-store";

const ADMIN = "u_ton";
const issuedIds: string[] = [];

afterEach(() => {
  for (const id of issuedIds.splice(0)) collection(ACCESS_TOKENS_COLLECTION).remove(id);
});

function issued(userId: string, channel: "mcp" | "a2a", caller: string | null = null) {
  const result = issueToken(userId, ADMIN, channel, caller);
  if (!result) throw new Error("not issued");
  issuedIds.push(result.record.id);
  return result;
}

describe("access tokens", () => {
  test("an A2A token maps to its user and the agent IT named, and keeps only a hash", () => {
    const { token, record } = issued("u_krit", "a2a", "  Finance agent  ");
    expect(token.startsWith("a2a_")).toBe(true);
    expect(holderOfToken(token, "a2a")).toEqual({ userId: "u_krit", caller: "Finance agent", tokenId: record.id });
    expect(JSON.stringify(collection(ACCESS_TOKENS_COLLECTION).all())).not.toContain(token);
  });

  test("a token is refused on the other channel", () => {
    const a2a = issued("u_thana", "a2a", "HR agent");
    const mcp = issued("u_thana", "mcp");
    expect(holderOfToken(a2a.token, "mcp")).toBeNull();
    expect(holderOfToken(mcp.token, "a2a")).toBeNull();
    expect(holderOfToken(`a2a_${mcp.token.slice(4)}`, "a2a")).toBeNull();
  });

  test("an A2A token needs a caller and a known user; a revoked token is refused", () => {
    expect(issueToken("u_krit", ADMIN, "a2a", "   ")).toBeNull();
    expect(issueToken("u_nobody", ADMIN, "a2a", "Finance agent")).toBeNull();
    const { token, record } = issued("u_krit", "a2a", "Finance agent");
    expect(revokeToken(record.id)).toBe(true);
    expect(holderOfToken(token, "a2a")).toBeNull();
  });

  test("a record stored before channels existed reads as an MCP token", () => {
    const { record } = issued("u_thana", "mcp");
    const { channel: _channel, caller: _caller, ...legacy } = record;
    collection(ACCESS_TOKENS_COLLECTION).put(legacy);
    expect(accessTokens().find((token) => token.id === record.id)).toMatchObject({ channel: "mcp", caller: null });
  });
});
