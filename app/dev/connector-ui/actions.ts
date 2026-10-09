"use server";

import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import type { AccessContext } from "@/lib/contracts";
import { liveAccessFor } from "@/lib/access/enforce";
import { findUser } from "@/lib/data/entities/users";
import { readUser } from "@/lib/server/session";
import { ports } from "@/lib/server/ports";
import { openMcpClient } from "@/lib/server/connectors/mcp-client";
import { genericOutput, scopedArgs, scopedRows } from "@/lib/server/connectors/output";
import { signedIdentityHeaders } from "@/lib/server/connectors/signed-identity";
import type { ConnectorRow } from "@/lib/server/connectors/types";
import { auditedArgs, connectorScopeOf, guardHolds, holds, maskedFor, pinnedArgs } from "./compile";
import { exampleArgs, FIXTURE_CATALOGS, fixtureRows, fixtureWriteReply } from "./fixtures";
import { hintOf, isWrite, toolHash, type AuthKind, type DiscoveredTool, type RemoteHints, type RemoteInput, type TestRecord, type ToolDraft } from "./model";

const DEV_HOSTS = new Set(["127.0.0.1", "localhost"]);
const MIN_SECRET_CHARS = 8;
const DISCOVERY_TIMEOUT_MS = 4000;
const CLIENT_NAME = "winyu-connector-ui";

export type ProblemCode = "not_admin" | "bad_url" | "host_not_allowed" | "no_secret" | "unreachable" | "no_scope" | "unknown_user" | "draft_gone" | "write_on_live_server";

export type DiscoverResult = { ok: true; draftKey: string; secretHint: string; fixture: boolean; tools: DiscoveredTool[] } | { ok: false; problem: ProblemCode; detail?: string };

export type TestResult = { ok: true; test: TestRecord } | { ok: false; problem: ProblemCode; detail?: string };

type Draft = { url: string; auth: AuthKind; secret: string; fixture: boolean };

const DRAFTS = new Map<string, Draft>();

async function isItAdmin(): Promise<boolean> {
  if (process.env.NODE_ENV === "production") return false;
  return readUser(await cookies())?.role === "it_admin";
}

function egressProblem(raw: string): ProblemCode | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return "bad_url";
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return "bad_url";
  if (url.username || url.password) return "bad_url";
  return DEV_HOSTS.has(url.hostname) ? null : "host_not_allowed";
}

function headersOf(draft: Draft, access: AccessContext | null): Record<string, string> {
  return draft.auth === "bearer" ? { authorization: `Bearer ${draft.secret}` } : signedIdentityHeaders(access, draft.secret);
}

function within<T>(work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error("timeout")), DISCOVERY_TIMEOUT_MS);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

function typeOf(schema: unknown): string {
  if (typeof schema !== "object" || schema === null) return "unknown";
  const type = (schema as { type?: unknown }).type;
  return Array.isArray(type) ? type.join(" | ") : typeof type === "string" ? type : "unknown";
}

function inputsOf(inputSchema: unknown): RemoteInput[] {
  const properties = typeof inputSchema === "object" && inputSchema !== null ? (inputSchema as { properties?: unknown }).properties : null;
  if (typeof properties !== "object" || properties === null) return [];
  return Object.entries(properties).map(([name, schema]) => ({ name, type: typeOf(schema) }));
}

function hintsOf(annotations: unknown): RemoteHints {
  const read = (key: string): boolean | null => {
    const value = typeof annotations === "object" && annotations !== null ? (annotations as Record<string, unknown>)[key] : undefined;
    return typeof value === "boolean" ? value : null;
  };
  return { readOnly: read("readOnlyHint"), destructive: read("destructiveHint"), idempotent: read("idempotentHint") };
}

async function listRemote(draft: Draft): Promise<DiscoveredTool[]> {
  const client = await within(openMcpClient({ type: "http", url: draft.url, headers: headersOf(draft, null) }, CLIENT_NAME));
  try {
    const listed = await within(client.listTools());
    return listed.tools.map((tool) => ({
      name: tool.name,
      description: tool.description ?? "",
      inputs: inputsOf(tool.inputSchema),
      hints: hintsOf((tool as { annotations?: unknown }).annotations),
      fields: [],
    }));
  } finally {
    await client.close().catch(() => undefined);
  }
}

/** Reads a server's tool list for the wizard: a mocked catalog for the walkthrough systems, a real MCP tools/list for a loopback server; the secret stays here and the page gets its last four characters. */
export async function discoverAction(input: { url: string; auth: AuthKind; secret: string }): Promise<DiscoverResult> {
  if (!(await isItAdmin())) return { ok: false, problem: "not_admin" };
  const url = input.url.trim();
  const fixture = FIXTURE_CATALOGS[url];
  if (!fixture) {
    const problem = egressProblem(url);
    if (problem) return { ok: false, problem };
  }
  if (input.secret.trim().length < MIN_SECRET_CHARS) return { ok: false, problem: "no_secret" };
  const draft: Draft = { url, auth: input.auth, secret: input.secret.trim(), fixture: Boolean(fixture) };
  try {
    const tools = fixture ?? (await listRemote(draft));
    const draftKey = randomUUID();
    DRAFTS.set(draftKey, draft);
    return { ok: true, draftKey, secretHint: hintOf(draft.secret), fixture: Boolean(fixture), tools };
  } catch (error) {
    return { ok: false, problem: "unreachable", detail: error instanceof Error ? error.message.slice(0, 160) : undefined };
  }
}

async function remoteRows(draft: Draft, tool: DiscoveredTool, args: Record<string, unknown>, access: AccessContext): Promise<ConnectorRow[]> {
  if (draft.fixture) return fixtureRows(draft.url, tool.name, (await ports().directory.load()).employees);
  const client = await within(openMcpClient({ type: "http", url: draft.url, headers: headersOf(draft, access) }, CLIENT_NAME));
  try {
    return genericOutput(await within(client.callTool({ name: tool.name, arguments: args }))).rows;
  } finally {
    await client.close().catch(() => undefined);
  }
}

function nullArgs(tool: DiscoveredTool): Record<string, unknown> {
  return Object.fromEntries(tool.inputs.map((input) => [input.name, null]));
}

function fieldsOf(rows: readonly ConnectorRow[]): string[] {
  return [...new Set(rows.flatMap((row) => Object.keys(row)))];
}

function filterField(tool: ToolDraft): string | null {
  return tool.scope.kind === "scoped" ? tool.scope.filter.field : null;
}

async function testRead(draft: Draft, tool: ToolDraft, remote: DiscoveredTool, access: AccessContext, hash: string, asUser: string): Promise<TestResult> {
  const scope = await connectorScopeOf(tool.scope, access);
  if (!scope) return { ok: false, problem: "no_scope" };
  const sent = scopedArgs(scope, nullArgs(remote), access);
  const received = await remoteRows(draft, remote, sent, access);
  const kept = await scopedRows(scope, received, access);
  const field = filterField(tool);
  const { masked } = await maskedFor(kept, tool.sensitive, access);
  return {
    ok: true,
    test: {
      hash,
      asUser,
      received: received.length,
      kept: kept.length,
      missingField: field ? received.filter((row) => row[field] === undefined || row[field] === null).length : 0,
      fields: fieldsOf(received),
      masked,
      sentArgs: sent,
      auditArgs: null,
      verified: null,
      guarded: null,
    },
  };
}

export type GuardInput = { tool: ToolDraft; remote: DiscoveredTool } | null;

async function guardOutcome(draft: Draft, tool: ToolDraft, guard: GuardInput, sent: Record<string, unknown>, access: AccessContext): Promise<boolean | null> {
  if (!tool.write.guard) return null;
  const readScope = guard ? await connectorScopeOf(guard.tool.scope, access) : null;
  if (!guard || !readScope || "kind" in readScope) return false;
  return guardHolds(tool.write.guard, sent, readScope, await remoteRows(draft, guard.remote, nullArgs(guard.remote), access), access);
}

async function testWrite(draft: Draft, tool: ToolDraft, remote: DiscoveredTool, guard: GuardInput, access: AccessContext, hash: string, asUser: string): Promise<TestResult> {
  if (!draft.fixture) return { ok: false, problem: "write_on_live_server" };
  const scope = await connectorScopeOf(tool.scope, access);
  if (!scope) return { ok: false, problem: "no_scope" };
  const sent = await pinnedArgs(scopedArgs(scope, exampleArgs(remote), access), tool.write, access, `call_${randomUUID().slice(0, 8)}`);
  const guarded = await guardOutcome(draft, tool, guard, sent, access);
  const reply = guarded === false ? null : fixtureWriteReply(remote, sent);
  return {
    ok: true,
    test: {
      hash,
      asUser,
      received: reply ? 1 : 0,
      kept: reply ? 1 : 0,
      missingField: 0,
      fields: reply ? Object.keys(reply) : [],
      masked: [],
      sentArgs: sent,
      auditArgs: auditedArgs(sent, tool.write.redact),
      verified: reply ? holds(tool.write.verify, sent, reply) : null,
      guarded,
    },
  };
}

/** Runs one tool as one person through the compiled presets: what Winyu sent, how many rows came back, how many the scope kept, which fields were masked; a write shows the pinned and audited arguments, whether its guard let it through, and whether the verify preset holds. */
export async function testToolAction(input: { draftKey: string; tool: ToolDraft; remote: DiscoveredTool; asUser: string; guard?: GuardInput }): Promise<TestResult> {
  if (!(await isItAdmin())) return { ok: false, problem: "not_admin" };
  const draft = DRAFTS.get(input.draftKey);
  if (!draft) return { ok: false, problem: "draft_gone" };
  const user = findUser(input.asUser);
  if (!user) return { ok: false, problem: "unknown_user" };
  const access = liveAccessFor(user);
  const hash = toolHash(input.tool);
  try {
    if (isWrite(input.tool)) return await testWrite(draft, input.tool, input.remote, input.guard ?? null, access, hash, user.id);
    return await testRead(draft, input.tool, input.remote, access, hash, user.id);
  } catch (error) {
    return { ok: false, problem: "unreachable", detail: error instanceof Error ? error.message.slice(0, 160) : undefined };
  }
}
