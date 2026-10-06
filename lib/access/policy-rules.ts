import { randomUUID } from "node:crypto";
import { Environment } from "@marcbachmann/cel-js";
import { BRANDS, REGIONS, type AccessContext, type AuditEntry, type Initiator, type RoleId, type ToolTier } from "@/lib/contracts";
import { findUser } from "@/lib/data/entities/users";
import { TH } from "@/lib/i18n/th";
import { collection } from "@/lib/server/store/json-store";
import { surfaceEntry } from "@/lib/server/tools/registry";
import { accessFor } from "./policies";

export const POLICY_RULES_COLLECTION = "policy-rules";

const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;
const MAX_NAME_CHARS = 80;
const MAX_EXPRESSION_CHARS = 1000;
const BOOLEAN_TYPES: ReadonlySet<string> = new Set(["bool", "dyn"]);

/** One admin rule: when `when` is true for a call, the gateway refuses it. */
export type PolicyRule = { id: string; name: string; when: string; enabled: boolean; by: string; at: string };

/** The facts a rule can read about one tool call. */
export type CallFacts = {
  tool: { name: string; connector: string; tier: ToolTier };
  args: unknown;
  user: { id: string; role: RoleId; regions: string[]; brands: string[] };
  initiator: Initiator;
  now: { hour: number; weekday: number };
};

/** The rule that refuses a call, and whether it refused because it could not be evaluated. */
export type RuleDenial = { rule: PolicyRule; broken: boolean };

/** Whether an expression can be saved: on failure, a Thai explanation and the parser's own message. */
export type RuleCheck = { ok: true } | { ok: false; error: string; detail: string };

/** How a rule would have done over past calls: how many it would have refused, out of how many. */
export type DryRun = { refused: number; total: number };

type Compiled = (context: Record<string, unknown>) => unknown;

const ENVIRONMENT = new Environment()
  .registerVariable({ name: "tool", schema: { name: "string", connector: "string", tier: "string" } })
  .registerVariable("args", "dyn")
  .registerVariable({ name: "user", schema: { id: "string", role: "string", regions: "list<string>", brands: "list<string>" } })
  .registerVariable("initiator", "string")
  .registerVariable({ name: "now", schema: { hour: "int", weekday: "int" } });

const compiledByExpression = new Map<string, Compiled>();

function store() {
  return collection<PolicyRule>(POLICY_RULES_COLLECTION);
}

function compiledOf(when: string): Compiled {
  const known = compiledByExpression.get(when);
  if (known) return known;
  const compiled = ENVIRONMENT.parse(when) as Compiled;
  compiledByExpression.set(when, compiled);
  return compiled;
}

function celContextOf(facts: CallFacts): Record<string, unknown> {
  return { ...facts, args: facts.args ?? null, now: { hour: BigInt(facts.now.hour), weekday: BigInt(facts.now.weekday) } };
}

/** Checks an expression the way saving does: it parses, every variable is declared, and it yields true or false. */
export function validateRule(when: string): RuleCheck {
  const errors = TH.admin.rulesTab.errors;
  const trimmed = when.trim();
  if (!trimmed) return { ok: false, error: errors.empty, detail: "" };
  if (trimmed.length > MAX_EXPRESSION_CHARS) return { ok: false, error: errors.tooLong(MAX_EXPRESSION_CHARS), detail: "" };
  const checked = ENVIRONMENT.check(trimmed);
  if (!checked.valid) return { ok: false, error: errors.invalid, detail: checked.error?.message ?? "" };
  if (!BOOLEAN_TYPES.has(String(checked.type))) return { ok: false, error: errors.notBoolean, detail: `type: ${String(checked.type)}` };
  return { ok: true };
}

/** What a rule would decide for these facts: refuse, let through, or broken (threw or gave something other than true or false). */
export function verdictOf(rule: PolicyRule, facts: CallFacts): "deny" | "pass" | "broken" {
  try {
    const value = compiledOf(rule.when)(celContextOf(facts));
    if (value === true) return "deny";
    return value === false ? "pass" : "broken";
  } catch {
    return "broken";
  }
}

/** The first enabled rule, in stored order, that refuses this call or cannot be evaluated for it; null lets the call through. */
export function ruleThatDenies(facts: CallFacts, rules: readonly PolicyRule[] = policyRules()): RuleDenial | null {
  for (const rule of rules) {
    if (!rule.enabled) continue;
    const verdict = verdictOf(rule, facts);
    if (verdict !== "pass") return { rule, broken: verdict === "broken" };
  }
  return null;
}

function bangkokClock(at: Date): CallFacts["now"] {
  const local = new Date(at.getTime() + BANGKOK_OFFSET_MS);
  return { hour: local.getUTCHours(), weekday: local.getUTCDay() };
}

/** The facts of one call: the tool, its arguments as sent, who asks under what scope, who started the work, and the Bangkok clock. */
export function factsOf(access: AccessContext, tool: CallFacts["tool"], args: unknown, initiator: Initiator, at: Date = new Date()): CallFacts {
  return {
    tool: { name: tool.name, connector: tool.connector, tier: tool.tier },
    args,
    user: { id: access.userId, role: access.role, regions: access.regions === "all" ? [...REGIONS] : access.regions, brands: access.brands === "all" ? [...BRANDS] : access.brands },
    initiator,
    now: bangkokClock(at),
  };
}

function parsedArgs(preview: string | undefined): unknown {
  if (!preview) return null;
  try {
    return JSON.parse(preview) as unknown;
  } catch {
    return null;
  }
}

function factsOfAuditRow(row: AuditEntry): CallFacts | null {
  const user = findUser(row.userId);
  const entry = surfaceEntry(row.tool);
  if (!user || !entry) return null;
  return factsOf(accessFor(user), entry, parsedArgs(row.args), row.initiator ?? "system", new Date(row.at));
}

/** Replays a rule over past audit rows, rebuilt into call facts (arguments as the audit kept them, personal text hidden): how many it would have refused. */
export function dryRun(rule: PolicyRule, rows: readonly AuditEntry[]): DryRun {
  const facts = rows.map(factsOfAuditRow).filter((item): item is CallFacts => item !== null);
  return { refused: facts.filter((item) => verdictOf({ ...rule, enabled: true }, item) !== "pass").length, total: facts.length };
}

export function policyRules(): PolicyRule[] {
  return store().all();
}

function stamped(rule: Omit<PolicyRule, "by" | "at">, by: string): PolicyRule {
  return { ...rule, by, at: new Date().toISOString() };
}

function nameOf(name: string): string {
  return name.trim().slice(0, MAX_NAME_CHARS) || TH.admin.rulesTab.untitled;
}

/** Saves a new rule at the end of the order, enabled; an expression that fails validation is not saved. */
export function addRule(name: string, when: string, by: string): RuleCheck {
  const check = validateRule(when);
  if (!check.ok) return check;
  store().put(stamped({ id: randomUUID(), name: nameOf(name), when: when.trim(), enabled: true }, by));
  return check;
}

/** Changes a rule's name and expression in place; an expression that fails validation is not saved. */
export function updateRule(id: string, name: string, when: string, by: string): RuleCheck {
  const rule = store().get(id);
  if (!rule) return { ok: false, error: TH.admin.rulesTab.errors.missing, detail: "" };
  const check = validateRule(when);
  if (!check.ok) return check;
  store().put(stamped({ ...rule, name: nameOf(name), when: when.trim() }, by));
  return check;
}

export function setRuleEnabled(id: string, enabled: boolean, by: string): void {
  const rule = store().get(id);
  if (rule) store().put(stamped({ ...rule, enabled }, by));
}

export function removeRule(id: string): boolean {
  return store().remove(id);
}

function rewriteInOrder(rules: readonly PolicyRule[]): void {
  const target = store();
  for (const rule of rules) target.remove(rule.id);
  for (const rule of rules) target.put(rule);
}

/** Moves a rule one place earlier (-1) or later (1) in the order rules are checked. */
export function moveRule(id: string, step: -1 | 1): void {
  const rules = policyRules();
  const from = rules.findIndex((rule) => rule.id === id);
  const to = from + step;
  if (from < 0 || to < 0 || to >= rules.length) return;
  const reordered = [...rules];
  [reordered[from], reordered[to]] = [reordered[to], reordered[from]];
  rewriteInOrder(reordered);
}

export function resetPolicyRules(): number {
  const all = policyRules();
  for (const rule of all) store().remove(rule.id);
  return all.length;
}
