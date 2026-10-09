import { afterEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { liveAccessFor } from "@/lib/access/enforce";
import { metricAccess } from "@/lib/access/grants";
import { addRule, resetPolicyRules } from "@/lib/access/policy-rules";
import type { GrantSlice, User } from "@/lib/contracts";
import { findUser } from "@/lib/data/entities/users";
import { TH } from "@/lib/i18n/th";
import { untilLabel } from "@/lib/share/grant-label";
import { notificationTarget } from "@/lib/share/notification-kinds";
import { notifications, outbox } from "@/lib/server/agent/collections";
import { winyuTools } from "@/lib/server/agent/tools";
import { auditLog } from "@/lib/server/audit";
import { runWithAccess } from "@/lib/server/request-context";
import { approveRequest, declineRequest, giveGrant, grantOnShare, grantRequests, grants, requestGrant, revokeGrant, setGrantAuthority, shareScopeFor } from "./grants";
import { shares, type Share } from "./share/shares";

const ALL_SALES: GrantSlice = { metric: "net_sales_value", regions: "all", brands: "all" };
const BKK_SALES = { metric: "net_sales_value", dims: ["region"], filters: { region: ["bkk"] }, range: { from: "2026-09-01", to: "2026-09-22" }, grain: "month", compare: "none", limit: null };
const BY_REGION = { ...BKK_SALES, filters: {} };
const DAY_MS = 24 * 60 * 60 * 1000;

type MetricOutput = { ok: boolean; code?: string; rows?: { region: string }[]; provenance?: { grant?: unknown } };

function user(id: string): User {
  const found = findUser(id);
  if (!found) throw new Error(`no ${id}`);
  return found;
}

function give(grantorId: string, recipientId: string, slice: GrantSlice = ALL_SALES, at = new Date()) {
  return giveGrant({ grantor: user(grantorId), recipient: user(recipientId), slice, days: 3, shareCode: null, requestId: null, at });
}

async function queryAs(userId: string, input: unknown): Promise<{ output: MetricOutput; toolCallId: string }> {
  const tool = winyuTools().query_metric;
  const toolCallId = randomUUID();
  const output = (await runWithAccess(liveAccessFor(user(userId)), () => tool.execute(tool.inputSchema().parse(input), { toolCallId }))) as MetricOutput;
  return { output, toolCallId };
}

function storedShare(senderId: string, recipientId: string, input: Record<string, unknown> = BY_REGION): Share {
  return shares().put({ id: randomUUID().slice(0, 12), at: new Date().toISOString(), senderId, title: "ยอดขาย", question: null, note: null, card: { kind: "tool", reads: [{ tool: "query_metric", input }] }, deliveries: [{ userId: recipientId, asked: "email", via: "email", fallback: null }], views: 0, lastViewedAt: null });
}

afterEach(() => {
  for (const grant of grants().all()) grants().remove(grant.id);
  for (const request of grantRequests().all()) grantRequests().remove(request.id);
  resetPolicyRules();
  setGrantAuthority("sales_rsm", [], "test");
});

describe("a grant reaches its holder only through the gateway, as the holder", () => {
  test("without a grant u_krit asking for bkk is refused; with a live CEO grant the same call returns bkk rows and its audit row names the grant", async () => {
    const denied = await queryAs("u_krit", BKK_SALES);
    expect(denied.output).toMatchObject({ ok: false, code: "PERMISSION_DENIED" });

    const given = give("u_thana", "u_krit");
    if (!given.ok) throw new Error(given.refusal.code);
    const allowed = await queryAs("u_krit", BKK_SALES);
    expect(allowed.output.ok).toBe(true);
    expect(allowed.output.rows?.map((row) => row.region)).toEqual(["กรุงเทพฯ และปริมณฑล"]);
    const row = auditLog().where((entry) => entry.toolCallId === allowed.toolCallId)[0];
    expect(row).toMatchObject({ userId: "u_krit", tool: "query_metric", decision: "allow", grant: { id: given.grant.id, grantorId: "u_thana", expiresAt: given.grant.expiresAt } });
    expect(auditLog().where((entry) => entry.toolCallId === denied.toolCallId)[0]?.grant).toBeUndefined();
  });

  test("the grant opens only its metric: volume in bkk stays refused", async () => {
    give("u_thana", "u_krit");
    const volume = await queryAs("u_krit", { ...BKK_SALES, metric: "net_sales_volume" });
    expect(volume.output).toMatchObject({ ok: false, code: "PERMISSION_DENIED" });
  });

  test("past its expiry the grant leaves u_krit's live access and widens nothing", async () => {
    const given = give("u_thana", "u_krit", ALL_SALES, new Date(Date.now() - 4 * DAY_MS));
    if (!given.ok) throw new Error(given.refusal.code);
    const access = liveAccessFor(user("u_krit"));
    expect(access.grants).toEqual([]);
    expect(metricAccess(access, "net_sales_value", new Date()).access.regions).toEqual(["northeast"]);
    expect((await queryAs("u_krit", BKK_SALES)).output).toMatchObject({ ok: false, code: "PERMISSION_DENIED" });
  });

  test("revoked by its grantor, or by IT, a grant widens nothing; anyone else cannot revoke it", async () => {
    for (const revoker of ["u_thana", "u_ton"]) {
      const given = give("u_thana", "u_krit");
      if (!given.ok) throw new Error(given.refusal.code);
      expect(revokeGrant(given.grant.id, user("u_anucha"))).toBe(false);
      expect(revokeGrant(given.grant.id, user(revoker))).toBe(true);
      expect(auditLog().all().at(-1)).toMatchObject({ tool: "grant", userId: revoker, decision: "allow", toolCallId: given.grant.id, args: expect.stringContaining('"event":"revoked"') });
      expect(liveAccessFor(user("u_krit")).grants).toEqual([]);
      expect((await queryAs("u_krit", BKK_SALES)).output).toMatchObject({ ok: false, code: "PERMISSION_DENIED" });
    }
  });
});

describe("what a grantor may give", () => {
  test("an RSM, a CFO on sales, and a sales director on finance are refused, and each refusal is audited", () => {
    const refusals = [give("u_anucha", "u_krit"), give("u_siriporn", "u_krit"), give("u_prasit", "u_krit", { metric: "gross_margin", regions: "all", brands: "all" })];
    expect(refusals.map((outcome) => (outcome.ok ? "granted" : outcome.refusal.code))).toEqual(["not_authority", "not_authority", "not_authority"]);
    expect(grants().all()).toEqual([]);
    expect(auditLog().all().slice(-3).map((row) => [row.tool, row.decision, row.code])).toEqual([["grant", "deny", "not_authority"], ["grant", "deny", "not_authority"], ["grant", "deny", "not_authority"]]);
  });

  test("an RSM IT gave sales authority still cannot reach past his own region", () => {
    setGrantAuthority("sales_rsm", ["sales", "hr"], "u_ton");
    const outcome = give("u_anucha", "u_wee");
    expect(outcome.ok ? "granted" : outcome.refusal.code).toBe("beyond_scope");
  });

  test("salary, headcount and attrition are refused even to the CEO", () => {
    for (const metric of ["avg_salary", "headcount", "attrition_rate"] as const) {
      const outcome = give("u_thana", "u_krit", { metric, regions: "all", brands: "all" });
      expect(outcome.ok ? "granted" : outcome.refusal.code).toBe("sensitive");
    }
  });

  test("u_krit holding the CEO's grant cannot grant it onward", () => {
    give("u_thana", "u_krit");
    setGrantAuthority("sales_rep", ["sales"], "u_ton");
    try {
      const onward = give("u_krit", "u_nok");
      expect(onward.ok ? "granted" : onward.refusal.code).toBe("beyond_scope");
    } finally {
      setGrantAuthority("sales_rep", [], "u_ton");
    }
  });

  test("an admin rule on grant_access blocks the grant and the audit names the rule's code", () => {
    addRule("ห้ามให้สิทธิ์ยอดขาย", 'tool.name == "grant_access" && args.metric == "net_sales_value"', "u_ton");
    const outcome = give("u_thana", "u_krit");
    expect(outcome.ok ? "granted" : outcome.refusal).toMatchObject({ code: "policy_rule", rule: { name: "ห้ามให้สิทธิ์ยอดขาย" } });
    expect(liveAccessFor(user("u_krit")).grants).toEqual([]);
  });
});

describe("grants from a share", () => {
  test("the CEO grants at share time: u_krit gets the slice the card showed, and a refusal is reported, not thrown", () => {
    const results = grantOnShare(user("u_thana"), { kind: "tool", reads: [{ tool: "query_metric", input: BY_REGION }] }, ["u_krit", "u_thana"], 3, "SHARECODE001");
    expect(results.map((result) => [result.userId, result.granted, result.refusal])).toEqual([["u_krit", true, null], ["u_thana", false, "self"]]);
    expect(grants().all()[0]).toMatchObject({ recipientId: "u_krit", shareCode: "SHARECODE001", slice: ALL_SALES, days: 3 });
  });

  test("u_krit sees what the card hides, asks, the CEO is mailed and approves for 7 days; the request page refuses anyone else", async () => {
    const share = storedShare("u_thana", "u_krit");
    const scope = shareScopeFor(share, user("u_krit"));
    expect(scope).toMatchObject({ hidden: { metric: "net_sales_value", regions: ["bkk", "central", "north", "east", "south"] }, grant: null, pendingRequest: null, requestable: true });

    const before = outbox().all().length;
    const asked = await requestGrant(user("u_krit"), share.id, "ต้องเทียบกับกรุงเทพฯ");
    if (!asked.ok) throw new Error(asked.problem);
    expect(asked.request).toMatchObject({ approverId: "u_thana", slice: ALL_SALES, status: "pending" });
    expect(outbox().all().slice(before)).toEqual([expect.objectContaining({ toUserId: "u_thana", refId: asked.request.id })]);
    const again = await requestGrant(user("u_krit"), share.id, "");
    expect(again.ok && again.request.id).toBe(asked.request.id);
    expect(shareScopeFor(share, user("u_krit"))?.pendingRequest?.id).toBe(asked.request.id);

    expect(await approveRequest(asked.request.id, user("u_ton"), 7)).toMatchObject({ ok: false, problem: "not_yours" });
    const approved = await approveRequest(asked.request.id, user("u_thana"), 7);
    if (!approved.ok) throw new Error(approved.problem);
    expect(approved.grant?.days).toBe(7);
    expect(shareScopeFor(share, user("u_krit"))).toMatchObject({ grant: { grantorName: "คุณธนา วงศ์สกุล" }, requestable: false });
    expect((await queryAs("u_krit", BKK_SALES)).output.ok).toBe(true);
  });

  test("a sales director's share goes to the sales director; IT may decline; a share that hides nothing cannot be requested", async () => {
    const share = storedShare("u_prasit", "u_krit");
    const asked = await requestGrant(user("u_krit"), share.id, "");
    if (!asked.ok) throw new Error(asked.problem);
    expect(asked.request.approverId).toBe("u_prasit");
    expect(await declineRequest(asked.request.id, user("u_ton"))).toMatchObject({ ok: true, request: { status: "declined" } });

    const own = storedShare("u_anucha", "u_krit");
    expect(await requestGrant(user("u_krit"), own.id, "")).toEqual({ ok: false, problem: "nothing_hidden" });
    expect(await requestGrant(user("u_nok"), share.id, "")).toEqual({ ok: false, problem: "not_yours" });
  });

  test("a recipient masked on the metric has nobody to ask", async () => {
    const share = storedShare("u_thana", "u_krit", { ...BY_REGION, metric: "ar_overdue" });
    expect(shareScopeFor(share, user("u_krit"))?.requestable).toBe(false);
    expect(await requestGrant(user("u_krit"), share.id, "")).toEqual({ ok: false, problem: "no_approver" });
  });
});

describe("a request and its decision reach people by mail and in their bell", () => {
  const SCRIPT_REASON = `<script>alert("x")</script> ต้องเทียบ & ดูกรุงเทพฯ`;

  test("the approver's mail is HTML with a พิจารณาคำขอ button to /g/<id>, the requester and title, and the reason escaped; one bell item opens the request", async () => {
    const share = storedShare("u_thana", "u_krit");
    const mailBefore = outbox().all().length;
    const bellBefore = notifications().all().length;
    const asked = await requestGrant(user("u_krit"), share.id, SCRIPT_REASON);
    if (!asked.ok) throw new Error(asked.problem);
    const [mail, ...rest] = outbox().all().slice(mailBefore);
    const path = `/g/${asked.request.id}`;
    expect(rest).toEqual([]);
    expect(mail).toMatchObject({ toUserId: "u_thana", fromUserId: "u_krit", refId: asked.request.id });
    expect(mail.html).toMatch(new RegExp(`<a href="[^"]*${path}"[^>]*>${TH.grant.mail.decide}</a>`));
    expect(mail.html).toContain(user("u_krit").nameTh);
    expect(mail.html).toContain(user("u_krit").title);
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; ต้องเทียบ &amp; ดูกรุงเทพฯ");
    expect(mail.body).toContain(path);
    expect(mail.body).toContain(SCRIPT_REASON);

    const bell = notifications().all().slice(bellBefore);
    expect(bell).toHaveLength(1);
    expect(bell[0]).toMatchObject({ userId: "u_thana", kind: "grant_request", refId: asked.request.id, read: false });
    expect(notificationTarget(bell[0])).toBe(path);
    expect(bell[0].title).toContain(user("u_krit").nameTh);
  });

  test("approved: u_krit is mailed who approved, until when, and a เปิดการ์ด button to the card; one bell item opens the card", async () => {
    const share = storedShare("u_thana", "u_krit");
    const asked = await requestGrant(user("u_krit"), share.id, "");
    if (!asked.ok) throw new Error(asked.problem);
    const mailBefore = outbox().all().length;
    const bellBefore = notifications().all().length;
    const approved = await approveRequest(asked.request.id, user("u_thana"), 3);
    if (!approved.ok || !approved.grant) throw new Error("not approved");
    const until = untilLabel(approved.grant.expiresAt);
    const [mail, ...rest] = outbox().all().slice(mailBefore);
    expect(rest).toEqual([]);
    expect(mail).toMatchObject({ toUserId: "u_krit", fromUserId: "u_thana" });
    expect(mail.html).toMatch(new RegExp(`<a href="[^"]*/s/${share.id}"[^>]*>${TH.grant.mail.openCard}</a>`));
    expect(mail.html).toContain(user("u_thana").nameTh);
    expect(mail.html).toContain(until);
    expect(mail.body).toContain(`/s/${share.id}`);

    const bell = notifications().all().slice(bellBefore);
    expect(bell).toHaveLength(1);
    expect(bell[0]).toMatchObject({ userId: "u_krit", kind: "grant_approved", refId: share.id });
    expect(bell[0].title).toContain(until);
    expect(notificationTarget(bell[0])).toBe(`/s/${share.id}`);
  });

  test("declined, by IT here: u_krit is mailed who declined, politely, with no button; one bell item opens the card, and he may ask again from it", async () => {
    const share = storedShare("u_thana", "u_krit");
    const asked = await requestGrant(user("u_krit"), share.id, "");
    if (!asked.ok) throw new Error(asked.problem);
    const mailBefore = outbox().all().length;
    const bellBefore = notifications().all().length;
    expect(await declineRequest(asked.request.id, user("u_ton"))).toMatchObject({ ok: true });
    const [mail, ...rest] = outbox().all().slice(mailBefore);
    expect(rest).toEqual([]);
    expect(mail).toMatchObject({ toUserId: "u_krit", fromUserId: "u_ton" });
    expect(mail.subject).toContain(user("u_ton").nameTh);
    expect(mail.html).not.toContain("<a ");
    expect(mail.html).toContain(TH.grant.mail.declinedNote);

    const bell = notifications().all().slice(bellBefore);
    expect(bell).toHaveLength(1);
    expect(bell[0]).toMatchObject({ userId: "u_krit", kind: "grant_declined", refId: share.id });
    expect(notificationTarget(bell[0])).toBe(`/s/${share.id}`);
    expect(shareScopeFor(share, user("u_krit"))?.requestable).toBe(true);
  });
});
