import { describe, expect, mock, setDefaultTimeout, test } from "bun:test";
import { ScriptedModel } from "@/scripts/scripted-model";

setDefaultTimeout(30_000);

const scripted = new ScriptedModel();
mock.module("@/lib/server/models", () => scripted.modelsModule());

const { serveCopilot, LEARNING } = await import("./serve");
const { findUser } = await import("@/lib/data/entities/users");
const { liveAccessFor } = await import("@/lib/access/enforce");
const { packets } = await import("@/lib/server/agent/collections");

const RUN_URL = "http://localhost/api/copilotkit/agent/winyu/run";
const BY_REGION = { metric: "net_sales_value", dims: ["region"], grain: "month", range: { from: "2026-09-01", to: "2026-09-22" }, compare: "target", filters: {}, sort: "value_desc", limit: 10 };
const OWNER_ARGS = { metric: "net_sales_value", dims: { region: "northeast" } };
const HANDOFF_ARGS = { toUserId: "u_anucha", title: "ยอดภาคอีสานต่ำกว่าเป้า", ask: "ช่วยดูยอดภาคอีสาน", urgency: "medium", evidence: [], alertIds: [] };
const OWNER_CARD = [
  { id: "root", component: "Card", title: "ผู้รับผิดชอบ", children: ["owner"] },
  { id: "owner", component: "Person", name: { path: "/resolve_owner/data/nameTh" }, role: { path: "/resolve_owner/data/title" } },
];
const CARD_REPLY = `ส่งงานแล้ว\n\`\`\`a2ui\n${OWNER_CARD.map((line) => JSON.stringify(line)).join("\n")}\n\`\`\`\n`;

type Interrupt = { id?: string };
type SseEvent = { type?: string; content?: { components?: { id: string }[]; done?: boolean }; outcome?: { type?: string; interrupts?: Interrupt[] } };

function eventsOf(sse: string): SseEvent[] {
  return sse.split("\n").flatMap((line) => (line.startsWith("data:") ? [JSON.parse(line.slice("data:".length)) as SseEvent] : []));
}

function access() {
  const ceo = findUser("u_thana");
  if (!ceo) throw new Error("no u_thana");
  return liveAccessFor(ceo);
}

async function run(threadId: string, message: { id: string; content: string }, resume: string | null): Promise<SseEvent[]> {
  const body = { threadId, runId: crypto.randomUUID(), state: {}, messages: [{ ...message, role: "user" }], tools: [], context: [], forwardedProps: {}, ...(resume ? { resume: [{ interruptId: resume, status: "resolved", payload: { approved: true } }] } : {}) };
  const request = new Request(RUN_URL, { method: "POST", headers: { "content-type": "application/json", accept: "text/event-stream" }, body: JSON.stringify(body) });
  return eventsOf(await (await serveCopilot(access(), request, LEARNING)).text());
}

function interruptOf(events: readonly SseEvent[]): string {
  const finished = events.find((event) => event.type === "RUN_FINISHED" && event.outcome?.type === "interrupt");
  const id = finished?.outcome?.interrupts?.[0]?.id;
  if (!id) throw new Error("the asking run raised no approval");
  return id;
}

function finalCardIds(events: readonly SseEvent[]): string[] {
  const done = events.filter((event) => event.type === "ACTIVITY_SNAPSHOT" && event.content?.done);
  return done.at(-1)?.content?.components?.map((component) => component.id) ?? [];
}

async function askThenApprove(threadId: string, reply: string): Promise<SseEvent[]> {
  const message = { id: crypto.randomUUID(), content: "ส่งเรื่องนี้ให้ผู้จัดการขายภาคอีสาน" };
  scripted.script([{ call: "query_metric", args: BY_REGION }, { call: "resolve_owner", args: OWNER_ARGS }, { call: "create_handoff", args: HANDOFF_ARGS }]);
  const interrupt = interruptOf(await run(threadId, message, null));
  scripted.script([{ text: reply }]);
  return run(threadId, message, interrupt);
}

describe("the run that answers an approval continues the asking run", () => {
  test("its card may bind a read result the asking run returned", async () => {
    const events = await askThenApprove(`carry-card-${Date.now()}`, CARD_REPLY);
    expect(finalCardIds(events)).toEqual(["root", "owner"]);
  });

  test("the handoff it carries out keeps the queries the asking run ran as evidence", async () => {
    const threadId = `carry-evidence-${Date.now()}`;
    await askThenApprove(threadId, "ส่งงานแล้ว");
    const sent = packets().where((packet) => packet.fromUserId === "u_thana" && packet.title === HANDOFF_ARGS.title);
    const packet = sent.at(-1);
    expect(packet?.evidence.map((query) => query.metric)).toEqual(["net_sales_value"]);
  });

  test("the handoff's digest carries this question, not an earlier answer about something else", async () => {
    const threadId = `carry-digest-${Date.now()}`;
    const AR = { ...BY_REGION, metric: "ar_overdue", compare: "prev_period" };
    scripted.script([{ call: "query_metric", args: AR }, { text: "อุบลศรีสุขค้างชำระมากที่สุด" }]);
    await run(threadId, { id: crypto.randomUUID(), content: "ลูกหนี้ค้างชำระแยกตามภาค" }, null);
    await askThenApprove(threadId, "ส่งงานแล้ว");
    const packet = packets().where((sent) => sent.fromUserId === "u_thana" && sent.title === HANDOFF_ARGS.title).at(-1);
    expect(packet?.conversationDigest).toContain("ส่งเรื่องนี้ให้ผู้จัดการขายภาคอีสาน");
    expect(packet?.conversationDigest).not.toContain("อุบลศรีสุข");
  });

  test("the handoff is as urgent as the person said, not as the model guessed", async () => {
    const threadId = `carry-urgency-${Date.now()}`;
    const title = `ไม่ด่วน ${threadId}`;
    const message = { id: crypto.randomUUID(), content: "ฝากผู้จัดการขายภาคอีสานดูเรื่องนี้ภายในสัปดาห์นี้" };
    scripted.script([{ call: "create_handoff", args: { ...HANDOFF_ARGS, title, urgency: "high" } }]);
    const interrupt = interruptOf(await run(threadId, message, null));
    scripted.script([{ text: "ส่งงานแล้ว" }]);
    await run(threadId, message, interrupt);
    expect(packets().where((packet) => packet.title === title).map((packet) => packet.urgency)).toEqual(["medium"]);
  });
});
