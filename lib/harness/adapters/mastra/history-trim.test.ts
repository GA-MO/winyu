import { describe, expect, mock, setDefaultTimeout, test } from "bun:test";
import type { LanguageModelV3Prompt } from "@ai-sdk/provider";
import { ScriptedModel } from "@/scripts/scripted-model";

setDefaultTimeout(60_000);

const scripted = new ScriptedModel();
mock.module("@/lib/server/models", () => scripted.modelsModule());

const { serveCopilot, LEARNING } = await import("./serve");
const { findUser } = await import("@/lib/data/entities/users");
const { liveAccessFor } = await import("@/lib/access/enforce");
const { storedMessages } = await import("./history");
const { HISTORY_TOKEN_CEILING, historyTokens, trimmedHistory } = await import("./history-trim");
const { TH } = await import("@/lib/i18n/th");

const USER = "u_thana";
const RUN_URL = "http://localhost/api/copilotkit/agent/winyu/run";
const TURNS = 6;
const ROWS = 20;
const BY_PROVINCE = { metric: "net_sales_value", dims: ["province"], grain: "month", range: { from: "2026-09-01", to: "2026-09-22" }, compare: "prev_period", filters: {}, sort: "value_desc", limit: ROWS };

type ResultValue = { rows?: unknown[]; summary?: string; query?: unknown; rowCount?: number; trimmed?: string };
type ModelPrompt = Parameters<typeof trimmedHistory>[0];

function access() {
  const user = findUser(USER);
  if (!user) throw new Error(`no ${USER}`);
  return liveAccessFor(user);
}

async function ask(threadId: string, content: string): Promise<void> {
  const body = { threadId, runId: crypto.randomUUID(), state: {}, messages: [{ id: crypto.randomUUID(), role: "user", content }], tools: [], context: [], forwardedProps: {} };
  const request = new Request(RUN_URL, { method: "POST", headers: { "content-type": "application/json", accept: "text/event-stream" }, body: JSON.stringify(body) });
  await (await serveCopilot(access(), request, LEARNING)).text();
}

function question(turn: number): string {
  return `ยอดขายรายจังหวัด รอบที่ ${turn}`;
}

function reply(turn: number): string {
  return `จังหวัดที่ขายดีที่สุดในรอบที่ ${turn} คือกรุงเทพฯ`;
}

function promptOfCall(index: number): LanguageModelV3Prompt {
  const call = scripted.model.doStreamCalls[index];
  if (!call) throw new Error(`no model call ${index}`);
  return call.prompt;
}

function resultsIn(prompt: LanguageModelV3Prompt): ResultValue[] {
  return prompt.flatMap((message) => (message.role === "tool" ? message.content.flatMap((part) => (part.type === "tool-result" && part.output.type === "json" ? [part.output.value as ResultValue] : [])) : []));
}

function textsIn(prompt: LanguageModelV3Prompt, role: "user" | "assistant"): string[] {
  return prompt.flatMap((message) => (message.role === role ? message.content.flatMap((part) => (part.type === "text" ? [part.text] : [])) : []));
}

function storedResults(stored: Awaited<ReturnType<typeof storedMessages>>): ResultValue[] {
  return stored.flatMap((message) => {
    const parts = (message.content as { parts?: { type?: string; toolInvocation?: { result?: ResultValue } }[] }).parts ?? [];
    return parts.flatMap((part) => (part.type === "tool-invocation" && part.toolInvocation?.result ? [part.toolInvocation.result] : []));
  });
}

describe("a long thread's history", () => {
  test("from the second turn on, earlier results reach the model as stubs (summary, query, row count) while the current turn keeps its rows and memory keeps every result whole", async () => {
    const threadId = `history-trim-${Date.now()}`;
    const firstCall = scripted.model.doStreamCalls.length;
    for (let turn = 1; turn <= TURNS; turn++) {
      scripted.script([{ call: "query_metric", args: BY_PROVINCE }, { text: reply(turn) }]);
      await ask(threadId, question(turn));
    }
    const lastTurnFirstCall = promptOfCall(firstCall + 2 * (TURNS - 1));
    const lastTurnSecondCall = promptOfCall(firstCall + 2 * (TURNS - 1) + 1);

    const earlier = resultsIn(lastTurnFirstCall);
    expect(earlier).toHaveLength(TURNS - 1);
    for (const stub of earlier) {
      expect(stub.rows).toBeUndefined();
      expect(stub).toMatchObject({ rowCount: ROWS, trimmed: TH.harness.trimmedResult, query: { metric: "net_sales_value", dims: ["province"] } });
      expect(stub.summary?.length).toBeGreaterThan(0);
    }
    expect(textsIn(lastTurnFirstCall, "user")).toEqual(Array.from({ length: TURNS }, (_, index) => question(index + 1)));
    expect(textsIn(lastTurnFirstCall, "assistant")).toEqual(Array.from({ length: TURNS - 1 }, (_, index) => reply(index + 1)));

    const withCurrent = resultsIn(lastTurnSecondCall);
    expect(withCurrent.slice(0, -1).every((result) => result.rows === undefined)).toBe(true);
    expect(withCurrent.at(-1)?.rows).toHaveLength(ROWS);
    expect(withCurrent.at(-1)?.trimmed).toBeUndefined();

    const stored = storedResults(await storedMessages(threadId, USER));
    expect(stored).toHaveLength(TURNS);
    expect(stored.every((result) => result.rows?.length === ROWS && result.trimmed === undefined)).toBe(true);
  });

  test("past the ceiling the oldest turns leave whole, the newest earlier turns and the current turn stay", () => {
    const longReply = "ยอดขายภาคอีสานทรงตัว ".repeat(150);
    const earlier: ModelPrompt = Array.from({ length: 12 }, (_, index): ModelPrompt => [
      { role: "user", content: [{ type: "text", text: question(index + 1) }] },
      { role: "assistant", content: [{ type: "text", text: `${index + 1} ${longReply}` }] },
    ]).flat();
    const current: ModelPrompt = [
      { role: "user", content: [{ type: "text", text: question(13) }] },
      { role: "assistant", content: [{ type: "tool-call", toolCallId: "now", toolName: "query_metric", input: BY_PROVINCE }] },
      { role: "tool", content: [{ type: "tool-result", toolCallId: "now", toolName: "query_metric", output: { type: "json", value: { ok: true, rows: Array.from({ length: ROWS }, (_, row) => ({ row })), summary: "ผลรอบนี้" } } }] },
    ];
    const prompt: ModelPrompt = [{ role: "system", content: "ระบบ" }, ...earlier, ...current];
    expect(historyTokens(earlier)).toBeGreaterThan(HISTORY_TOKEN_CEILING);

    const trimmed = trimmedHistory(prompt);
    const history = trimmed.slice(1, trimmed.length - current.length);
    expect(trimmed[0]).toEqual(prompt[0]);
    expect(trimmed.slice(-current.length)).toEqual(current);
    expect(historyTokens(history)).toBeLessThanOrEqual(HISTORY_TOKEN_CEILING);
    expect(history[0]?.role).toBe("user");
    expect(history.slice(-2)).toEqual(earlier.slice(-2));
    expect(history.length).toBeLessThan(earlier.length);
  });
});
