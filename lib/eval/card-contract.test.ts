import { describe, expect, test } from "bun:test";
import type { Spec } from "vexa/protocol";
import { accessFor } from "@/lib/access/policies";
import { findUser } from "@/lib/data/entities/users";
import { runWithAccess } from "@/lib/server/request-context";
import { handlerFor } from "@/lib/server/agent/handler";
import { SCRIPTED_CASES, type EvalCase } from "./cases";
import { checkTurn, type Turn } from "./check-cards";

const CHAT_URL = "http://localhost:3100/api/chat";
const DATA_PREFIX = "data: ";
const DONE = "data: [DONE]";

type Part = Record<string, unknown>;

function partsOf(raw: string): Part[] {
  return raw
    .split("\n")
    .filter((line) => line.startsWith(DATA_PREFIX) && !line.startsWith(DONE))
    .map((line) => JSON.parse(line.slice(DATA_PREFIX.length)) as Part);
}

function specOf(parts: Part[]): Spec | null {
  const spec: Record<string, unknown> = {};
  let seen = false;
  for (const part of parts) {
    if (part.type !== "data-spec") continue;
    const data = part.data as { type?: string; patch?: { op?: string; path?: string; value?: unknown } };
    if (data?.type !== "patch" || !data.patch || (data.patch.op !== "add" && data.patch.op !== "replace")) continue;
    const segments = String(data.patch.path ?? "").split("/").filter(Boolean);
    if (segments.length === 0) continue;
    let cursor = spec;
    for (const segment of segments.slice(0, -1)) {
      if (typeof cursor[segment] !== "object" || cursor[segment] === null) cursor[segment] = {};
      cursor = cursor[segment] as Record<string, unknown>;
    }
    cursor[segments[segments.length - 1]] = data.patch.value;
    seen = true;
  }
  return seen ? (spec as unknown as Spec) : null;
}

async function ask(testCase: EvalCase): Promise<Turn> {
  const user = findUser(testCase.userId);
  if (!user) throw new Error(`no user ${testCase.userId}`);
  const access = accessFor(user);
  const body = { id: `contract-${testCase.id}`, model: "mock", messages: [{ id: "u1", role: "user", parts: [{ type: "text", text: testCase.prompt }] }] };
  const request = new Request(CHAT_URL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const response = await runWithAccess(access, () => handlerFor(access).POST(request));
  const parts = partsOf(await response.text());
  return {
    text: parts.filter((part) => part.type === "text-delta").map((part) => String(part.delta ?? "")).join(""),
    spec: specOf(parts),
    toolOutputs: parts.filter((part) => part.type === "tool-output-available").map((part) => part.output as Record<string, unknown>),
    toolInputs: parts.filter((part) => part.type === "tool-input-available").map((part) => ({ tool: String(part.toolName), input: part.input })),
  };
}

describe("card contract", () => {
  for (const testCase of SCRIPTED_CASES) {
    test(`${testCase.id} passes the card contract`, async () => {
      const failures = checkTurn(await ask(testCase), testCase).filter((result) => !result.ok);
      expect(failures.map((failure) => `${failure.id}: ${failure.detail}`)).toEqual([]);
    });
  }
});
