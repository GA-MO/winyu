import { appendFileSync, cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { AbstractChat, asSchema, DefaultChatTransport, isToolUIPart, getToolName, lastAssistantMessageIsCompleteWithApprovalResponses, lastAssistantMessageIsCompleteWithToolCalls, type ChatState, type ChatStatus, type UIMessage } from "ai";
import { formatActionMessage } from "vexa/react";
import { findUser } from "@/lib/data/entities/users";
import { askTool, copActionTool } from "@/components/cards/action-tool";
import { SIM_PERSONAS } from "@/lib/sim/scenarios";
import type { SimPersona, SimSession, SimTurn } from "@/lib/sim/types";
import { buildReview, meanScores, parseWalk, unscored, type ReviewTurn } from "@/lib/sim/card-review";
import { diffOf, sessionOf, shiftFor, shifted, snapshotOf, type RunDiff, type SessionWindow, type Snapshot, type StoredRecord } from "@/lib/sim/records";

const BASE_URL = "http://localhost:3100";
const DATA_DIR = path.join(process.cwd(), ".data");
const RUNS_DIR = path.join(process.cwd(), "sim", "runs");
const BACKUP_DIR = path.join(process.cwd(), ".sim-backup");
const DEFAULT_CONCURRENCY = 3;
const DEFAULT_BUDGET_USD = 10;
const IDLE_POLL_MS = 150;
const IDLE_SETTLE_MS = 600;
const TURN_TIMEOUT_MS = 240_000;
const MAX_ROUNDS = 5;
const TRANSIENT_RETRIES = 3;
const TRANSIENT_WAIT_MS = 20_000;
const TRANSIENT = /"code":(429|5\d\d)|rate-limit|"error_type":"timeout"/;
const HOST_DESCRIPTION_MAX_CHARS = 300;
const RESULT_TOOLS = new Set(["query_metric", "get_alerts", "get_forecast"]);

type Manifest = {
  run: string;
  model: string;
  startedAt: string;
  finishedAt: string | null;
  finalizedAt: string | null;
  personas: string[];
  sessions: SessionWindow[];
  diff: RunDiff | null;
  shifted: Record<string, number>;
  unshifted: Record<string, string[]>;
};

type RetrySession = SimSession & { retryOf?: { session: number; turn: number } };

type ToolTrace = { name: string; state: string; input: unknown; output: unknown; approval: unknown; errorText: unknown };

type TurnRecord = {
  kind: "turn";
  run: string;
  userId: string;
  role: string;
  session: number;
  daysAgo: number;
  threadId: string;
  turn: number;
  labels: Omit<SimTurn, "say" | "press">;
  sent: string | null;
  pressed: { kind: string; found: boolean } | null;
  retry: boolean;
  startedAt: string;
  endedAt: string;
  latencyMs: number;
  status: ChatStatus;
  error: string | null;
  text: string;
  tools: ToolTrace[];
  messages: UIMessage[];
};

function argOf(name: string, fallback: string): string {
  const hit = process.argv.find((value) => value.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

function runDir(run: string): string {
  return path.join(RUNS_DIR, run);
}

function manifestPath(run: string): string {
  return path.join(runDir(run), "manifest.json");
}

function readManifest(run: string): Manifest {
  return JSON.parse(readFileSync(manifestPath(run), "utf8")) as Manifest;
}

function writeManifest(manifest: Manifest): void {
  writeFileSync(manifestPath(manifest.run), JSON.stringify(manifest, null, 2));
}

function transcriptPath(run: string): string {
  return path.join(runDir(run), "transcripts.jsonl");
}

function readTranscript(run: string): TurnRecord[] {
  if (!existsSync(transcriptPath(run))) return [];
  return readFileSync(transcriptPath(run), "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line) as TurnRecord);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class MemoryState implements ChatState<UIMessage> {
  status: ChatStatus = "ready";
  error: Error | undefined = undefined;
  messages: UIMessage[] = [];
  pushMessage = (message: UIMessage) => {
    this.messages = [...this.messages, message];
  };
  popMessage = () => {
    this.messages = this.messages.slice(0, -1);
  };
  replaceMessage = (index: number, message: UIMessage) => {
    this.messages = this.messages.map((existing, position) => (position === index ? message : existing));
  };
  snapshot = <T,>(thing: T): T => structuredClone(thing);
}

class SimChat extends AbstractChat<UIMessage> {
  constructor(init: ConstructorParameters<typeof AbstractChat<UIMessage>>[0]) {
    super(init);
  }
}

async function signIn(userId: string): Promise<string> {
  const response = await fetch(`${BASE_URL}/api/session`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId }) });
  if (!response.ok) throw new Error(`sign-in failed for ${userId}: ${response.status}`);
  const cookie = response.headers.get("set-cookie");
  if (!cookie) throw new Error(`no session cookie for ${userId}`);
  return cookie.split(";")[0] ?? "";
}

function withCookie(cookie: string): typeof fetch {
  return ((input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    headers.set("cookie", cookie);
    return fetch(input, { ...init, headers });
  }) as typeof fetch;
}

async function defaultModel(cookie: string): Promise<string> {
  const response = await fetch(`${BASE_URL}/api/chat`, { headers: { cookie } });
  const payload = (await response.json()) as { default?: string | null };
  if (!payload.default) throw new Error("the server offers no default model");
  return payload.default;
}

async function createThread(cookie: string, firstMessage: string): Promise<string> {
  const response = await fetch(`${BASE_URL}/api/threads`, { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ firstMessage }) });
  const payload = (await response.json()) as { id?: string };
  if (!payload.id) throw new Error("thread was not created");
  return payload.id;
}

async function saveThread(cookie: string, threadId: string, messages: UIMessage[]): Promise<void> {
  await fetch(`${BASE_URL}/api/threads/${threadId}`, { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ messages }) });
}

function busy(chat: SimChat): boolean {
  return chat.status === "submitted" || chat.status === "streaming";
}

async function idle(chat: SimChat, deadline: number): Promise<void> {
  for (;;) {
    while (busy(chat)) {
      if (Date.now() > deadline) throw new Error("turn timed out");
      await sleep(IDLE_POLL_MS);
    }
    await sleep(IDLE_SETTLE_MS);
    if (!busy(chat)) return;
  }
}

type HostTools = { cop_action: ReturnType<typeof copActionTool>; ask: ReturnType<typeof askTool> };

function hostToolsFor(queued: string[]): HostTools {
  const send = (text: string) => {
    queued.push(text);
    return true;
  };
  return { cop_action: copActionTool(send), ask: askTool(send) };
}

async function descriptorsOf(tools: HostTools): Promise<{ name: string; description: string; inputSchema: Record<string, unknown> }[]> {
  return Promise.all(
    Object.entries(tools).map(async ([name, tool]) => ({
      name,
      description: tool.description.slice(0, HOST_DESCRIPTION_MAX_CHARS),
      inputSchema: (await asSchema(tool.input as never).jsonSchema) as Record<string, unknown>,
    })),
  );
}

function toolParts(messages: readonly UIMessage[]): ToolTrace[] {
  return messages.flatMap((message) =>
    message.parts.filter(isToolUIPart).map((part) => {
      const raw = part as unknown as Record<string, unknown>;
      return { name: getToolName(part), state: String(raw.state), input: raw.input, output: raw.output, approval: raw.approval ?? null, errorText: raw.errorText ?? null };
    }),
  );
}

function textOf(messages: readonly UIMessage[]): string {
  return messages
    .filter((message) => message.role === "assistant")
    .flatMap((message) => message.parts.flatMap((part) => (part.type === "text" ? [part.text] : [])))
    .join("\n")
    .trim();
}

type OfferedAction = { kind: string; tool: string | null; input: Record<string, unknown> | null; prompt: string | null };

function offeredActions(messages: readonly UIMessage[]): OfferedAction[] {
  const outputs = toolParts(messages.filter((message) => message.role === "assistant")).filter((trace) => RESULT_TOOLS.has(trace.name) && trace.output);
  const latest = outputs.at(-1)?.output as { nextActions?: OfferedAction[] } | undefined;
  return latest?.nextActions ?? [];
}

function pressMessage(action: OfferedAction): string | null {
  if (action.tool) return formatActionMessage(action.tool, action.input ?? {});
  return action.prompt;
}

function approvalsWaiting(chat: SimChat): string[] {
  const last = chat.messages.at(-1);
  if (!last || last.role !== "assistant") return [];
  return last.parts.filter(isToolUIPart).flatMap((part) => {
    const raw = part as unknown as { state?: string; approval?: { id?: string } };
    return raw.state === "approval-requested" && raw.approval?.id ? [raw.approval.id] : [];
  });
}

async function retryTransient(chat: SimChat, deadline: number): Promise<void> {
  for (let attempt = 0; attempt < TRANSIENT_RETRIES && chat.status === "error" && TRANSIENT.test(chat.error?.message ?? ""); attempt += 1) {
    await sleep(TRANSIENT_WAIT_MS);
    chat.clearError();
    await chat.regenerate();
    await idle(chat, deadline);
  }
}

async function runTurn(chat: SimChat, text: string, approve: boolean, queued: string[]): Promise<void> {
  const deadline = Date.now() + TURN_TIMEOUT_MS;
  await chat.sendMessage({ text });
  await idle(chat, deadline);
  await retryTransient(chat, deadline);
  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    const waiting = approvalsWaiting(chat);
    if (waiting.length === 0) break;
    for (const id of waiting) await chat.addToolApprovalResponse({ id, approved: approve, reason: approve ? undefined : "ไม่อนุมัติ" });
    await idle(chat, deadline);
  }
  while (queued.length > 0) {
    const next = queued.shift() as string;
    await chat.sendMessage({ text: next });
    await idle(chat, deadline);
  }
}

function spentSince(pre: Snapshot): number {
  const calls = snapshotOf(DATA_DIR)["model-calls"] ?? {};
  const before = pre["model-calls"] ?? {};
  return Object.values(calls)
    .filter((call) => !before[call.id])
    .reduce((sum, call) => sum + (typeof call.billedUsd === "number" ? call.billedUsd : typeof call.estimatedUsd === "number" ? call.estimatedUsd : 0), 0);
}

function sortedSessions(persona: SimPersona): RetrySession[] {
  return persona.sessions.slice().sort((left, right) => right.daysAgo - left.daysAgo);
}

function firstText(session: SimSession): string {
  const first = session.turns.find((turn) => "say" in turn);
  return first && "say" in first ? first.say : "";
}

function sessionKey(userId: string, index: number, session: RetrySession): string {
  return session.retryOf ? `${userId}#retry-${session.retryOf.session}-${session.retryOf.turn}` : `${userId}#${index}`;
}

async function runPersona(persona: SimPersona, run: string, model: string, pre: Snapshot, budget: number, done: ReadonlySet<string>, sessions: RetrySession[] = sortedSessions(persona)): Promise<void> {
  const user = findUser(persona.userId);
  if (!user) throw new Error(`no demo user ${persona.userId}`);
  const cookie = await signIn(persona.userId);
  for (const [sessionIndex, session] of sessions.entries()) {
    const key = sessionKey(persona.userId, sessionIndex, session);
    if (done.has(key)) continue;
    if (spentSince(pre) > budget) throw new Error(`budget of $${budget} reached`);
    const threadId = await createThread(cookie, firstText(session));
    const queued: string[] = [];
    const hostTools = hostToolsFor(queued);
    const descriptors = await descriptorsOf(hostTools);
    const chat: SimChat = new SimChat({
      id: threadId,
      state: new MemoryState(),
      transport: new DefaultChatTransport<UIMessage>({
        api: `${BASE_URL}/api/chat`,
        fetch: withCookie(cookie),
        body: () => ({ model, context: { threadId, preloadPacketId: null }, hostTools: descriptors }),
      }),
      sendAutomaticallyWhen: (options) => lastAssistantMessageIsCompleteWithToolCalls(options) || lastAssistantMessageIsCompleteWithApprovalResponses(options),
      onToolCall: ({ toolCall }) => {
        const tool = hostTools[toolCall.toolName as keyof HostTools];
        if (toolCall.dynamic || !tool) return;
        const output = tool.run(toolCall.input as never, { toolCallId: toolCall.toolCallId, source: "model" } as never);
        void chat.addToolOutput({ tool: toolCall.toolName as never, toolCallId: toolCall.toolCallId, output: output as never });
      },
    });
    const startedAt = new Date().toISOString();
    for (const [turnIndex, turn] of session.turns.entries()) {
      const before = chat.messages.length;
      const began = Date.now();
      const pressed = "press" in turn ? offeredActions(chat.messages).find((action) => action.kind === turn.press) ?? null : null;
      const sent = "say" in turn ? turn.say : pressed ? pressMessage(pressed) : null;
      let error: string | null = null;
      if (sent) {
        try {
          await runTurn(chat, sent, turn.approve ?? true, queued);
        } catch (thrown) {
          error = thrown instanceof Error ? thrown.message : String(thrown);
        }
        await saveThread(cookie, threadId, chat.messages);
      }
      const fresh = chat.messages.slice(before);
      const { say: _say, press: _press, ...labels } = turn as SimTurn & { say?: string; press?: string };
      const record: TurnRecord = {
        kind: "turn",
        run,
        userId: persona.userId,
        role: user.role,
        session: session.retryOf?.session ?? sessionIndex,
        daysAgo: session.daysAgo,
        threadId,
        turn: session.retryOf?.turn ?? turnIndex,
        labels,
        sent,
        pressed: "press" in turn ? { kind: turn.press, found: Boolean(pressed) } : null,
        retry: Boolean(session.retryOf),
        startedAt: new Date(began).toISOString(),
        endedAt: new Date().toISOString(),
        latencyMs: Date.now() - began,
        status: chat.status,
        error: error ?? chat.error?.message ?? null,
        text: textOf(fresh),
        tools: toolParts(fresh),
        messages: fresh,
      };
      appendFileSync(transcriptPath(run), `${JSON.stringify(record)}\n`);
      console.log(`${persona.userId} s${sessionIndex} t${turnIndex} ${record.latencyMs}ms ${record.tools.map((tool) => `${tool.name}:${tool.state}`).join(",") || "-"}${record.error ? ` ERROR ${record.error}` : ""}`);
      if (chat.status === "error") chat.clearError();
    }
    const window: SessionWindow = { userId: persona.userId, threadId, daysAgo: session.daysAgo, startedAt, endedAt: new Date().toISOString() };
    appendFileSync(path.join(runDir(run), "sessions.jsonl"), `${JSON.stringify({ ...window, index: sessionIndex, key })}\n`);
  }
}

function completedSessions(run: string): Set<string> {
  const file = path.join(runDir(run), "sessions.jsonl");
  if (!existsSync(file)) return new Set();
  return new Set(readFileSync(file, "utf8").split("\n").filter(Boolean).map((line) => {
    const window = JSON.parse(line) as SessionWindow & { index: number; key?: string };
    return window.key ?? `${window.userId}#${window.index}`;
  }));
}

function readSessions(run: string): SessionWindow[] {
  const file = path.join(runDir(run), "sessions.jsonl");
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line) as SessionWindow);
}

async function pool<T>(items: readonly T[], size: number, work: (item: T) => Promise<void>): Promise<void> {
  const queue = items.slice();
  const failures: unknown[] = [];
  await Promise.all(Array.from({ length: Math.min(size, queue.length) }, async () => {
    for (let item = queue.shift(); item !== undefined; item = queue.shift()) {
      try {
        await work(item);
      } catch (thrown) {
        failures.push(thrown);
        console.error(thrown instanceof Error ? thrown.message : thrown);
        if (thrown instanceof Error && thrown.message.startsWith("budget")) queue.length = 0;
      }
    }
  }));
  if (failures.length > 0) console.error(`${failures.length} persona(s) stopped early; run again with the same --run to resume`);
}

function retrySessions(run: string, persona: SimPersona): RetrySession[] {
  const planned = sortedSessions(persona);
  return readTranscript(run)
    .filter((record) => record.userId === persona.userId && !record.retry && record.sent && TRANSIENT.test(record.error ?? ""))
    .flatMap((record) => {
      const turn = planned[record.session]?.turns[record.turn];
      return turn && "say" in turn ? [{ daysAgo: record.daysAgo, turns: [turn], retryOf: { session: record.session, turn: record.turn } }] : [];
    });
}

async function runCommand(): Promise<void> {
  const run = argOf("run", new Date().toISOString().slice(0, 10));
  const only = argOf("users", "").split(",").filter(Boolean);
  const personas = SIM_PERSONAS.filter((persona) => only.length === 0 || only.includes(persona.userId));
  const budget = Number(argOf("budget", String(DEFAULT_BUDGET_USD)));
  const concurrency = Number(argOf("concurrency", String(DEFAULT_CONCURRENCY)));
  mkdirSync(runDir(run), { recursive: true });
  const prePath = path.join(BACKUP_DIR, run, "pre-snapshot.json");
  if (!existsSync(prePath)) {
    mkdirSync(path.join(BACKUP_DIR, run), { recursive: true });
    cpSync(DATA_DIR, path.join(BACKUP_DIR, run, "data"), { recursive: true });
    writeFileSync(prePath, JSON.stringify(snapshotOf(DATA_DIR)));
  }
  const pre = JSON.parse(readFileSync(prePath, "utf8")) as Snapshot;
  const model = argOf("model", "") || (await defaultModel(await signIn(personas[0]?.userId ?? "u_thana")));
  const existing = existsSync(manifestPath(run)) ? readManifest(run) : null;
  writeManifest({
    run,
    model,
    startedAt: existing?.startedAt ?? new Date().toISOString(),
    finishedAt: null,
    finalizedAt: null,
    personas: [...new Set([...(existing?.personas ?? []), ...personas.map((persona) => persona.userId)])],
    sessions: [],
    diff: null,
    shifted: {},
    unshifted: {},
  });
  writeFileSync(path.join(runDir(run), "scenarios.json"), JSON.stringify(SIM_PERSONAS, null, 2));
  console.log(`run ${run} · model ${model} · ${personas.length} personas · budget $${budget}`);
  const done = completedSessions(run);
  const retrying = process.argv.includes("--retry-errors");
  await pool(personas, concurrency, (persona) => runPersona(persona, run, model, pre, budget, done, retrying ? retrySessions(run, persona) : sortedSessions(persona)));
  const manifest = readManifest(run);
  writeManifest({ ...manifest, finishedAt: new Date().toISOString() });
  console.log(`spent $${spentSince(pre).toFixed(4)} · ${readTranscript(run).length} turns in ${transcriptPath(run)}`);
}

function writeCollection(collection: string, rows: Record<string, StoredRecord>): void {
  writeFileSync(path.join(DATA_DIR, `${collection}.json`), JSON.stringify(Object.values(rows), null, 2));
}

function finalizeCommand(): void {
  const run = argOf("run", new Date().toISOString().slice(0, 10));
  const manifest = readManifest(run);
  if (manifest.finalizedAt) throw new Error(`run ${run} is already finalized`);
  const pre = JSON.parse(readFileSync(path.join(BACKUP_DIR, run, "pre-snapshot.json"), "utf8")) as Snapshot;
  const sessions = readSessions(run);
  const now = snapshotOf(DATA_DIR);
  const diff = diffOf(pre, now);
  const counts: Record<string, number> = {};
  const unshifted: Record<string, string[]> = {};
  const records: Record<string, Record<string, StoredRecord>> = {};
  for (const [collection, ids] of Object.entries(diff.created)) {
    const rows = now[collection] ?? {};
    for (const id of ids) {
      const row = rows[id];
      if (!row) continue;
      const session = sessionOf(collection, row, sessions);
      if (!session) (unshifted[collection] ??= []).push(id);
      const moved = session ? shifted(row, shiftFor(session)) : row;
      rows[id] = moved;
      (records[collection] ??= {})[id] = moved;
      if (session) counts[collection] = (counts[collection] ?? 0) + 1;
    }
    writeCollection(collection, rows);
  }
  for (const [collection, earlier] of Object.entries(diff.modified)) {
    for (const id of Object.keys(earlier)) {
      const row = now[collection]?.[id];
      if (row) (records[collection] ??= {})[id] = row;
    }
  }
  const recordsDir = path.join(runDir(run), "records");
  mkdirSync(recordsDir, { recursive: true });
  for (const [collection, rows] of Object.entries(records)) writeFileSync(path.join(recordsDir, `${collection}.json`), JSON.stringify(Object.values(rows), null, 2));
  writeManifest({ ...manifest, sessions, diff, shifted: counts, unshifted, finalizedAt: new Date().toISOString() });
  console.log(`finalized ${run}: created ${JSON.stringify(Object.fromEntries(Object.entries(diff.created).map(([key, ids]) => [key, ids.length])))} · modified ${JSON.stringify(Object.fromEntries(Object.entries(diff.modified).map(([key, rows]) => [key, Object.keys(rows).length])))} · unshifted ${JSON.stringify(Object.fromEntries(Object.entries(unshifted).map(([key, ids]) => [key, ids.length])))}`);
}

function cleanCommand(): void {
  const run = argOf("run", "");
  const manifest = readManifest(run);
  if (!manifest.diff) throw new Error(`run ${run} is not finalized`);
  const now = snapshotOf(DATA_DIR);
  for (const collection of new Set([...Object.keys(manifest.diff.created), ...Object.keys(manifest.diff.modified)])) {
    const rows = now[collection] ?? {};
    for (const id of manifest.diff.created[collection] ?? []) delete rows[id];
    for (const [id, earlier] of Object.entries(manifest.diff.modified[collection] ?? {})) rows[id] = earlier;
    writeCollection(collection, rows);
  }
  console.log(`removed run ${run} from ${DATA_DIR}`);
}

function restoreCommand(): void {
  const run = argOf("run", "");
  const manifest = readManifest(run);
  if (!manifest.diff) throw new Error(`run ${run} is not finalized`);
  const now = snapshotOf(DATA_DIR);
  const recordsDir = path.join(runDir(run), "records");
  for (const collection of new Set([...Object.keys(manifest.diff.created), ...Object.keys(manifest.diff.modified)])) {
    const file = path.join(recordsDir, `${collection}.json`);
    if (!existsSync(file)) continue;
    const rows = now[collection] ?? {};
    for (const row of JSON.parse(readFileSync(file, "utf8")) as StoredRecord[]) rows[row.id] = row;
    writeCollection(collection, rows);
  }
  console.log(`restored run ${run} into ${DATA_DIR}`);
}

function cardReviewCommand(): void {
  const run = argOf("run", "");
  if (!run) throw new Error("card-review needs --run=YYYY-MM-DD");
  const walkPath = path.join(runDir(run), "card-walk.md");
  if (!existsSync(walkPath)) throw new Error(`no card-walk.md in ${runDir(run)}`);
  const rows = buildReview(readTranscript(run) as unknown as ReviewTurn[], parseWalk(readFileSync(walkPath, "utf8")));
  writeFileSync(path.join(runDir(run), "card-review.jsonl"), rows.map((row) => JSON.stringify(row)).join("\n") + "\n");
  const missing = unscored(rows);
  const mean = meanScores(rows);
  console.log(`card-review ${run}: ${rows.length} rows · mean correct ${mean.correct} · fit ${mean.fit} · readable ${mean.readable} · sensible ${mean.sensible}`);
  if (missing.length === 0) return;
  console.error(`unscored: ${missing.join(" ")}`);
  process.exitCode = 1;
}

const COMMANDS: Record<string, () => void | Promise<void>> = { run: runCommand, finalize: finalizeCommand, clean: cleanCommand, restore: restoreCommand, "card-review": cardReviewCommand };

const command = COMMANDS[process.argv[2] ?? ""];
if (!command) {
  console.error("usage: bun run sim <run|finalize|clean|restore|card-review> [--run=YYYY-MM-DD] [--users=a,b] [--concurrency=3] [--budget=10]");
  process.exit(1);
}
await command();
