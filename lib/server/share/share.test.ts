import { afterAll, beforeAll, describe, expect, mock, setDefaultTimeout, test } from "bun:test";
import { ScriptedModel } from "@/scripts/scripted-model";

setDefaultTimeout(30_000);

const scripted = new ScriptedModel();
mock.module("@/lib/server/models", () => scripted.modelsModule());

const { SIMULATED, startChannelHarness } = await import("@/scripts/channel-harness");
const { linkIdentity } = await import("@/lib/server/identity");
const { auditLog } = await import("@/lib/server/audit");
const { outbox } = await import("@/lib/server/agent/collections");
const { findUser } = await import("@/lib/data/entities/users");
const { liveAccessFor } = await import("@/lib/access/enforce");
const { winyuTools } = await import("@/lib/server/agent/tools");
const { runWithAccess } = await import("@/lib/server/request-context");
const { GEMINI_TEAM_CARD } = await import("@/lib/compose/gemini-team-card");
const { TH } = await import("@/lib/i18n/th");
const { createShare, channelsFor } = await import("./deliver");
const { mayOpen, shareCode, SHARE_CODE_LENGTH, shares } = await import("./shares");
const { openShare, regrounded } = await import("./view");

const BY_REGION = { metric: "net_sales_value", dims: ["region"], grain: "month", range: { from: "2026-09-01", to: "2026-09-22" }, compare: "target", filters: {}, sort: "value_desc", limit: 10 };
const QUESTION = "ยอดขายแยกตามภาคเดือนนี้";
const KRIT_TEAMS = { oid: "teams-oid-krit-share", name: "กฤษณ์" };
const KRIT_LINE = "Ukritshare000000000000000000000001";
const TEAM_READS = [
  { tool: "resolve_owner", input: { metric: "net_sales_value", dims: { region: "northeast" } } },
  { tool: "find_people", input: { manager: "u_anucha", region: null, department: null, query: null, flag: null } },
  { tool: "get_person", input: { id: "u_anucha", name: "" } },
];

type Row = { region: string; value_label: string };
type MetricResult = { ok: true; rows: Row[] };

const harness = startChannelHarness();
const sim = harness.simulator;

function user(id: string) {
  const found = findUser(id);
  if (!found) throw new Error(`no ${id}`);
  return found;
}

async function readAs(userId: string, tool: string, input: unknown): Promise<unknown> {
  const found = winyuTools()[tool];
  return runWithAccess(liveAccessFor(user(userId)), () => found.execute(found.inputSchema().parse(input)));
}

function valueLabels(result: MetricResult): string[] {
  return result.rows.map((row) => row.value_label);
}

function regionsOf(result: unknown): string[] {
  return ((result as MetricResult).rows ?? []).map((row) => row.region);
}

function sentSince(seq: number) {
  return sim.sent.filter((entry) => entry.seq > seq);
}

function lastSeq(): number {
  return sim.sent.at(-1)?.seq ?? 0;
}

const metricCard = { kind: "tool" as const, reads: [{ tool: "query_metric", input: BY_REGION }] };

let ceoLabels: string[] = [];

beforeAll(async () => {
  const at = new Date().toISOString();
  linkIdentity({ provider: "entra", tenant: SIMULATED.teams.tenantId, subject: KRIT_TEAMS.oid, email: null, name: null }, "u_krit", "test", at);
  linkIdentity({ provider: "line", tenant: SIMULATED.line.channelId, subject: KRIT_LINE, email: null, name: null }, "u_krit", "test", at);
  ceoLabels = valueLabels((await readAs("u_thana", "query_metric", BY_REGION)) as MetricResult);
});

afterAll(() => harness.stop());

function expectNoValues(text: string) {
  expect(ceoLabels.length).toBeGreaterThan(0);
  for (const label of ceoLabels) expect(text).not.toContain(label);
  expect(text).not.toMatch(/ล้านบาท|ล้านลิตร/);
}

describe("sharing a card sends the question, never the numbers", () => {
  test("a short code is 12 characters of 62 and two codes differ", () => {
    const codes = Array.from({ length: 50 }, shareCode);
    for (const code of codes) expect(code).toMatch(new RegExp(`^[A-Za-z0-9]{${SHARE_CODE_LENGTH}}$`));
    expect(new Set(codes).size).toBe(codes.length);
    expect(SHARE_CODE_LENGTH * Math.log2(62)).toBeGreaterThan(70);
  });

  test("the CEO shares sales by region with u_krit by email: the mail has the title, a button and the short link, and none of the CEO's numbers", async () => {
    const before = outbox().all().length;
    const outcome = await createShare(user("u_thana"), { card: metricCard, question: QUESTION, note: "ดูภาคอีสานหน่อยครับ", recipients: [{ userId: "u_krit", channel: "email" }] });
    if (!outcome.ok) throw new Error(outcome.error);
    const mail = outbox().all().slice(before);
    expect(mail).toHaveLength(1);
    expect(mail[0]).toMatchObject({ kind: "share", fromUserId: "u_thana", toUserId: "u_krit", refId: outcome.share.id });
    const url = `${SIMULATED.web}/s/${outcome.share.id}`;
    expect(mail[0].body).toContain(url);
    expect(mail[0].html).toContain(`href="${url}"`);
    expect(mail[0].html).toContain("เปิดดูใน Winyu");
    expect(mail[0].subject).toContain(outcome.share.title);
    expectNoValues(`${mail[0].subject}\n${mail[0].body}\n${mail[0].html}`);
    expect(JSON.stringify(shares().get(outcome.share.id))).not.toContain(ceoLabels[0]);
  });

  test("u_krit opens it and sees only the northeast, re-run under his scope; the CEO sees six regions; anyone else may not open it", async () => {
    const outcome = await createShare(user("u_thana"), { card: metricCard, question: QUESTION, note: "", recipients: [{ userId: "u_krit", channel: "email" }] });
    if (!outcome.ok) throw new Error(outcome.error);
    const krit = await openShare(outcome.share, user("u_krit"));
    expect(regionsOf(krit.reads[0].result)).toEqual(["ภาคอีสาน"]);
    const ceo = await openShare(outcome.share, user("u_thana"));
    expect(regionsOf(ceo.reads[0].result)).toHaveLength(6);
    expect(mayOpen(outcome.share, user("u_krit"))).toBe(true);
    expect(mayOpen(outcome.share, user("u_thana"))).toBe(true);
    expect(mayOpen(outcome.share, user("u_wee"))).toBe(false);
  });

  test("a recipient whose role may not run the tool gets the refusal, not the sender's card", async () => {
    const outcome = await createShare(user("u_thana"), { card: metricCard, question: QUESTION, note: "", recipients: [{ userId: "u_wee", channel: "email" }] });
    if (!outcome.ok) throw new Error(outcome.error);
    const view = await openShare(outcome.share, user("u_wee"));
    expect(view.reads[0].result).toMatchObject({ ok: false });
    expect(JSON.stringify(view)).not.toContain(ceoLabels[0]);
  });

  test("the share and every opening are audited as the person: a share row with recipients and channels, a query row per opening", async () => {
    const before = auditLog().all().length;
    const outcome = await createShare(user("u_thana"), { card: metricCard, question: QUESTION, note: "ส่วนตัว", recipients: [{ userId: "u_krit", channel: "email" }] });
    if (!outcome.ok) throw new Error(outcome.error);
    await openShare(outcome.share, user("u_krit"));
    const rows = auditLog().all().slice(before);
    const share = rows.find((row) => row.tool === "share");
    expect(share).toMatchObject({ userId: "u_thana", initiator: "person", decision: "allow", toolCallId: outcome.share.id, rowsReturned: 1 });
    expect(share?.args).toContain("u_krit:email");
    expect(share?.args).not.toContain("ส่วนตัว");
    expectNoValues(JSON.stringify(share));
    expect(rows.find((row) => row.tool === "query_metric")).toMatchObject({ userId: "u_krit", initiator: "person", decision: "allow", question: QUESTION });
  });

  test("a share cannot carry a write tool or an input its schema refuses", async () => {
    const write = await createShare(user("u_thana"), { card: { kind: "tool", reads: [{ tool: "send_email", input: { toUserId: "u_krit", subject: "x", body: "y" } }] }, question: null, note: "", recipients: [{ userId: "u_krit", channel: "email" }] });
    expect(write.ok).toBe(false);
    const broken = await createShare(user("u_thana"), { card: { kind: "tool", reads: [{ tool: "query_metric", input: { metric: "nope" } }] }, question: null, note: "", recipients: [{ userId: "u_krit", channel: "email" }] });
    expect(broken.ok).toBe(false);
  });
});

describe("a share can carry a temporary grant", () => {
  test("the CEO shares with a 3-day grant: u_krit opens it and sees all six regions, the card names the grant, and the sheet hears who got it", async () => {
    const { grants } = await import("@/lib/server/grants");
    try {
      const plain = await createShare(user("u_thana"), { card: metricCard, question: QUESTION, note: "", recipients: [{ userId: "u_krit", channel: "email" }] });
      if (!plain.ok) throw new Error(plain.error);
      expect(plain.grants).toEqual([]);
      expect((await openShare(plain.share, user("u_krit"))).scope).toMatchObject({ grant: null, requestable: true });

      const outcome = await createShare(user("u_thana"), { card: metricCard, question: QUESTION, note: "", recipients: [{ userId: "u_krit", channel: "email" }], grantDays: 3 });
      if (!outcome.ok) throw new Error(outcome.error);
      expect(outcome.grants).toEqual([{ userId: "u_krit", name: user("u_krit").nameTh, metric: "net_sales_value", granted: true, refusal: null }]);
      const krit = await openShare(outcome.share, user("u_krit"));
      expect(regionsOf(krit.reads[0].result)).toHaveLength(6);
      expect(krit.scope).toMatchObject({ grant: { grantorName: user("u_thana").nameTh }, requestable: false });
    } finally {
      for (const grant of grants().all()) grants().remove(grant.id);
    }
  });

  test("a sender without grant authority shares as before: the grant is refused and the share still goes out", async () => {
    const outcome = await createShare(user("u_anucha"), { card: metricCard, question: QUESTION, note: "", recipients: [{ userId: "u_wee", channel: "email" }], grantDays: 7 });
    if (!outcome.ok) throw new Error(outcome.error);
    expect(outcome.share.deliveries).toHaveLength(1);
    expect(outcome.grants.map((grant) => [grant.granted, grant.refusal])).toEqual([[false, "not_authority"]]);
  });
});

describe("a composed card is re-grounded against the viewer's own results", () => {
  test("u_krit's copy of the CEO's team card reads his own get_person result, not the CEO's", async () => {
    const card = { kind: "composed" as const, reads: TEAM_READS, components: GEMINI_TEAM_CARD as never };
    const outcome = await createShare(user("u_thana"), { card, question: "ใครดูแลภาคอีสาน", note: "", recipients: [{ userId: "u_krit", channel: "email" }] });
    if (!outcome.ok) throw new Error(outcome.error);
    expect(outcome.share.title).toBe("ผู้ดูแลและทีมขายภาคอีสาน");
    const ceo = await openShare(outcome.share, user("u_thana"));
    const krit = await openShare(outcome.share, user("u_krit"));
    expect(ceo.surface?.components.length).toBeGreaterThan(2);
    expect(krit.surface).not.toBeNull();
    const kritOwn = (await readAs("u_krit", "get_person", TEAM_READS[2].input)) as { data: { facts: unknown } };
    const kritModel = krit.surface?.dataModel as { get_person: { data: { facts: unknown } } };
    expect(kritModel.get_person.data.facts).toEqual(kritOwn.data.facts);
  });

  test("a block whose paths the viewer's results do not return draws nothing beyond the root", () => {
    const card = { kind: "composed" as const, reads: TEAM_READS, components: GEMINI_TEAM_CARD as never };
    const refused = TEAM_READS.map((read) => ({ toolCallId: read.tool, tool: read.tool, input: read.input, result: { ok: false, error: "denied" } }));
    expect(regrounded(card, refused, "s")).toBeNull();
  });
});

describe("Teams and LINE carry a button into Winyu", () => {
  test("Teams falls back to email until the person has written to the bot, then gets an Adaptive Card with Action.OpenUrl", async () => {
    expect(channelsFor("u_krit")).toEqual([
      { channel: "email", ready: true },
      { channel: "teams", ready: false },
      { channel: "line", ready: true },
    ]);
    const early = await createShare(user("u_thana"), { card: metricCard, question: QUESTION, note: "", recipients: [{ userId: "u_krit", channel: "teams" }] });
    if (!early.ok) throw new Error(early.error);
    expect(early.share.deliveries).toEqual([{ userId: "u_krit", asked: "teams", via: "email", fallback: "no-teams-conversation" }]);

    await sim.teamsSay(KRIT_TEAMS, "สวัสดี");
    expect(channelsFor("u_krit").find((option) => option.channel === "teams")?.ready).toBe(true);

    const seq = lastSeq();
    const outcome = await createShare(user("u_thana"), { card: metricCard, question: QUESTION, note: "ดูหน่อย", recipients: [{ userId: "u_krit", channel: "teams" }] });
    if (!outcome.ok) throw new Error(outcome.error);
    expect(outcome.share.deliveries[0]).toMatchObject({ via: "teams", fallback: null });
    const posted = sentSince(seq).filter((entry) => entry.channel === "teams" && entry.kind === "message");
    expect(posted).toHaveLength(1);
    const card = (posted[0].body as { attachments: { content: { actions: { type: string; url: string }[] } }[] }).attachments[0].content;
    expect(card.actions).toEqual([expect.objectContaining({ type: "Action.OpenUrl", url: `${SIMULATED.web}/s/${outcome.share.id}` })]);
    expectNoValues(JSON.stringify(posted[0].body));
  });

  test("LINE gets a pushed Flex bubble with a URI button, and its notification text carries the short link", async () => {
    const seq = lastSeq();
    const outcome = await createShare(user("u_thana"), { card: metricCard, question: QUESTION, note: "", recipients: [{ userId: "u_krit", channel: "line" }] });
    if (!outcome.ok) throw new Error(outcome.error);
    const pushed = sentSince(seq).filter((entry) => entry.channel === "line" && entry.kind === "push");
    expect(pushed).toHaveLength(1);
    expect(pushed[0].to).toBe(KRIT_LINE);
    const url = `${SIMULATED.web}/s/${outcome.share.id}`;
    const message = (pushed[0].body as { messages: { altText: string; contents: { footer: { contents: { action: { type: string; uri: string } }[] } } }[] }).messages[0];
    expect(message.altText).toContain(url);
    expect(message.contents.footer.contents[0].action).toMatchObject({ type: "uri", uri: url });
    expectNoValues(JSON.stringify(pushed[0].body));
  });
});

describe("a share lands in the recipient's bell as well", () => {
  test("whatever the channel, each recipient gets one bell item that names the sender and the card, opens /s/<code>, and carries no value", async () => {
    const { notifications } = await import("@/lib/server/agent/collections");
    const { notificationTarget } = await import("@/lib/share/notification-kinds");
    for (const channel of ["email", "teams", "line"] as const) {
      const before = notifications().all().length;
      const outcome = await createShare(user("u_thana"), { card: metricCard, question: QUESTION, note: "", recipients: [{ userId: "u_krit", channel }, { userId: "u_anucha", channel: "email" }] });
      if (!outcome.ok) throw new Error(outcome.error);
      const bell = notifications().all().slice(before);
      expect(bell.map((item) => [item.userId, item.kind, item.refId])).toEqual([["u_krit", "share", outcome.share.id], ["u_anucha", "share", outcome.share.id]]);
      expect(notificationTarget(bell[0])).toBe(`/s/${outcome.share.id}`);
      expect(bell[0].title).toBe(TH.notify.shared(user("u_thana").nameTh, outcome.share.title));
      expectNoValues(JSON.stringify(bell));
    }
  });

  test("a grant given at share time folds into the same bell item, with its end date", async () => {
    const { notifications } = await import("@/lib/server/agent/collections");
    const { grants } = await import("@/lib/server/grants");
    const { untilLabel } = await import("@/lib/share/grant-label");
    try {
      const before = notifications().all().length;
      const outcome = await createShare(user("u_thana"), { card: metricCard, question: QUESTION, note: "", recipients: [{ userId: "u_krit", channel: "email" }], grantDays: 3 });
      if (!outcome.ok) throw new Error(outcome.error);
      const bell = notifications().all().slice(before);
      const grant = grants().all().find((item) => item.shareCode === outcome.share.id);
      if (!grant) throw new Error("no grant");
      expect(bell).toHaveLength(1);
      expect(bell[0].title).toBe(TH.notify.sharedWithGrant(user("u_thana").nameTh, outcome.share.title, untilLabel(grant.expiresAt)));
      expectNoValues(bell[0].title);
    } finally {
      for (const grant of grants().all()) grants().remove(grant.id);
    }
  });
});
