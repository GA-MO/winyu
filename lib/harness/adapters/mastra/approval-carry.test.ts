import { describe, expect, mock, setDefaultTimeout, test } from "bun:test";
import { ScriptedModel } from "@/scripts/scripted-model";

setDefaultTimeout(30_000);

const scripted = new ScriptedModel();
mock.module("@/lib/server/models", () => scripted.modelsModule());

const { serveCopilot, LEARNING } = await import("./serve");
const { findUser } = await import("@/lib/data/entities/users");
const { liveAccessFor } = await import("@/lib/access/enforce");
const { shares } = await import("@/lib/server/share/shares");

const RUN_URL = "http://localhost/api/copilotkit/agent/winyu/run";
const BY_REGION = { metric: "net_sales_value", dims: ["region"], grain: "month", range: { from: "2026-09-01", to: "2026-09-22" }, compare: "target", filters: {}, sort: "value_desc", limit: 10 };
const OWNER_ARGS = { metric: "net_sales_value", dims: { region: "northeast" } };
const SEND_ARGS = { to: ["u_anucha"], ask: "ช่วยดูยอดภาคอีสาน" };
const ASKS = ["ช่วยดูยอดภาคอีสาน การ์ดที่ถาม", "ช่วยดูยอดภาคอีสาน คำถามนี้"];
const OWNER_CARD = [
  { id: "root", component: "Card", title: "ผู้รับผิดชอบ", children: ["owner"] },
  { id: "owner", component: "Person", name: { path: "/resolve_owner/data/nameTh" }, role: { path: "/resolve_owner/data/title" } },
];
const CARD_REPLY = `ส่งแล้ว\n\`\`\`a2ui\n${OWNER_CARD.map((line) => JSON.stringify(line)).join("\n")}\n\`\`\`\n`;

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

function sentLast(ask: string) {
  return shares().where((matter) => matter.senderId === "u_thana" && matter.ask === ask).sort((left, right) => left.at.localeCompare(right.at)).at(-1);
}

async function askThenApprove(threadId: string, reply: string, args: Record<string, unknown> = SEND_ARGS): Promise<SseEvent[]> {
  const message = { id: crypto.randomUUID(), content: "ส่งเรื่องนี้ให้ผู้จัดการขายภาคอีสาน" };
  scripted.script([{ call: "query_metric", args: BY_REGION }, { call: "resolve_owner", args: OWNER_ARGS }, { call: "send_card", args }]);
  const interrupt = interruptOf(await run(threadId, message, null));
  scripted.script([{ text: reply }]);
  return run(threadId, message, interrupt);
}

describe("the run that answers an approval continues the asking run", () => {
  test("its card may bind a read result the asking run returned", async () => {
    const events = await askThenApprove(`carry-card-${Date.now()}`, CARD_REPLY);
    expect(finalCardIds(events)).toEqual(["root", "owner"]);
  });

  test("the matter it sends carries the card the asking run drew, not the owner lookup on the way to the recipient", async () => {
    const threadId = `carry-card-sent-${Date.now()}`;
    const ask = ASKS.shift() ?? "ช่วยดูยอดภาคอีสาน";
    await askThenApprove(threadId, "ส่งแล้ว", { ...SEND_ARGS, ask });
    const matter = sentLast(ask);
    expect(matter?.card.reads.map((read) => read.tool)).toEqual(["query_metric"]);
    expect(matter?.card.reads[0]?.input).toMatchObject({ metric: "net_sales_value", dims: ["region"] });
    expect(matter?.path.map((hop) => hop.userId)).toEqual(["u_anucha"]);
  });

  test("the matter's card and question are this exchange's, not an earlier answer about something else", async () => {
    const threadId = `carry-question-${Date.now()}`;
    const ask = ASKS.shift() ?? "ช่วยดูยอดภาคอีสาน";
    const AR = { ...BY_REGION, metric: "ar_overdue", compare: "prev_period" };
    scripted.script([{ call: "query_metric", args: AR }, { text: "อุบลศรีสุขค้างชำระมากที่สุด" }]);
    await run(threadId, { id: crypto.randomUUID(), content: "ลูกหนี้ค้างชำระแยกตามภาค" }, null);
    await askThenApprove(threadId, "ส่งแล้ว", { ...SEND_ARGS, ask });
    const matter = sentLast(ask);
    expect(matter?.question).toBe("ส่งเรื่องนี้ให้ผู้จัดการขายภาคอีสาน");
    expect(matter?.card.reads[0]?.input).toMatchObject({ metric: "net_sales_value" });
  });

  test("the matter is as urgent as the person said, not as the model guessed", async () => {
    const threadId = `carry-urgency-${Date.now()}`;
    const calm = "ไม่ด่วน ดูภายในสัปดาห์";
    const message = { id: crypto.randomUUID(), content: "ฝากผู้จัดการขายภาคอีสานดูเรื่องนี้ภายในสัปดาห์นี้" };
    scripted.script([{ call: "query_metric", args: BY_REGION }, { call: "send_card", args: { ...SEND_ARGS, ask: calm, urgency: "now" } }]);
    const interrupt = interruptOf(await run(threadId, message, null));
    scripted.script([{ text: "ส่งแล้ว" }]);
    await run(threadId, message, interrupt);
    expect(sentLast(calm)?.urgency).toBe("today");

    const urgentThread = `carry-urgent-${Date.now()}`;
    const urgent = "ด่วน ดูวันนี้";
    const asked = { id: crypto.randomUUID(), content: "ส่งเรื่องนี้ให้ผู้จัดการขายภาคอีสาน ด่วน" };
    scripted.script([{ call: "query_metric", args: BY_REGION }, { call: "send_card", args: { ...SEND_ARGS, ask: urgent } }]);
    const urgentInterrupt = interruptOf(await run(urgentThread, asked, null));
    scripted.script([{ text: "ส่งแล้ว" }]);
    await run(urgentThread, asked, urgentInterrupt);
    expect(sentLast(urgent)?.urgency).toBe("now");
  });
});
