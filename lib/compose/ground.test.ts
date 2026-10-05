import { beforeAll, describe, expect, test } from "bun:test";
import { accessFor } from "@/lib/access/policies";
import { findUser } from "@/lib/data/entities/users";
import { winyuTools } from "@/lib/server/agent/tools";
import { runWithAccess } from "@/lib/server/request-context";
import { GEMINI_TEAM_CARD } from "./gemini-team-card";
import { groundComposition, type TurnResult } from "./ground";


type Component = Record<string, unknown> & { id: string };

let results: TurnResult[] = [];

async function readAs(userId: string, tool: string, input: unknown): Promise<unknown> {
  const user = findUser(userId);
  if (!user) throw new Error(`no user ${userId}`);
  const found = winyuTools()[tool];
  return runWithAccess(accessFor(user), () => found.execute(found.inputSchema().parse(input)));
}

/** The team card with one component replaced. */
function withComponent(replacement: Component): Component[] {
  return GEMINI_TEAM_CARD.map((component) => (component.id === replacement.id ? replacement : component));
}

function problemsOf(components: readonly unknown[], turn: readonly TurnResult[] = results): string {
  const grounded = groundComposition(components, turn);
  return grounded.ok ? "" : grounded.problems.join("\n");
}

beforeAll(async () => {
  results = [
    { tool: "resolve_owner", output: await readAs("u_thana", "resolve_owner", { metric: "net_sales_value", dims: { region: "northeast" } }) },
    { tool: "find_people", output: await readAs("u_thana", "find_people", { manager: "u_anucha", region: null, department: null, query: null, flag: null }) },
    { tool: "get_person", output: await readAs("u_thana", "get_person", { id: "u_anucha", name: "" }) },
  ];
});

describe("a composed card holds only what this turn's tools returned", () => {
  test("Gemini's team card holds, and its data model carries only what the card shows", () => {
    const grounded = groundComposition(GEMINI_TEAM_CARD, results);
    if (!grounded.ok) throw new Error(grounded.problems.join("\n"));
    const model = grounded.dataModel as { get_person: { data: Record<string, unknown> }; find_people: Record<string, unknown>; resolve_owner?: unknown };
    expect((model.get_person.data.reports as { name: string }[]).map((report) => report.name)).toEqual(["คุณกฤต จันทร์เสน", "คุณนก สุขสวัสดิ์", "คุณป้อง แสนสุข", "คุณท็อป บุญยืน", "คุณแนน ภูมิพัฒน์"]);
    expect(model.get_person.data.history).toBeUndefined();
    expect(model.find_people.data).toBeUndefined();
    expect(model.find_people.open_positions).toHaveLength(2);
    expect(model.resolve_owner).toBeUndefined();
  });

  test("a literal number no tool returned is refused", () => {
    const invented = withComponent({ ...GEMINI_TEAM_CARD[0], meta: "ทีม 4821 คน" });
    expect(problemsOf(invented)).toContain('number "4821"');
  });

  test("a number copied exactly from a result may stay literal", () => {
    expect(problemsOf(withComponent({ ...GEMINI_TEAM_CARD[0], meta: "ตำแหน่งว่างเปิดรับมา 99 วัน" }))).toBe("");
  });

  test("a person's name no tool returned is refused", () => {
    expect(problemsOf(withComponent({ ...GEMINI_TEAM_CARD[0], title: "คุณสมชาย ดูแลภาคอีสาน" }))).toContain('name "คุณสมชาย"');
  });

  test("a picture URL no tool returned is refused", () => {
    const picture = withComponent({ id: "leader_person", component: "Person", name: { path: "/get_person/data/name" }, src: "https://example.com/face.jpg" });
    expect(problemsOf(picture)).toContain("picture");
  });

  test("a path to a field the tool did not return is refused", () => {
    const missing = withComponent({ id: "leader_person", component: "Person", name: { path: "/get_person/data/salary" } });
    expect(problemsOf(missing)).toContain('"/get_person/data/salary"');
  });

  test("a relative path outside a template is refused", () => {
    expect(problemsOf(withComponent({ id: "leader_person", component: "Person", name: { path: "name" } }))).toContain("relative path");
  });

  test("a metric result cannot be composed: query_metric keeps its DataCard", async () => {
    const query = { metric: "net_sales_value", dims: ["region"], filters: {}, range: { from: "2026-09-01", to: "2026-09-22" }, grain: "month", compare: "prev_period", limit: null };
    const turn = [...results, { tool: "query_metric", output: await readAs("u_thana", "query_metric", query) }];
    const metric = withComponent({ id: "leader_person", component: "Metric", label: "ยอดขาย", value: { path: "/query_metric/headline/value" } });
    expect(problemsOf(metric, turn)).toContain('"/query_metric/headline/value" is not in this turn');
  });

  test("one child id written where a list belongs is read as a one-item list, as Gemini wrote for u_krit", () => {
    const single = withComponent({ id: "root", component: "Card", title: "ทีม", children: "sec_team" });
    expect(problemsOf(single)).toBe("");
  });

  test("a component outside the catalog or a root that is not a Card is refused", () => {
    expect(problemsOf([{ id: "root", component: "Html", html: "<b>x</b>" }])).toContain("component one of");
    expect(problemsOf([{ id: "root", component: "Badge", label: "x" }])).toContain("be a Card");
  });
});
