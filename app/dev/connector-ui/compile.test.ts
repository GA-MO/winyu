import { describe, expect, test } from "bun:test";
import { liveAccessFor } from "@/lib/access/enforce";
import { findUser } from "@/lib/data/entities/users";
import { ports } from "@/lib/server/ports";
import { scopedRows } from "@/lib/server/connectors/output";
import { auditedArgs, connectorScopeOf, guardHolds, holds, maskedFor, pinnedArgs } from "./compile";
import { ASSET_URL, FIXTURE_CATALOGS, LEAVE_URL, fixtureRows, fixtureWriteReply } from "./fixtures";
import { blockersOf, toolDraftOf, toolHash, type ScopeDraft, type ToolDraft } from "./model";

function accessOf(id: string) {
  const user = findUser(id);
  if (!user) throw new Error(`no user ${id}`);
  return liveAccessFor(user);
}

async function kept(url: string, tool: string, scope: ScopeDraft, userId: string) {
  const access = accessOf(userId);
  const compiled = await connectorScopeOf(scope, access);
  if (!compiled) throw new Error("scope did not compile");
  return scopedRows(compiled, fixtureRows(url, tool, (await ports().directory.load()).employees), access);
}

function remoteOf(url: string, name: string) {
  const tool = FIXTURE_CATALOGS[url]?.find((item) => item.name === name);
  if (!tool) throw new Error(`no fixture ${name}`);
  return tool;
}

describe("scope presets compile to the connector pipeline's rules", () => {
  test("region rows keep a regional rep to their region and drop rows with no region; the CEO keeps every row", async () => {
    const scope: ScopeDraft = { kind: "scoped", filter: { kind: "region_rows", field: "region" }, inject: null };
    const krit = await kept(ASSET_URL, "list_assets", scope, "u_krit");
    const ceo = await kept(ASSET_URL, "list_assets", scope, "u_thana");
    const all = fixtureRows(ASSET_URL, "list_assets", (await ports().directory.load()).employees);
    expect(krit.length).toBeGreaterThan(0);
    expect(new Set(krit.map((row) => row.region))).toEqual(new Set(["northeast"]));
    expect(ceo.length).toBe(all.length);
  });

  test("own rows keep only the caller's own asset", async () => {
    const rows = await kept(ASSET_URL, "list_assets", { kind: "scoped", filter: { kind: "own_rows", field: "holder_id", key: "employee_id" }, inject: null }, "u_krit");
    expect(rows.map((row) => row.holder_id)).toEqual(["u_krit"]);
  });

  test("people in line keep a regional manager, themself and their reports, and nobody from another region", async () => {
    const rows = await kept(LEAVE_URL, "list_leave_requests", { kind: "scoped", filter: { kind: "people_line", field: "employee_id" }, inject: null }, "u_anucha");
    const ids = rows.map((row) => row.employee_id);
    expect(ids).toContain("u_anucha");
    expect(ids).toContain("u_krit");
    expect(ids).not.toContain("u_ploy");
  });

  test("a sick-leave reason hidden from the role still shows in full on the caller's own row", async () => {
    const access = accessOf("u_anucha");
    const rows = await kept(LEAVE_URL, "list_leave_requests", { kind: "scoped", filter: { kind: "people_line", field: "employee_id" }, inject: null }, "u_anucha");
    const { rows: shown, masked } = await maskedFor(rows, [{ field: "reason", byRole: { hr_manager: "full" }, ownerField: "employee_id" }], access);
    expect(shown.find((row) => row.employee_id === "u_anucha")?.reason).toBeDefined();
    expect(shown.find((row) => row.employee_id === "u_krit")).not.toHaveProperty("reason");
    expect(masked).toEqual(["reason"]);
  });

  test("a write sends the caller as requester and the call id as idempotency key, whatever the model put there", async () => {
    const remote = remoteOf(ASSET_URL, "request_asset");
    const draft = toolDraftOf(remote);
    const sent = await pinnedArgs({ requester_id: "u_somchai", category: "laptop", reason: "ส่วนตัว", needed_by: null, idempotency_key: null }, draft.write, accessOf("u_krit"), "call_1");
    expect(sent.requester_id).toBe("u_krit");
    expect(sent.idempotency_key).toBe("call_1");
    expect(auditedArgs(sent, draft.write.redact).reason).not.toBe("ส่วนตัว");
    expect(holds({ kind: "echo", idField: "request_id", compare: ["requester_id", "category"] }, sent, fixtureWriteReply(remote, sent))).toBe(true);
    expect(holds({ kind: "echo", idField: "request_id", compare: ["requester_id"] }, sent, { ...fixtureWriteReply(remote, sent), requester_id: "u_somchai" })).toBe(false);
  });
});

describe("a write's guard checks its argument against a scoped read before anything is sent", () => {
  test("a regional manager may decide a leave request of his report and not one from another region", async () => {
    const access = accessOf("u_anucha");
    const rows = fixtureRows(LEAVE_URL, "list_leave_requests", (await ports().directory.load()).employees);
    const requestOf = (employee: string) => rows.find((row) => row.employee_id === employee)?.request_id;
    const readScope = await connectorScopeOf({ kind: "scoped", filter: { kind: "people_line", field: "employee_id" }, inject: null }, access);
    if (!readScope) throw new Error("scope did not compile");
    const guard = { arg: "request_id", readTool: "list_leave_requests", field: "request_id" };
    expect(await guardHolds(guard, { request_id: requestOf("u_krit") }, readScope, rows, access)).toBe(true);
    expect(await guardHolds(guard, { request_id: requestOf("u_ploy") }, readScope, rows, access)).toBe(false);
    expect(await guardHolds(guard, { request_id: "LV-NOT-THERE" }, readScope, rows, access)).toBe(false);
  });
});

describe("a tool cannot go live until it is declared and tested", () => {
  const remote = remoteOf(ASSET_URL, "list_assets");

  function complete(): ToolDraft {
    const draft: ToolDraft = { ...toolDraftOf(remote), include: true, labelTh: "ดูทรัพย์สิน", tier: "read", roles: ["sales_rep"], scope: { kind: "scoped", filter: { kind: "own_rows", field: "holder_id", key: "employee_id" }, inject: null } };
    return { ...draft, test: { hash: toolHash(draft), asUser: "u_krit", received: 40, kept: 1, missingField: 0, fields: [], masked: [], sentArgs: null, auditArgs: null, verified: null, guarded: null } };
  }

  test("a freshly discovered tool is destructive, roleless, unscoped and untested", () => {
    const fresh = { ...toolDraftOf(remote), include: true };
    expect(fresh.tier).toBe("destructive");
    const codes = blockersOf([fresh], [remote]).map((blocker) => blocker.code);
    expect(codes).toEqual(expect.arrayContaining(["no_label", "no_roles", "no_scope", "no_verify", "no_test"]));
  });

  test("a declared and tested tool has no blockers, and any edit after the test makes it stale", () => {
    const ready = complete();
    expect(blockersOf([ready], [remote])).toEqual([]);
    const widened = { ...ready, roles: [...ready.roles, "ceo" as const] };
    expect(blockersOf([widened], [remote]).map((blocker) => blocker.code)).toEqual(["stale_test"]);
  });

  test("no scoping needs a real reason, and a tool the server says writes cannot be declared read", () => {
    const unscoped = { ...complete(), scope: { kind: "none" as const, reason: "ไม่มี" } };
    expect(blockersOf([unscoped], [remote]).map((blocker) => blocker.code)).toContain("no_reason");
    const writes = remoteOf(ASSET_URL, "return_asset");
    const lying = { ...complete(), name: writes.name };
    expect(blockersOf([lying], [writes]).map((blocker) => blocker.code)).toContain("remote_says_writes");
  });
});
