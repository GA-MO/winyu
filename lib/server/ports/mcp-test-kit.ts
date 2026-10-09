import { randomUUID } from "node:crypto";
import type { AccessContext } from "@/lib/contracts";
import { accessFor } from "@/lib/access/policies";
import { findUser } from "@/lib/data/entities/users";
import { newRun, runWithRun } from "@/lib/harness/runtime";
import { winyuTools } from "@/lib/server/agent/tools";
import { registerClientFactory } from "@/lib/server/connectors/pool";
import { signedIdentityHeaders } from "@/lib/server/connectors/signed-identity";
import { runWithAccess, runWithTurn } from "@/lib/server/request-context";
import { registerPorts, resetPorts, type Ports } from "./index";

/** A port that never answers: the address nothing listens on. */
export const NOWHERE = "http://127.0.0.1:9/mcp";

/** The personas every port test reads as: the CEO, a sales rep, HR and IT. */
export const PERSONAS: Record<string, AccessContext> = {
  ceo: accessFor(findUser("u_thana")!),
  rep: accessFor(findUser("u_krit")!),
  hr: accessFor(findUser("u_may")!),
  it: accessFor(findUser("u_ton")!),
};

export type Served = { url: string; stop: () => void };

/** A demo MCP server on a free port of this machine for the length of a test. */
export function serve(fetch: (request: Request) => Promise<Response>): Served {
  const server = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch });
  return { url: `${server.url}mcp`, stop: () => server.stop(true) };
}

/** One tool call through the gateway as a persona, the way a chat turn makes it. */
export function callTool(access: AccessContext, name: string, args: Record<string, unknown>): Promise<unknown> {
  const tool = winyuTools()[name];
  if (!tool) throw new Error(`no tool ${name}`);
  const run = newRun(access.userId, null, { initiator: "system" });
  const turn = { turnId: run.id, threadId: null, preloadPacketId: null, question: `test ${name}`, queries: [] };
  return runWithAccess(access, () => runWithTurn(turn, () => runWithRun(run, () => tool.execute(tool.inputSchema().parse(args), { toolCallId: randomUUID() }))));
}

/** The same work read once from the in-process generator and once with some ports swapped for their MCP clients. */
export async function bothWays<T>(mcp: Partial<Ports>, work: () => Promise<T>): Promise<{ local: T; remote: T }> {
  resetPorts();
  const local = await work();
  registerPorts(mcp);
  const remote = await work();
  resetPorts();
  return { local, remote };
}

/** The HTTP status a server gives a JSON-RPC request with no identity, and one signed with the wrong secret. */
export async function statusesOfStrangers(url: string): Promise<{ unsigned: number; forged: number }> {
  const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" });
  const unsigned = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body });
  const forged = await fetch(url, { method: "POST", headers: { "content-type": "application/json", ...signedIdentityHeaders(null, "not-the-secret") }, body });
  return { unsigned: unsigned.status, forged: forged.status };
}

/** Every MCP client answers this payload to any call, as a server that breaks the contract would. */
export function answerEveryCallWith(payload: Record<string, unknown>): void {
  registerClientFactory(async () => ({
    listTools: async () => ({ tools: [] }),
    callTool: async () => ({ content: [], structuredContent: payload }),
    close: async () => undefined,
  }));
}
