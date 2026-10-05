import { randomUUID } from "node:crypto";
import { z } from "zod";
import { A2UI_VERSION, COMPONENT_NAMES, COMPOSE_CATALOG_ID, type A2uiMessage, type ComposedCard, type ComposedComponent } from "@/lib/compose/catalog";
import { groundComposition } from "@/lib/compose/ground";
import { turnResults } from "@/lib/server/request-context";
import { defineTool } from "./define";

const SHOWN_SUMMARY = "การ์ดขึ้นแล้วตามที่ประกอบ ไม่ต้องทวนสิ่งที่การ์ดแสดง";

/** What the model writes: A2UI v0.9 components, flat, each `{ id, component, ...props }`. */
export const composeCardInputSchema = z.object({
  components: z.array(z.looseObject({ id: z.string(), component: z.enum(COMPONENT_NAMES) })).min(1),
});

const DESCRIPTION = [
  "Draw ONE card that answers a question about people, a team, sites, courses, candidates, policies, entities, owners, the calendar or connector rows, composed from results that tools returned earlier in this turn. Call it after those tools returned, never in the same step.",
  "Write A2UI v0.9 components, flat: { id, component, ...props }. The root has id \"root\" and is a Card. The data model is { <tool name>: <its result> } (a repeat call of a tool is <tool>_2).",
  "Any text prop takes a literal string or { path } into that model, e.g. { path: \"/get_person/data/name\" }. children is [\"id\", ...] or a template { componentId, path: \"/find_people/data\" } that repeats componentId for every item of that list; inside it paths are relative (\"name\", \"photo\", \"badges\").",
  "Prefer { path } for every name, number, date and picture. A literal may carry a name, number or date only when copied exactly from a result; a literal picture URL or any digit or name no tool returned is refused.",
  "Components: Card { title, meta?, footnote? (source system), children } · Section { label, children } (labelled group) · Grid { children } (items side by side) · Carousel { children } · ListItem { title, subtitle?, detail?, src?, media?: avatar|thumb|none, badges? ({ path } to a badges list), trailing?, action? } · Person { name, role?, src? } (one person's portrait) · KeyValue { pairs?: [{ label, value }], from?: { path } to a [{ label, value }] list } · Metric { label, value, detail? } · Badge { label, tone?: neutral|success|warning|danger } · Callout { title, body, tone?: info|success|warning|danger } · Image { src, alt? } · Table { rows: { path } to a list, columns: [{ key, label }] } · RankList { items: { path } to a list, label: field, value: field, note?: field } · Button { label, action, variant?: primary|secondary }.",
  "action: { event: { name: \"ask\", context: { prompt: \"ขอดูโปรไฟล์\", about: { path: \"name\" } } } } asks the chat that question; { event: { name: \"enroll_course\", context: { courseId: { path: \"id\" } } } } enrols behind the approval card.",
  "query_metric, get_alerts, get_forecast and explain_gap results cannot be composed: they draw their own cards.",
].join("\n");

function operationsOf(components: ComposedComponent[], dataModel: Record<string, unknown>): A2uiMessage[] {
  const surfaceId = `card-${randomUUID()}`;
  return [
    { version: A2UI_VERSION, createSurface: { surfaceId, catalogId: COMPOSE_CATALOG_ID } },
    { version: A2UI_VERSION, updateComponents: { surfaceId, components } },
    { version: A2UI_VERSION, updateDataModel: { surfaceId, path: "/", value: dataModel } },
  ];
}

/** What the model reads back: that the card is up, never the surface it already wrote. */
export function composedForModel(output: unknown): unknown {
  const card = output as Partial<ComposedCard> | null;
  return card?.ok ? { ok: true, summary: card.summary } : output;
}

export const composeCardTool = defineTool({
  name: "compose_card",
  connector: "winyu",
  tier: "read",
  roles: "all",
  description: DESCRIPTION,
  input: composeCardInputSchema,
  modelOutput: composedForModel,
  execute: async ({ components }: z.infer<typeof composeCardInputSchema>) => {
    const grounded = groundComposition(components, turnResults());
    if (!grounded.ok) return { ok: false as const, error: `การ์ดนี้ใช้ไม่ได้: ${grounded.problems.join(" · ")}` };
    const card: ComposedCard = { ok: true, summary: SHOWN_SUMMARY, a2ui_operations: operationsOf(grounded.components, grounded.dataModel) };
    return card;
  },
});
