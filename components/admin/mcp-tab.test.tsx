import { afterEach, describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { TH } from "@/lib/i18n/th";
import { ACCESS_TOKENS_COLLECTION, issueToken, revokeToken, type IssuedToken } from "@/lib/server/access-tokens";
import { collection } from "@/lib/server/store/json-store";
import { McpTab } from "./mcp-tab";

const COPY = TH.admin.mcpTab;
const ENDPOINT = "http://localhost:3200/api/mcp";
const CARD_URL = "http://localhost:3200/.well-known/agent-card.json";
const issued: IssuedToken[] = [];

afterEach(() => {
  for (const token of issued.splice(0)) collection(ACCESS_TOKENS_COLLECTION).remove(token.record.id);
});

function issue(userId: string): IssuedToken {
  const token = issueToken(userId, "u_ton");
  if (!token) throw new Error(`no user ${userId}`);
  issued.push(token);
  return token;
}

describe("McpTab", () => {
  test("lists each token by its last characters only, active with its tool count and a revoke button, revoked without one", () => {
    const active = issue("u_thana");
    const revoked = issue("u_krit");
    revokeToken(revoked.record.id);
    const html = renderToStaticMarkup(<McpTab endpoint={ENDPOINT} cardUrl={CARD_URL} />);
    expect(html).toContain(`mcp_…${active.record.hint}`);
    expect(html).toContain(`mcp_…${revoked.record.hint}`);
    expect(html).not.toContain(active.token);
    expect(html).not.toContain(revoked.token);
    expect(html.match(new RegExp(`>${COPY.revoke}<`, "g"))?.length).toBe(1);
    expect(html).toContain(COPY.revoked);
    expect(html).toMatch(/\d+ tools/);
  });

  test("an A2A token shows its channel prefix and the agent IT issued it to", () => {
    const token = issueToken("u_krit", "u_ton", "a2a", "Finance agent");
    if (!token) throw new Error("not issued");
    issued.push(token);
    const html = renderToStaticMarkup(<McpTab endpoint={ENDPOINT} cardUrl={CARD_URL} />);
    expect(html).toContain(`a2a_…${token.record.hint}`);
    expect(html).toContain("A2A · Finance agent");
    expect(html).not.toContain(token.token);
  });
});
