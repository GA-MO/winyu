import { afterAll, beforeAll, describe, expect, mock, setDefaultTimeout, test } from "bun:test";
import { ScriptedModel } from "@/scripts/scripted-model";

setDefaultTimeout(30_000);

const scripted = new ScriptedModel();
mock.module("@/lib/server/models", () => scripted.modelsModule());

const { SIMULATED, startChannelHarness } = await import("@/scripts/channel-harness");
const { linkIdentity, pendingAttempt, identityKey } = await import("@/lib/server/identity");
const { auditLog } = await import("@/lib/server/audit");
const { watchesOf } = await import("@/lib/server/watches");
const { TEAMS_APPROVE } = await import("./teams-card");

const BY_REGION = { metric: "net_sales_value", dims: ["region"], grain: "month", range: { from: "2026-09-01", to: "2026-09-22" }, compare: "target", filters: {}, sort: "value_desc", limit: 10 };
const WATCH = {
  condition: { kind: "below", value: 10 },
  query: { where: null, filters: { dc: "dc_lamphun" }, range: { to: "2026-09-22", from: "2026-09-22" }, metric: "days_of_cover", sort: "value_asc", grain: "day", limit: 10, dims: ["dc"], compare: "none" },
  title: "สต๊อกพอขาย ศูนย์กระจายสินค้าลำพูน ต่ำกว่า 10 วัน",
};
const CEO = { oid: "teams-oid-thana", name: "ธนา" };
const KRIT = { oid: "teams-oid-krit", name: "กฤษณ์" };
const WEE = { oid: "teams-oid-wee", name: "วีระ" };
const STRANGER = { oid: "teams-oid-stranger", name: "Guest" };

type Activity = { type?: string; text?: string; attachments?: { contentType: string; content: { body: unknown[]; actions: { type: string; title: string; url?: string; data?: { actionId: string; value: string } }[] } }[] };

const harness = startChannelHarness();
const sim = harness.simulator;

function only(sent: { body: unknown; kind: string }[]): Activity {
  const messages = sent.filter((entry) => entry.kind === "message");
  expect(messages).toHaveLength(1);
  return messages[0].body as Activity;
}

function cardOf(activity: Activity) {
  const attachment = activity.attachments?.[0];
  expect(attachment?.contentType).toBe("application/vnd.microsoft.card.adaptive");
  return attachment?.content ?? { body: [], actions: [] };
}

function entra(oid: string) {
  return { provider: "entra" as const, tenant: SIMULATED.teams.tenantId, subject: oid, email: null, name: null };
}

beforeAll(() => {
  const at = new Date().toISOString();
  linkIdentity(entra(CEO.oid), "u_thana", "test", at);
  linkIdentity(entra(KRIT.oid), "u_krit", "test", at);
  linkIdentity(entra(WEE.oid), "u_wee", "test", at);
});

afterAll(() => harness.stop());

describe("Teams channel (Bot Framework simulator)", () => {
  test("the CEO's private question comes back as one Adaptive Card: headline, coloured change, five rows, the rest and the thread in the web", async () => {
    scripted.script([{ call: "query_metric", args: BY_REGION }, { text: "ภาคอีสานต่ำกว่าเป้า" }]);
    const delivered = await sim.teamsSay(CEO, "ยอดขายแยกตามภาคเดือนนี้");
    expect(delivered.status).toBe(200);
    const card = cardOf(only(delivered.sent));
    const json = JSON.stringify(card);
    expect(json).toContain("ภาคอีสานต่ำกว่าเป้า");
    expect(json).toContain("1,110.2 ล้านบาท");
    expect(json).toContain('"color":"Attention"');
    expect(json).toContain("และอีก 1 รายการ ดูต่อในเว็บ");
    expect(json).not.toContain("ภาคเหนือ");
    expect(card.actions.find((action) => action.type === "Action.OpenUrl")?.url).toStartWith(`${SIMULATED.web}/c/teams-`);
    const audited = auditLog().where((entry) => entry.userId === "u_thana" && entry.tool === "query_metric" && entry.initiator === "teams");
    expect(audited.length).toBeGreaterThan(0);
  });

  test("u_krit asking the same thing sees only ภาคอีสาน", async () => {
    scripted.script([{ call: "query_metric", args: BY_REGION }, { text: "ยอดภาคอีสาน" }]);
    const json = JSON.stringify(cardOf(only((await sim.teamsSay(KRIT, "ยอดขายแยกตามภาคเดือนนี้")).sent)));
    expect(json).toContain("232.5 ล้านบาท");
    for (const other of ["กรุงเทพฯ", "ภาคตะวันออก", "ภาคกลาง", "ภาคใต้", "ภาคเหนือ", "1,110.2"]) expect(json).not.toContain(other);
  });

  test("an Entra account nobody linked is told to ask IT and nothing else, and IT sees the attempt", async () => {
    const before = auditLog().all().length;
    scripted.script([{ call: "query_metric", args: BY_REGION }, { text: "ไม่ควรตอบ" }]);
    const activity = only((await sim.teamsSay(STRANGER, "ยอดขายแยกตามภาค")).sent);
    expect(activity.text).toContain("ฝ่าย IT");
    expect(activity.attachments ?? []).toHaveLength(0);
    expect(auditLog().all().length).toBe(before);
    expect(pendingAttempt(identityKey(entra(STRANGER.oid)))?.provider).toBe("entra");
  });

  test("a mention in a group chat gets no data, only the pointer to a private chat", async () => {
    const before = auditLog().all().length;
    const activity = only((await sim.teamsSay({ ...CEO, group: true }, "ยอดขายแยกตามภาค")).sent);
    expect(activity.text).toContain("แชทส่วนตัว");
    expect(auditLog().all().length).toBe(before);
  });

  test("a write shows approve and reject; approve runs it once through the ledger, a second press is refused", async () => {
    const before = watchesOf("u_wee").length;
    const startedAt = new Date().toISOString();
    scripted.script([{ call: "watch_metric", args: WATCH }]);
    const asking = cardOf(only((await sim.teamsSay(WEE, "เตือนฉันถ้าสต๊อกดีซีลำพูนพอขายต่ำกว่า 10 วัน")).sent));
    const approve = asking.actions.find((action) => action.data?.actionId === TEAMS_APPROVE);
    expect(approve?.title).toBe("อนุมัติ");
    expect(watchesOf("u_wee")).toHaveLength(before);

    scripted.script([{ text: "ตั้งการเฝ้าดูแล้ว" }]);
    const approved = cardOf(only((await sim.teamsPress(WEE, TEAMS_APPROVE, approve?.data?.value ?? "")).sent));
    expect(JSON.stringify(approved)).toContain("ตั้งการเฝ้าดูแล้ว");
    expect(watchesOf("u_wee")).toHaveLength(before + 1);
    expect(auditLog().where((entry) => entry.userId === "u_wee" && entry.tool === "watch_metric" && entry.at >= startedAt).map((entry) => entry.initiator)).toEqual(["teams"]);

    const replayed = only((await sim.teamsPress(WEE, TEAMS_APPROVE, approve?.data?.value ?? "")).sent);
    expect(replayed.text).toContain("ใช้ไปแล้ว");
    expect(watchesOf("u_wee")).toHaveLength(before + 1);
  });

  test("an activity whose token does not match it is refused before anything runs", async () => {
    const before = sim.sent.length;
    const { activity, token } = sim.signedTeams(CEO, { text: "ยอดขาย" });
    const post = (headers: Record<string, string>, body: unknown) => fetch(`${harness.winyuOrigin}/api/channels/teams`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
    expect((await post({}, activity)).status).toBe(401);
    expect((await post({ authorization: `Bearer ${token}` }, { ...activity, serviceUrl: "https://evil.example.com/" })).status).toBe(401);
    expect((await post({ authorization: `Bearer ${token.slice(0, -4)}AAAA` }, activity)).status).toBe(401);
    expect(sim.sent.length).toBe(before);
  });

  test("without the simulator the adapter's Microsoft JWT check refuses an unsigned activity", async () => {
    const simulator = process.env.TEAMS_SIMULATOR_URL;
    delete process.env.TEAMS_SIMULATOR_URL;
    try {
      const { activity } = sim.signedTeams(CEO, { text: "ยอดขาย" });
      const response = await fetch(`${harness.winyuOrigin}/api/channels/teams`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(activity) });
      expect(response.status).toBe(401);
    } finally {
      process.env.TEAMS_SIMULATOR_URL = simulator;
    }
  });
});
