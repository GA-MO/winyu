import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, mock, setDefaultTimeout, test } from "bun:test";
import { ScriptedModel } from "@/scripts/scripted-model";

setDefaultTimeout(30_000);

const scripted = new ScriptedModel();
mock.module("@/lib/server/models", () => scripted.modelsModule());

const { SIMULATED, startChannelHarness } = await import("@/scripts/channel-harness");
const { linkIdentity, pendingAttempt, identityKey } = await import("@/lib/server/identity");
const { auditLog } = await import("@/lib/server/audit");
const { threads } = await import("@/lib/server/threads-read");
const { teamsConversationOf } = await import("./teams-conversations");
const { TH } = await import("@/lib/i18n/th");

const CEO = { oid: "teams-oid-thana", name: "ธนา" };
const STRANGER = { oid: "teams-oid-stranger", name: "Guest" };
const GROUP_STRANGER = { oid: "teams-oid-group-stranger", name: "Guest in a group", group: true };

type Activity = { type?: string; text?: string; attachments?: { contentType: string; content: { body: { text?: string }[]; actions: { type: string; title: string; url?: string }[] } }[] };

const harness = startChannelHarness();
const sim = harness.simulator;
let before = { audit: 0, threads: 0 };

function only(sent: { body: unknown; kind: string }[]): Activity {
  const messages = sent.filter((entry) => entry.kind === "message");
  expect(messages).toHaveLength(1);
  return messages[0].body as Activity;
}

function entra(oid: string) {
  return { provider: "entra" as const, tenant: SIMULATED.teams.tenantId, subject: oid, email: null, name: null };
}

function expectAskOnWebCard(activity: Activity) {
  const attachment = activity.attachments?.[0];
  expect(attachment?.contentType).toBe("application/vnd.microsoft.card.adaptive");
  expect(attachment?.content.body.map((block) => block.text)).toEqual([TH.channels.askOnWeb]);
  expect(attachment?.content.actions).toEqual([expect.objectContaining({ type: "Action.OpenUrl", title: TH.channels.openWinyu, url: SIMULATED.web })]);
}

beforeAll(() => linkIdentity(entra(CEO.oid), "u_thana", "test", new Date().toISOString()));

beforeEach(() => {
  before = { audit: auditLog().all().length, threads: threads().all().length };
});

afterEach(() => {
  expect(scripted.calls).toBe(0);
  expect(auditLog().all().length).toBe(before.audit);
  expect(threads().all().length).toBe(before.threads);
});

afterAll(() => harness.stop());

describe("Teams channel, send-only (Bot Framework simulator)", () => {
  test("a linked person's private message gets the fixed pointer to Winyu on the web, and Winyu keeps the conversation for shares", async () => {
    expect(teamsConversationOf("u_thana")).toBeNull();
    const delivered = await sim.teamsSay(CEO, "ยอดขายแยกตามภาคเดือนนี้");
    expect(delivered.status).toBe(200);
    expectAskOnWebCard(only(delivered.sent));
    expect(teamsConversationOf("u_thana")?.threadId).toStartWith("teams:");
  });

  test("an Entra account nobody linked is told to ask IT, and IT sees the attempt", async () => {
    const activity = only((await sim.teamsSay(STRANGER, "ยอดขายแยกตามภาค")).sent);
    expect(activity.text).toBe(TH.channels.teamsUnlinked);
    expect(activity.attachments ?? []).toHaveLength(0);
    expect(pendingAttempt(identityKey(entra(STRANGER.oid)))?.provider).toBe("entra");
  });

  test("a mention in a group chat gets the same pointer, keeps the person's private conversation, and records no attempt for a stranger", async () => {
    const privateChat = teamsConversationOf("u_thana")?.threadId;
    expectAskOnWebCard(only((await sim.teamsSay({ ...CEO, group: true }, "ยอดขายแยกตามภาค")).sent));
    expect(teamsConversationOf("u_thana")?.threadId).toBe(privateChat);
    expectAskOnWebCard(only((await sim.teamsSay(GROUP_STRANGER, "ยอดขายแยกตามภาค")).sent));
    expect(pendingAttempt(identityKey(entra(GROUP_STRANGER.oid)))).toBeNull();
  });

  test("an activity whose token does not match it is refused before anything runs", async () => {
    const sentBefore = sim.sent.length;
    const { activity, token } = sim.signedTeams(CEO, { text: "ยอดขาย" });
    const post = (headers: Record<string, string>, body: unknown) => fetch(`${harness.winyuOrigin}/api/channels/teams`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
    expect((await post({}, activity)).status).toBe(401);
    expect((await post({ authorization: `Bearer ${token}` }, { ...activity, serviceUrl: "https://evil.example.com/" })).status).toBe(401);
    expect((await post({ authorization: `Bearer ${token.slice(0, -4)}AAAA` }, activity)).status).toBe(401);
    expect(sim.sent.length).toBe(sentBefore);
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
