import { afterEach, describe, expect, test } from "bun:test";
import type { AuditEntry } from "@/lib/contracts";
import { findUser } from "@/lib/data/entities/users";
import { TH } from "@/lib/i18n/th";
import { accessFor } from "./policies";
import { addRule, dryRun, factsOf, moveRule, policyRules, resetPolicyRules, ruleThatDenies, setRuleEnabled, updateRule, validateRule, type CallFacts, type PolicyRule } from "./policy-rules";

const ADMIN = "u_ton";
const SALARY_EMAIL = 'tool.name == "send_email" && args.subject.contains("เงินเดือน")';
const NIGHT_HANDOFF = 'tool.name == "create_handoff" && (now.hour >= 22 || now.hour < 6)';
const SEND_EMAIL = { name: "send_email", connector: "mail", tier: "write" } as const;
const QUERY_METRIC = { name: "query_metric", connector: "warehouse", tier: "read" } as const;
const CREATE_HANDOFF = { name: "create_handoff", connector: "winyu", tier: "write" } as const;

function rule(when: string, overrides: Partial<PolicyRule> = {}): PolicyRule {
  return { id: "r1", name: "กฎทดสอบ", when, enabled: true, by: ADMIN, at: "2026-10-04T00:00:00Z", ...overrides };
}

function facts(tool: CallFacts["tool"], args: unknown, at = new Date("2026-10-04T05:00:00Z")): CallFacts {
  const user = findUser("u_thana");
  if (!user) throw new Error("missing u_thana");
  return factsOf(accessFor(user), tool, args, "person", at);
}

afterEach(() => {
  resetPolicyRules();
});

describe("a rule refuses only the calls it matches", () => {
  test("the salary email rule refuses that email and lets an ordinary email through", () => {
    const rules = [rule(SALARY_EMAIL)];
    expect(ruleThatDenies(facts(SEND_EMAIL, { toUserId: "u_siriporn", subject: "เรื่องเงินเดือนเดือนนี้", body: "x" }), rules)).toMatchObject({ rule: { id: "r1" }, broken: false });
    expect(ruleThatDenies(facts(SEND_EMAIL, { toUserId: "u_siriporn", subject: "ประชุมพรุ่งนี้", body: "x" }), rules)).toBeNull();
  });

  test("a rule about send_email never touches query_metric, whose arguments have no subject", () => {
    expect(ruleThatDenies(facts(QUERY_METRIC, { metric: "net_sales_volume" }), [rule(SALARY_EMAIL)])).toBeNull();
    expect(ruleThatDenies(facts(QUERY_METRIC, undefined), [rule(SALARY_EMAIL)])).toBeNull();
  });

  test("the night rule reads the Bangkok clock: 23:00 in Bangkok is refused, 12:00 is not", () => {
    const rules = [rule(NIGHT_HANDOFF)];
    expect(ruleThatDenies(facts(CREATE_HANDOFF, {}, new Date("2026-10-04T16:00:00Z")), rules)).not.toBeNull();
    expect(ruleThatDenies(facts(CREATE_HANDOFF, {}, new Date("2026-10-04T05:00:00Z")), rules)).toBeNull();
  });

  test("a rule that throws or gives something other than true or false refuses the call as broken", () => {
    expect(ruleThatDenies(facts(QUERY_METRIC, { metric: "x" }), [rule("args.subject.contains(\"a\")")])).toMatchObject({ broken: true });
    expect(ruleThatDenies(facts(QUERY_METRIC, { metric: "x" }), [rule("args.metric")])).toMatchObject({ broken: true });
  });

  test("a disabled rule is ignored, even one that would always refuse or always break", () => {
    expect(ruleThatDenies(facts(QUERY_METRIC, {}), [rule("true", { enabled: false }), rule("args.nope == 1", { id: "r2", enabled: false })])).toBeNull();
  });

  test("rules are checked in stored order, and the first that refuses decides", () => {
    expect(addRule("ก่อน", 'tool.tier == "read"', ADMIN).ok).toBe(true);
    expect(addRule("หลัง", "true", ADMIN).ok).toBe(true);
    expect(ruleThatDenies(facts(QUERY_METRIC, {}))?.rule.name).toBe("ก่อน");
    moveRule(policyRules()[1].id, -1);
    expect(ruleThatDenies(facts(QUERY_METRIC, {}))?.rule.name).toBe("หลัง");
    setRuleEnabled(policyRules()[0].id, false, ADMIN);
    expect(ruleThatDenies(facts(QUERY_METRIC, {}))?.rule.name).toBe("ก่อน");
  });
});

describe("an invalid expression is never saved", () => {
  test("bad syntax is rejected with the Thai reason and the parser's message", () => {
    const check = validateRule('tool.name ==');
    expect(check).toMatchObject({ ok: false, error: TH.admin.rulesTab.errors.invalid });
    expect(check.ok ? "" : check.detail).toContain("Unexpected");
    expect(addRule("พัง", 'tool.name ==', ADMIN).ok).toBe(false);
    expect(policyRules()).toHaveLength(0);
  });

  test("an undeclared variable or field is rejected", () => {
    expect(validateRule('role == "ceo"')).toMatchObject({ ok: false, detail: expect.stringContaining("role") });
    expect(validateRule('tool.nam == "x"').ok).toBe(false);
  });

  test("an expression that cannot be true or false is rejected", () => {
    expect(validateRule("1 + 1")).toMatchObject({ ok: false, error: TH.admin.rulesTab.errors.notBoolean });
  });

  test("editing a saved rule into an invalid one leaves the saved rule as it was", () => {
    addRule("กลางคืน", NIGHT_HANDOFF, ADMIN);
    const [saved] = policyRules();
    expect(updateRule(saved.id, "กลางคืน", "now.hour >=", ADMIN).ok).toBe(false);
    expect(policyRules()[0].when).toBe(NIGHT_HANDOFF);
  });

  test("the three example rules on the admin page all validate", () => {
    for (const example of TH.admin.rulesTab.examples) expect(validateRule(example.when)).toEqual({ ok: true });
  });
});

describe("dry run over the audit", () => {
  test("counts the past calls a rule would have refused, from the facts each audit row keeps", () => {
    const row = (id: string, tool: string, initiator: AuditEntry["initiator"]): AuditEntry => ({ id, at: "2026-10-04T03:00:00Z", userId: "u_anucha", tool, argsHash: "h", decision: "allow", rowsReturned: 0, latencyMs: 1, args: "{}", initiator });
    const rows = [row("a", "pin_widget", "job"), row("b", "query_metric", "job"), row("c", "pin_widget", "person")];
    expect(dryRun(rule('initiator == "job" && tool.tier != "read"'), rows)).toEqual({ refused: 1, total: 3 });
  });
});
