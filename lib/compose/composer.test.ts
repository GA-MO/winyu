import { beforeAll, describe, expect, test } from "bun:test";
import { accessFor } from "@/lib/access/policies";
import { findUser } from "@/lib/data/entities/users";
import { winyuTools } from "@/lib/server/agent/tools";
import { runWithAccess } from "@/lib/server/request-context";
import type { ComposedComponent } from "./catalog";
import { CardComposer, type CardOutcome } from "./composer";
import { GEMINI_TEAM_CARD } from "./gemini-team-card";
import type { TurnResult } from "./ground";

type Component = Record<string, unknown> & { id: string };

let results: TurnResult[] = [];

async function readAs(userId: string, tool: string, input: unknown): Promise<unknown> {
  const user = findUser(userId);
  if (!user) throw new Error(`no user ${userId}`);
  const found = winyuTools()[tool];
  return runWithAccess(accessFor(user), () => found.execute(found.inputSchema().parse(input)));
}

function lines(components: readonly unknown[]): string[] {
  return components.map((component) => JSON.stringify(component));
}

function composed(blockLines: readonly string[], turn: readonly TurnResult[] = results): CardOutcome {
  const composer = new CardComposer(turn);
  for (const line of blockLines) composer.read(line);
  return composer.finish();
}

function withComponent(replacement: Component): Component[] {
  return GEMINI_TEAM_CARD.map((component) => (component.id === replacement.id ? replacement : component));
}

function ids(outcome: CardOutcome): string[] {
  return (outcome.surface?.components ?? []).map((component) => component.id);
}

function drawn(outcome: CardOutcome, id: string): ComposedComponent | undefined {
  return outcome.surface?.components.find((component) => component.id === id);
}

const FULL_CARD = ["root", "sec_leader", "leader_person", "leader_facts", "sec_team", "item_report", "sec_vacancies", "open_pos_1", "open_pos_2"];

beforeAll(async () => {
  results = [
    { tool: "resolve_owner", output: await readAs("u_thana", "resolve_owner", { metric: "net_sales_value", dims: { region: "northeast" } }) },
    { tool: "find_people", output: await readAs("u_thana", "find_people", { manager: "u_anucha", region: null, department: null, query: null, flag: null }) },
    { tool: "get_person", output: await readAs("u_thana", "get_person", { id: "u_anucha", name: "" }) },
  ];
});

describe("a composed card holds line by line, only what this turn's tools returned", () => {
  test("Gemini's team card holds whole, and its data model carries only what the card shows", () => {
    const outcome = composed(lines(GEMINI_TEAM_CARD));
    expect(outcome.rejected).toBe(0);
    expect(ids(outcome)).toEqual(FULL_CARD);
    const model = outcome.surface?.dataModel as { get_person: { data: Record<string, unknown> }; find_people: Record<string, unknown>; resolve_owner?: unknown };
    expect((model.get_person.data.reports as { name: string }[]).map((report) => report.name)).toEqual(["คุณกฤต จันทร์เสน", "คุณนก สุขสวัสดิ์", "คุณป้อง แสนสุข", "คุณท็อป บุญยืน", "คุณแนน ภูมิพัฒน์"]);
    expect(model.get_person.data.history).toBeUndefined();
    expect(model.find_people.data).toBeUndefined();
    expect(model.find_people.open_positions).toHaveLength(2);
    expect(model.resolve_owner).toBeUndefined();
  });

  test("the card grows as lines arrive: a group shows once a child under it holds", () => {
    const composer = new CardComposer(results);
    const [root, secLeader, leaderPerson] = lines(GEMINI_TEAM_CARD);
    composer.read(root);
    expect(composer.surface()?.components.map((component) => component.id)).toEqual(["root"]);
    composer.read(secLeader);
    expect(composer.surface()?.components.map((component) => component.id)).toEqual(["root"]);
    composer.read(leaderPerson);
    expect(composer.surface()?.components.map((component) => component.id)).toEqual(["root", "sec_leader", "leader_person"]);
  });

  test("a malformed line is dropped and its siblings stay", () => {
    const blockLines = lines(GEMINI_TEAM_CARD).map((line) => (line.startsWith('{"id":"open_pos_2"') ? '{"id":"open_pos_2","component":"ListItem","title":{"path":"/find_people/open_positions/0/title"' : line));
    const outcome = composed(blockLines);
    expect(outcome.rejected).toBe(1);
    expect(ids(outcome)).toEqual(FULL_CARD.filter((id) => id !== "open_pos_2"));
    expect(drawn(outcome, "sec_vacancies")?.children).toEqual(["open_pos_1"]);
  });

  test("a line with a path no tool returned is dropped and the rest of the card shows", () => {
    const outcome = composed(lines(withComponent({ id: "leader_person", component: "Person", name: { path: "/get_person/data/salary" } })));
    expect(outcome.problems.join("\n")).toContain('"/get_person/data/salary"');
    expect(ids(outcome)).toEqual(FULL_CARD.filter((id) => id !== "leader_person"));
  });

  test("an optional prop that fails is dropped from its line, the line stays", () => {
    const outcome = composed(lines(withComponent({ ...GEMINI_TEAM_CARD[0], meta: "ทีม 4821 คน" })));
    expect(outcome.problems.join("\n")).toContain('number "4821"');
    expect(drawn(outcome, "root")?.meta).toBeUndefined();
    expect(ids(outcome)).toEqual(FULL_CARD);
  });

  test("an invented number in a required prop drops the line, and nothing on the card carries it", () => {
    const outcome = composed([...lines(GEMINI_TEAM_CARD), JSON.stringify({ id: "headcount", component: "Badge", label: "ทีม 4821 คน" })].map((line) => line.replace('"sec_vacancies"]', '"sec_vacancies","headcount"]')));
    expect(outcome.problems.join("\n")).toContain('number "4821"');
    expect(JSON.stringify(outcome.surface)).not.toContain("4821");
    expect(ids(outcome)).toEqual(FULL_CARD);
  });

  test("a number copied exactly from a result may stay literal", () => {
    const outcome = composed(lines(withComponent({ ...GEMINI_TEAM_CARD[0], meta: "ตำแหน่งว่างเปิดรับมา 99 วัน" })));
    expect(drawn(outcome, "root")?.meta).toBe("ตำแหน่งว่างเปิดรับมา 99 วัน");
  });

  test("a person's name or a picture no tool returned is refused", () => {
    expect(drawn(composed(lines(withComponent({ ...GEMINI_TEAM_CARD[0], meta: "คุณสมชาย ดูแลภาคอีสาน" }))), "root")?.meta).toBeUndefined();
    const picture = composed(lines(withComponent({ id: "leader_person", component: "Person", name: { path: "/get_person/data/name" }, src: "https://example.com/face.jpg" })));
    expect(picture.problems.join("\n")).toContain("picture");
    expect(JSON.stringify(picture.surface)).not.toContain("example.com");
  });

  test("a metric result cannot be composed: the line bound to query_metric is dropped, its siblings stay", async () => {
    const query = { metric: "net_sales_value", dims: ["region"], filters: {}, range: { from: "2026-09-01", to: "2026-09-22" }, grain: "month", compare: "prev_period", limit: null };
    const turn = [...results, { tool: "query_metric", output: await readAs("u_thana", "query_metric", query) }];
    const outcome = composed(lines(withComponent({ id: "leader_person", component: "Metric", label: "ยอดขาย", value: { path: "/query_metric/headline/value" } })), turn);
    expect(outcome.problems.join("\n")).toContain('"/query_metric/headline/value" is not in this turn');
    expect(ids(outcome)).toEqual(FULL_CARD.filter((id) => id !== "leader_person"));
    expect(Object.keys(outcome.surface?.dataModel ?? {})).not.toContain("query_metric");
  });

  test("a relative path outside a template is refused", () => {
    const outcome = composed(lines(withComponent({ id: "leader_person", component: "Person", name: { path: "name" } })));
    expect(outcome.problems.join("\n")).toContain("relative path");
  });

  test("the known failure shapes are read, not refused: a root under any id, one child id written as a string", () => {
    const renamed = GEMINI_TEAM_CARD.map((component) => (component.id === "root" ? { ...component, id: "card_main", children: "sec_leader" } : component));
    const outcome = composed(lines(renamed));
    expect(ids(outcome)).toEqual(["root", "sec_leader", "leader_person", "leader_facts"]);
  });

  test("lines written children first make the same card as lines written root first", () => {
    const forward = composed(lines(GEMINI_TEAM_CARD));
    const backward = composed(lines([GEMINI_TEAM_CARD[0], ...GEMINI_TEAM_CARD.slice(1).reverse()]));
    expect(backward.surface?.dataModel).toEqual(forward.surface?.dataModel as Record<string, unknown>);
    expect(new Set(ids(backward))).toEqual(new Set(ids(forward)));
  });

  test("a line outside the catalog, a line that is not JSON and a line never placed are dropped and counted", () => {
    const outcome = composed([...lines(GEMINI_TEAM_CARD), '{"id":"x","component":"Html","html":"<b>x</b>"}', "not json", '{"id":"orphan","component":"Badge","label":"x"}']);
    expect(outcome.rejected).toBe(3);
    expect(outcome.accepted).toBe(FULL_CARD.length);
  });

  test("a block where nothing under the root holds draws no card, so the fixed cards stay", () => {
    expect(composed([JSON.stringify(GEMINI_TEAM_CARD[0])]).surface).toBeNull();
  });
});
