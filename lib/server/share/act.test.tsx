import { afterEach, describe, expect, mock, setDefaultTimeout, test } from "bun:test";

setDefaultTimeout(30_000);

let signedIn: string | null = null;

const { sessionCookie } = await import("@/lib/server/auth/session-token");
mock.module("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (signedIn ? { name, value: sessionCookie({ via: "demo", userId: signedIn }).value } : undefined) }),
}));

const { POST } = await import("@/app/api/matters/[code]/route");
const { setHandoffEnabled } = await import("@/lib/access/enforce");
const { findUser } = await import("@/lib/data/entities/users");
const { inboxCountsFor } = await import("@/lib/server/inbox");
const { bellFor } = await import("@/lib/server/bell");
const { notificationsOf } = await import("@/lib/server/notify");
const { auditLog } = await import("@/lib/server/audit");
const { TH } = await import("@/lib/i18n/th");
const { openingOf, shares } = await import("./shares");
const { createShare } = await import("./deliver");
const { actOnMatter } = await import("./act");

const NORTHEAST_QUERY = { metric: "net_sales_volume", dims: ["agent"], filters: { region: ["northeast"] }, range: { from: "2026-09-01", to: "2026-09-22" }, grain: "day", compare: "target", limit: null, sort: "delta_asc", where: null };
const NORTHEAST_CARD = { kind: "tool" as const, reads: [{ tool: "query_metric", input: NORTHEAST_QUERY }] };
const ASK = "ช่วยดูยอดขายเข้าภาคอีสานหน่อย";
const START = Date.UTC(2026, 9, 16, 5, 0, 0);

let tick = 0;

function nextMoment(): Date {
  tick += 1;
  return new Date(START + tick * 1000);
}

function user(id: string) {
  const found = findUser(id);
  if (!found) throw new Error(`no ${id}`);
  return found;
}

async function sent(from: string, to: string, intent: "act" | "fyi" = "act") {
  const outcome = await createShare(user(from), { card: NORTHEAST_CARD, question: null, ask: ASK, intent, recipients: [{ userId: to, channel: "winyu" }] }, nextMoment().toISOString());
  if (!outcome.ok) throw new Error(outcome.error);
  return outcome.share.id;
}

function press(actor: string, code: string, body: Parameters<typeof actOnMatter>[2]) {
  return actOnMatter(user(actor), code, body, nextMoment());
}

function told(userId: string, code: string) {
  return notificationsOf(userId).filter((note) => note.refId === code);
}

function lastTold(userId: string, code: string) {
  return told(userId, code)[0];
}

function postPress(code: string, body: unknown) {
  return POST(new Request(`http://localhost/api/matters/${code}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), { params: Promise.resolve({ code }) });
}

afterEach(() => {
  signedIn = null;
  setHandoffEnabled(true, "test");
});

describe("รับ", () => {
  test("the holder's hop becomes accepted, the thread gains one line, the one who passed it is told once, and the holder's decisions drop by one", async () => {
    const code = await sent("u_thana", "u_anucha");
    const before = inboxCountsFor("u_anucha").decisions;
    expect(bellFor("u_anucha").decide.some((item) => item.refId === code)).toBe(true);

    const outcome = press("u_anucha", code, { kind: "accept" });
    expect(bellFor("u_anucha").decide.some((item) => item.refId === code)).toBe(false);

    expect(outcome.ok).toBe(true);
    expect(shares().get(code)).toMatchObject({ status: "open", path: [{ userId: "u_anucha", fromUserId: "u_thana", state: "accepted" }], thread: [{ userId: "u_anucha", kind: "accepted", text: null, toUserId: null }] });
    expect(inboxCountsFor("u_anucha").decisions).toBe(before - 1);
    expect(told("u_thana", code)).toHaveLength(1);
    expect(lastTold("u_thana", code)).toMatchObject({ kind: "matter_update", fromUserId: "u_anucha", title: TH.notify.matterUpdate.accepted(user("u_anucha").nameTh, shares().get(code)?.title ?? "") });
    expect(told("u_anucha", code)).toHaveLength(1);
  });
});

describe("ขอข้อมูลเพิ่ม and the answer", () => {
  test("asking tells the one who passed it and stops waiting on the holder; their note tells the holder and waits on them again", async () => {
    const code = await sent("u_thana", "u_anucha");
    const before = inboxCountsFor("u_anucha").decisions;

    expect(press("u_anucha", code, { kind: "ask", text: "ขอยอดแยกตามจังหวัด" }).ok).toBe(true);
    expect(shares().get(code)?.path[0].state).toBe("asked");
    expect(inboxCountsFor("u_anucha").decisions).toBe(before - 1);
    expect(told("u_thana", code)).toHaveLength(1);
    expect(lastTold("u_thana", code)?.title).toContain("ขอยอดแยกตามจังหวัด");

    expect(press("u_thana", code, { kind: "reply", text: "แนบแยกจังหวัดให้แล้ว" }).ok).toBe(true);
    expect(shares().get(code)).toMatchObject({ path: [{ userId: "u_anucha", state: "seen" }], thread: [{ kind: "asked", text: "ขอยอดแยกตามจังหวัด" }, { userId: "u_thana", kind: "note", text: "แนบแยกจังหวัดให้แล้ว" }] });
    expect(told("u_anucha", code)).toHaveLength(2);
    expect(lastTold("u_anucha", code)).toMatchObject({ kind: "matter_update", fromUserId: "u_thana" });
    expect(told("u_thana", code)).toHaveLength(1);
    expect(inboxCountsFor("u_anucha").decisions).toBe(before);
  });
});

describe("ส่งต่อ", () => {
  test("adds a hop to the same record, hands the new holder the matter once, and tells nobody else", async () => {
    const code = await sent("u_thana", "u_anucha");
    const stored = shares().all().length;
    const rsmBefore = inboxCountsFor("u_anucha").decisions;
    const repBefore = inboxCountsFor("u_krit").decisions;

    expect(press("u_anucha", code, { kind: "pass_on", toUserId: "u_krit" }).ok).toBe(true);

    expect(shares().all().length).toBe(stored);
    expect(shares().get(code)).toMatchObject({
      path: [
        { userId: "u_anucha", fromUserId: "u_thana", state: "passed_on" },
        { userId: "u_krit", fromUserId: "u_anucha", state: "sent" },
      ],
      thread: [{ userId: "u_anucha", kind: "passed_on", toUserId: "u_krit" }],
    });
    expect(told("u_krit", code)).toHaveLength(1);
    expect(lastTold("u_krit", code)).toMatchObject({ kind: "matter", fromUserId: "u_anucha", title: TH.notify.matter(user("u_anucha").nameTh, ASK) });
    expect(told("u_thana", code)).toHaveLength(0);
    expect(inboxCountsFor("u_anucha").decisions).toBe(rsmBefore - 1);
    expect(inboxCountsFor("u_krit").decisions).toBe(repBefore + 1);
  });

  test("the new holder's รับ tells the one who passed it, not the sender, and the path reads CEO, RSM passed on, rep accepted", async () => {
    const code = await sent("u_thana", "u_anucha");
    press("u_anucha", code, { kind: "pass_on", toUserId: "u_krit" });

    expect(press("u_krit", code, { kind: "accept" }).ok).toBe(true);

    expect(shares().get(code)?.path.map((hop) => [hop.fromUserId, hop.userId, hop.state])).toEqual([
      ["u_thana", "u_anucha", "passed_on"],
      ["u_anucha", "u_krit", "accepted"],
    ]);
    expect(lastTold("u_anucha", code)).toMatchObject({ kind: "matter_update", fromUserId: "u_krit" });
    expect(told("u_thana", code)).toHaveLength(0);
  });
});

describe("ไม่ใช่ของผม", () => {
  test("passes a northeast card to its RACI owner, the northeast RSM", async () => {
    const code = await sent("u_thana", "u_krit");

    expect(press("u_krit", code, { kind: "not_mine" }).ok).toBe(true);

    expect(shares().get(code)?.path.map((hop) => [hop.userId, hop.state])).toEqual([
      ["u_krit", "passed_on"],
      ["u_anucha", "sent"],
    ]);
    expect(told("u_anucha", code)).toHaveLength(1);
    expect(told("u_thana", code)).toHaveLength(0);
  });

  test("when the holder is the owner, it asks the sender who should take it instead", async () => {
    const code = await sent("u_thana", "u_anucha");

    expect(press("u_anucha", code, { kind: "not_mine" }).ok).toBe(true);

    expect(shares().get(code)).toMatchObject({ path: [{ userId: "u_anucha", state: "asked" }], thread: [{ kind: "asked", text: TH.matter.notMineAsk }] });
    expect(told("u_thana", code)).toHaveLength(1);
    expect(lastTold("u_thana", code)?.kind).toBe("matter_update");
  });

  test("when the owner is the sender, it asks the sender instead of sending it back", async () => {
    const code = await sent("u_anucha", "u_krit");

    expect(press("u_krit", code, { kind: "not_mine" }).ok).toBe(true);

    expect(shares().get(code)?.path).toHaveLength(1);
    expect(shares().get(code)?.path[0].state).toBe("asked");
    expect(told("u_anucha", code)).toHaveLength(1);
  });
});

describe("เสร็จ", () => {
  test("the sender closes it; everyone else on the path is told once; nothing waits on anyone and later presses are refused", async () => {
    const code = await sent("u_thana", "u_anucha");
    press("u_anucha", code, { kind: "pass_on", toUserId: "u_krit" });
    const repBefore = inboxCountsFor("u_krit").decisions;

    expect(press("u_thana", code, { kind: "done" }).ok).toBe(true);

    expect(shares().get(code)?.status).toBe("done");
    for (const holder of ["u_anucha", "u_krit"]) {
      expect(told(holder, code)).toHaveLength(2);
      expect(lastTold(holder, code)).toMatchObject({ kind: "matter_update", title: TH.notify.matterUpdate.done(user("u_thana").nameTh, shares().get(code)?.title ?? "") });
    }
    expect(told("u_thana", code)).toHaveLength(0);
    expect(inboxCountsFor("u_krit").decisions).toBe(repBefore - 1);
    expect(press("u_krit", code, { kind: "accept" })).toEqual({ ok: false, refusal: "closed" });
  });
});

describe("illegal presses are refused and change nothing", () => {
  test("someone who does not hold it, a matter for information, a closed one, passing to oneself or to nobody", async () => {
    const code = await sent("u_thana", "u_anucha");
    const fyi = await sent("u_thana", "u_anucha", "fyi");
    const before = JSON.stringify(shares().get(code));

    expect(press("u_thana", code, { kind: "accept" })).toEqual({ ok: false, refusal: "not_allowed" });
    expect(press("u_thana", code, { kind: "reply", text: "x" })).toEqual({ ok: false, refusal: "not_allowed" });
    expect(press("u_anucha", code, { kind: "pass_on", toUserId: "u_anucha" })).toEqual({ ok: false, refusal: "bad_target" });
    expect(press("u_anucha", code, { kind: "pass_on", toUserId: "u_nobody" })).toEqual({ ok: false, refusal: "bad_target" });
    expect(press("u_krit", code, { kind: "accept" })).toEqual({ ok: false, refusal: "not_found" });
    expect(press("u_anucha", fyi, { kind: "accept" })).toEqual({ ok: false, refusal: "fyi" });
    expect(JSON.stringify(shares().get(code))).toBe(before);
    expect(told("u_thana", code)).toHaveLength(0);
  });

  test("the route answers each refusal with its 4xx, a stranger with 404, and closes while sending work is off", async () => {
    const code = await sent("u_thana", "u_anucha");
    const fyi = await sent("u_thana", "u_anucha", "fyi");

    signedIn = "u_thana";
    expect((await postPress(code, { kind: "accept" })).status).toBe(403);
    expect((await postPress(fyi, { kind: "done" })).status).toBe(422);
    expect((await postPress(code, { kind: "ask", text: "" })).status).toBe(400);
    signedIn = "u_krit";
    expect((await postPress(code, { kind: "accept" })).status).toBe(404);
    signedIn = "u_anucha";
    setHandoffEnabled(false, "test");
    expect((await postPress(code, { kind: "accept" })).status).toBe(403);
    setHandoffEnabled(true, "test");
    expect((await postPress(code, { kind: "accept" })).status).toBe(200);
    expect((await postPress(code, { kind: "accept" })).status).toBe(403);
    signedIn = "u_thana";
    expect((await postPress(code, { kind: "done" })).status).toBe(200);
    expect((await postPress(code, { kind: "done" })).status).toBe(409);
  });

  test("every press leaves one audit row, a refusal a deny with its reason", async () => {
    const code = await sent("u_thana", "u_anucha");
    const rows = () => auditLog().where((row) => row.tool === "matter" && row.toolCallId === code);

    press("u_thana", code, { kind: "accept" });
    press("u_anucha", code, { kind: "pass_on", toUserId: "u_krit" });

    expect(rows().map((row) => [row.userId, row.decision, row.code ?? null])).toEqual([
      ["u_thana", "deny", "not_allowed"],
      ["u_anucha", "allow", null],
    ]);
    expect(rows()[1].args).toContain("u_krit");
  });
});

describe("the matter page's gate", () => {
  test("a person not on the path is kept out; once the matter is passed to them, they are let in", async () => {
    const code = await sent("u_thana", "u_anucha");

    expect(openingOf(code, user("u_krit"))).toEqual({ ok: false, reason: "notYours" });
    expect(openingOf(code, user("u_thana")).ok).toBe(true);

    press("u_anucha", code, { kind: "pass_on", toUserId: "u_krit" });

    expect(openingOf(code, user("u_krit")).ok).toBe(true);
    expect(openingOf(code, user("u_nok"))).toEqual({ ok: false, reason: "notYours" });
    expect(openingOf("nosuchcode00", user("u_thana"))).toEqual({ ok: false, reason: "missing" });
  });
});
