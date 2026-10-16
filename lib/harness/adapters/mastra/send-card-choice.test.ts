import { describe, expect, mock, setDefaultTimeout, test } from "bun:test";
import { ScriptedModel, type ScriptedStep } from "@/scripts/scripted-model";

setDefaultTimeout(30_000);

const scripted = new ScriptedModel();
mock.module("@/lib/server/models", () => scripted.modelsModule());

const { serveCopilot, LEARNING } = await import("./serve");
const { storedMessages } = await import("./history");
const { findUser } = await import("@/lib/data/entities/users");
const { liveAccessFor } = await import("@/lib/access/enforce");
const { shares } = await import("@/lib/server/share/shares");
const { addDays, businessToday } = await import("@/lib/data/dates");

const RUN_URL = "http://localhost/api/copilotkit/agent/winyu/run";
const REP = "u_krit";
const CEO = "u_thana";
const RSM = "u_anucha";
const KHON_KAEN_MONTHS = { metric: "net_sales_volume", dims: ["month", "province"], filters: { province: "ขอนแก่น" }, range: { from: "2026-09-01", to: "2026-10-31" }, grain: "month", compare: "target", limit: 10 };
const MY_AGENTS = { metric: "net_sales_volume", dims: ["agent"], filters: {}, period: "this_month", grain: "month", compare: "target", sort: "value_desc", limit: 10 };
const ONE_AGENT_VOLUME = { metric: "net_sales_volume", dims: ["agent"], filters: { agent: "ag_nea_02" }, period: "this_month", grain: "month", compare: "target", limit: 10 };
const ONE_AGENT_OVERDUE = { metric: "ar_overdue", dims: ["agent"], filters: { agent: "ag_nea_02" }, period: "this_month", grain: "month", compare: "prev_period", limit: 10 };
const SOUTH_AGENT_OVERDUE = { metric: "ar_overdue", dims: ["agent"], filters: { agent: "สงขลาทักษิณ เทรดดิ้ง" }, period: "this_month", grain: "month", compare: "none", limit: 10 };
const WARIN_OVERDUE = { metric: "ar_overdue", dims: ["agent"], filters: { agent: "ag_nea_06" }, period: "this_month", grain: "month", compare: "none", limit: 1 };
const CARD_LINE = /- (c[0-9a-z]+) · ([^\n]*)/g;

type Interrupt = { id: string; tool: string };
type RunFinished = { type?: string; outcome?: { type?: string; interrupts?: { id?: string; metadata?: { mastra?: { toolName?: string } } }[] } };
type Invocation = { toolName?: string; toolCallId?: string; state?: string; result?: { ok?: boolean; code?: string; error?: string; data?: { warning?: string | null } } };

function interruptsOf(sse: string): Interrupt[] {
  return sse.split("\n").flatMap((line) => {
    if (!line.startsWith("data:")) return [];
    const event = JSON.parse(line.slice("data:".length)) as RunFinished;
    if (event.type !== "RUN_FINISHED" || event.outcome?.type !== "interrupt") return [];
    return (event.outcome.interrupts ?? []).map((interrupt) => ({ id: interrupt.id ?? "", tool: interrupt.metadata?.mastra?.toolName ?? "" }));
  });
}

function accessOf(userId: string) {
  const found = findUser(userId);
  if (!found) throw new Error(`no ${userId}`);
  return liveAccessFor(found);
}

/** One chat thread of one person (the rep unless named), driven turn by turn with a scripted model. */
function conversation(name: string, userId = REP) {
  const threadId = `send-card-choice-${name}-${Date.now()}`;
  let lastMessage = { id: "", content: "" };
  const post = async (message: { id: string; content: string }, answer: { interruptId: string; approved: boolean } | null): Promise<Interrupt[]> => {
    const resume = answer ? { resume: [{ interruptId: answer.interruptId, status: "resolved", payload: { approved: answer.approved } }] } : {};
    const body = { threadId, runId: crypto.randomUUID(), state: {}, messages: [{ ...message, role: "user" }], tools: [], context: [], forwardedProps: {}, ...resume };
    const request = new Request(RUN_URL, { method: "POST", headers: { "content-type": "application/json", accept: "text/event-stream" }, body: JSON.stringify(body) });
    return interruptsOf(await (await serveCopilot(accessOf(userId), request, LEARNING)).text());
  };
  return {
    async ask(content: string, steps: readonly ScriptedStep[]): Promise<Interrupt[]> {
      scripted.script(steps);
      lastMessage = { id: crypto.randomUUID(), content };
      return post(lastMessage, null);
    },
    async answer(interrupt: Interrupt | undefined, approved: boolean): Promise<void> {
      scripted.script([{ text: approved ? "ส่งแล้วครับ" : "ยกเลิกแล้วครับ" }]);
      await post(lastMessage, { interruptId: interrupt?.id ?? "", approved });
    },
    async sendResults(): Promise<Invocation[]> {
      const stored = await storedMessages(threadId, userId);
      return stored.flatMap((message) => {
        const parts = (message.content as { parts?: { type?: string; toolInvocation?: Invocation }[] }).parts ?? [];
        return parts.flatMap((part) => (part.type === "tool-invocation" && part.toolInvocation?.toolName === "send_card" ? [part.toolInvocation] : []));
      });
    },
  };
}

function lastSent(senderId = REP) {
  return shares().where((matter) => matter.senderId === senderId).sort((left, right) => right.at.localeCompare(left.at))[0];
}

function sentCount(senderId = REP): number {
  return shares().where((matter) => matter.senderId === senderId).length;
}

/** The cards the last model call was told are on screen, as ref and line, read from its prompt. */
function cardsInPrompt(): { ref: string; line: string }[] {
  const prompt = JSON.parse(JSON.stringify(scripted.model.doStreamCalls.at(-1)?.prompt ?? [])) as { role: string; content: unknown }[];
  const text = prompt.map((message) => (typeof message.content === "string" ? message.content : JSON.stringify(message.content))).join("\n");
  return [...text.matchAll(CARD_LINE)].map((match) => ({ ref: match[1], line: match[2] }));
}

describe("ส่งการ์ด sends the card the person means, never a lookup the reply made on the way", () => {
  test("a collection send with only the agent's master-data record on screen raises nothing and sends nothing; once the overdue card is drawn, that card goes", async () => {
    const chat = conversation("collect", CEO);
    const before = sentCount(CEO);
    const collect = await chat.ask("หนี้ของสงขลาทักษิณ เทรดดิ้ง ฝากคนที่ดูแลเอเย่นต์เจ้านี้ไปตามเก็บให้ที", [
      { call: "describe_entity", args: { query: "สงขลาทักษิณ เทรดดิ้ง", kind: "agent" } },
      { call: "send_card", args: { to: ["u_arm"], ask: "ไปตามเก็บหนี้ของสงขลาทักษิณ เทรดดิ้ง" } },
      { text: "ยังไม่มีการ์ดหนี้" },
    ]);
    expect(collect).toEqual([]);
    expect(sentCount(CEO)).toBe(before);
    expect((await chat.sendResults()).at(-1)?.result?.code).toBe("NO_CARD");
    const drawn = await chat.ask("ดึงหนี้เจ้านี้มาแล้วส่งให้คนดูแลไปตามเก็บ", [
      { call: "query_metric", args: SOUTH_AGENT_OVERDUE },
      { call: "send_card", args: { to: ["u_arm"], ask: "ไปตามเก็บหนี้ของสงขลาทักษิณ เทรดดิ้ง" } },
      { text: "ส่งแล้ว" },
    ]);
    expect(drawn.map((interrupt) => interrupt.tool)).toEqual(["send_card"]);
    await chat.answer(drawn[0], true);
    expect(lastSent(CEO)?.card.reads.map((read) => read.tool)).toEqual(["query_metric"]);
    expect(lastSent(CEO)?.card.reads[0]?.input).toMatchObject({ metric: "ar_overdue" });
  });

  test("an owner card and the rep's own HR profile drawn on send turns are never sent: the agents card goes", async () => {
    const chat = conversation("owner-hr");
    await chat.ask("เดือนนี้ผมขายได้กี่เปอร์เซ็นต์ของเป้าทั้งเดือนแล้ว", [{ call: "query_metric", args: MY_AGENTS }, { text: "ยังตามหลังเป้า" }]);
    const ownerTurn = await chat.ask("ส่งการ์ดยอดขายเข้าอันแรกไปให้พี่อนุชาหน่อย", [
      { call: "resolve_owner", args: { metric: "net_sales_volume", dims: { region: "northeast" } } },
      { call: "send_card", args: { to: ["u_anucha"], ask: "ฝากดูยอดเอเย่นต์ผม", intent: "fyi" } },
      { text: "ส่งแล้ว" },
    ]);
    expect(ownerTurn.map((interrupt) => interrupt.tool)).toEqual(["send_card"]);
    await chat.answer(ownerTurn[0], true);
    expect(lastSent()?.card.reads.map((read) => read.tool)).toEqual(["query_metric"]);
    const hrTurn = await chat.ask("เอาการ์ดเอเย่นต์ 4 รายข้างบนส่งให้หัวหน้าผมดูหน่อย", [
      { call: "get_person", args: { name: "กฤต จันทร์เสน", id: null } },
      { call: "send_card", args: { to: ["u_anucha"], ask: "ฝากดูเอเย่นต์ 4 ราย", intent: "fyi" } },
      { text: "ส่งแล้ว" },
    ]);
    await chat.answer(hrTurn[0], true);
    expect(lastSent()?.card.reads.map((read) => read.tool)).toEqual(["query_metric"]);
    expect(lastSent()?.card.reads[0]?.input).toMatchObject({ dims: ["agent"] });
  });

  test("with two cards on screen and none named, nothing is raised and nothing is sent; naming the volume card sends it, not the newer overdue card", async () => {
    const chat = conversation("two-cards");
    await chat.ask("ขอยอดขายเข้ากับหนี้ค้างของอีสานรุ่งโรจน์", [
      { call: "query_metric", args: ONE_AGENT_VOLUME },
      { call: "query_metric", args: ONE_AGENT_OVERDUE },
      { text: "ยอดขายเข้าต่ำกว่าเป้า" },
    ]);
    const before = sentCount();
    const unnamed = await chat.ask("ส่งการ์ดยอดขายเข้าใบนี้ให้คุณอนุชาเลย", [{ call: "send_card", args: { to: ["u_anucha"], ask: "ดูยอดขายเข้าของอีสานรุ่งโรจน์", intent: "fyi" } }, { text: "ใบไหนครับ" }]);
    expect(unnamed).toEqual([]);
    expect(sentCount()).toBe(before);
    expect((await chat.sendResults()).at(-1)?.result?.code).toBe("CARD_UNCLEAR");
    const listed = cardsInPrompt();
    const volume = listed.find((card) => card.line.startsWith("ปริมาณขายเข้า"));
    expect(listed.map((card) => card.line.split(" · ")[0])).toEqual(["ปริมาณขายเข้า (Sell-in)", "ยอดค้างชำระเกินกำหนด"]);
    const named = await chat.ask("ส่งการ์ดปริมาณขายเข้าของอีสานรุ่งโรจน์ให้คุณอนุชาดู", [{ call: "send_card", args: { to: ["u_anucha"], ask: "ดูปริมาณขายเข้าของอีสานรุ่งโรจน์", intent: "fyi", cardRef: volume?.ref } }, { text: "ส่งแล้ว" }]);
    expect(named.map((interrupt) => interrupt.tool)).toEqual(["send_card"]);
    await chat.answer(named[0], true);
    expect(lastSent()?.card.reads[0]?.input).toMatchObject({ metric: "net_sales_volume" });
  });

  test("a card named by its ref is the one sent, even when the same reply drew another card", async () => {
    const chat = conversation("named");
    await chat.ask("ยอดเอเย่นต์ผมเดือนนี้", [{ call: "query_metric", args: MY_AGENTS }, { text: "ยังตามหลังเป้า" }]);
    const agents = cardsInPrompt();
    await chat.ask("ขอยอดขอนแก่นด้วย", [{ call: "query_metric", args: KHON_KAEN_MONTHS }, { text: "ขอนแก่นต่ำกว่าเป้า" }]);
    const agentsRef = cardsInPrompt().find((card) => card.line.includes("รายเอเย่นต์"))?.ref;
    expect(agents).toEqual([]);
    expect(agentsRef).toBeDefined();
    const asked = await chat.ask("ขอยอดอีสานรุ่งโรจน์ แล้วส่งการ์ดเอเย่นต์ใบแรกให้พี่อนุชา", [
      { call: "query_metric", args: ONE_AGENT_VOLUME },
      { call: "send_card", args: { to: ["u_anucha"], ask: "ฝากดูเอเย่นต์ผม", intent: "fyi", cardRef: agentsRef } },
      { text: "ส่งแล้ว" },
    ]);
    await chat.answer(asked[0], true);
    expect(lastSent()?.card.reads[0]?.input).toMatchObject({ dims: ["agent"], filters: {} });
  });

  test("the deadline the sender wrote is the matter's due day: ภายในพรุ่งนี้ is tomorrow, not today (AI-120)", async () => {
    const chat = conversation("deadline", RSM);
    await chat.ask("วารินพาณิชย์ค้างเงินเราเกินกำหนดอยู่กี่บาท", [{ call: "query_metric", args: WARIN_OVERDUE }, { text: "วารินพาณิชย์ค้างอยู่" }]);
    const ask = "โทรตามหนี้วารินพาณิชย์แล้วตอบกลับมา";
    const asked = await chat.ask("โทรตามหนี้วารินพาณิชย์ภายในพรุ่งนี้ แล้วตอบกลับมาว่าได้แผนชำระอย่างไร", [{ call: "send_card", args: { to: ["u_krit"], ask } }, { text: "ส่งแล้ว" }]);
    await chat.answer(asked[0], true);
    const matter = lastSent(RSM);
    expect(matter?.ask).toBe(ask);
    expect({ urgency: matter?.urgency, due: (matter as { due?: string | null } | undefined)?.due }).toEqual({ urgency: "this_week", due: addDays(businessToday(), 1) });
  });

  test("an ask the card refutes is refused with the card's figure first; asked again, it is raised and the sheet's warning goes with it", async () => {
    const chat = conversation("premise");
    await chat.ask("ยอดเอเย่นต์ผมเดือนนี้เทียบเป้า", [{ call: "query_metric", args: MY_AGENTS }, { text: "ยังตามหลังเป้า" }]);
    const claim = { to: ["u_anucha"], ask: "ทุกเจ้าทำเกินเป้าแล้ว", intent: "fyi" };
    const first = await chat.ask("เอาการ์ดเอเย่นต์ข้างบนส่งให้หัวหน้าผม บอกเขาว่าทุกเจ้าทำเกินเป้าแล้ว", [{ call: "get_person", args: { name: "อนุชา", id: null } }, { call: "send_card", args: claim }, { text: "การ์ดแสดงต่ำกว่าเป้า" }]);
    expect(first).toEqual([]);
    const refused = (await chat.sendResults()).at(-1)?.result;
    expect(refused?.code).toBe("ASK_CONTRADICTS_CARD");
    expect(refused?.error ?? "").toMatch(/\d+\.\d% ของเป้า/);
    const again = await chat.ask("รู้แล้ว ส่งไปเลยตามนั้น", [{ call: "send_card", args: claim }, { text: "ส่งแล้ว" }]);
    expect(again.map((interrupt) => interrupt.tool)).toEqual(["send_card"]);
    await chat.answer(again[0], true);
    const sent = (await chat.sendResults()).at(-1)?.result;
    expect(sent?.ok).toBe(true);
    expect(sent?.data?.warning ?? "").toMatch(/^ข้อความบอกว่าถึงหรือเกินเป้า แต่การ์ดแสดง \d+\.\d% ของเป้า$/);
  });
});
