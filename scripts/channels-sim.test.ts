import { afterAll, describe, expect, mock, setDefaultTimeout, test } from "bun:test";
import { ScriptedModel } from "@/scripts/scripted-model";
import type { Sent } from "./channels-sim";

setDefaultTimeout(30_000);

const scripted = new ScriptedModel();
mock.module("@/lib/server/models", () => scripted.modelsModule());

const { startChannelHarness } = await import("@/scripts/channel-harness");

const STRANGER_OID = "0e0e0e0e-0000-4000-8000-00000000c0de";
const STRANGER_LINE = "U0000000000000000000000000c0de01";
const POLL_MS = 50;
const WAIT_MS = 10_000;

const harness = startChannelHarness();
const origin = harness.simulator.origin;

afterAll(() => harness.stop());

async function feed(after: number): Promise<Sent[]> {
  const response = await fetch(`${origin}/ui/feed?after=${after}`);
  return ((await response.json()) as { sent: Sent[] }).sent;
}

async function threadUntil(thread: string, after: number, kind: string): Promise<Sent[]> {
  const deadline = Date.now() + WAIT_MS;
  for (;;) {
    const entries = (await feed(after)).filter((entry) => entry.thread === thread);
    if (entries.some((entry) => entry.kind === kind) || Date.now() > deadline) return entries;
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

function post(path: string, body: unknown): Promise<Response> {
  return fetch(`${origin}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

function lastSeq(): number {
  return harness.simulator.sent.at(-1)?.seq ?? 0;
}

describe("the simulator's control API", () => {
  test("a Teams say answers 202 at once, then the feed shows what the person wrote and Winyu's reply on their conversation", async () => {
    const after = lastSeq();
    const accepted = await post("/ui/teams/say", { oid: STRANGER_OID, name: "Guest", text: "ยอดขายเดือนนี้" });
    expect(accepted.status).toBe(202);
    const entries = await threadUntil(`a:dm-${STRANGER_OID}`, after, "message");
    expect(entries[0]).toMatchObject({ channel: "teams", kind: "inbound", body: { name: "Guest", text: "ยอดขายเดือนนี้" } });
    expect(entries.map((entry) => entry.kind)).toContain("message");
    expect(entries.every((entry) => entry.seq > after)).toBe(true);
  });

  test("a LINE say lands its reply on the sender's thread, though LINE addressed it by reply token", async () => {
    const after = lastSeq();
    expect((await post("/ui/line/say", { lineUserId: STRANGER_LINE, name: "Nok", text: "สวัสดี" })).status).toBe(202);
    const entries = await threadUntil(STRANGER_LINE, after, "reply");
    expect(entries[0]).toMatchObject({ channel: "line", kind: "inbound", body: { name: "Nok", text: "สวัสดี" } });
    const reply = entries.find((entry) => entry.kind === "reply");
    expect(reply?.to).not.toBe(STRANGER_LINE);
    expect(reply?.thread).toBe(STRANGER_LINE);
  });

  test("a request without the fields it needs is refused", async () => {
    expect((await post("/ui/teams/say", { name: "Guest" })).status).toBe(400);
    expect((await post("/ui/line/press", { lineUserId: STRANGER_LINE })).status).toBe(400);
  });
});
