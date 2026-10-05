import type { z } from "zod/v3";
import { ASK_EVENT, COMPONENT_NAMES, COMPOSE_ACTION_TOOLS, COMPOSE_CATALOG, ROOT_ID, type ComponentName, type ComposedComponent } from "./catalog";

/** Tools whose results keep their own bound card (DataCard and friends); a composed card may not show them. */
export const UNCOMPOSABLE_TOOLS: readonly string[] = ["query_metric", "get_alerts", "get_forecast", "explain_gap", "compose_card"];

const NUMBER_TOKEN = /\d[\d,]*(?:\.\d+)?/g;
const NAME_TOKEN = /คุณ[^\s·,()]+/g;
const PICTURE_PROPS = new Set(["src"]);
const TOOL_KEY_ORDINAL = "_";
const ACTION_EVENTS: ReadonlySet<string> = new Set([ASK_EVENT, ...COMPOSE_ACTION_TOOLS]);

/** One read tool's result from this turn, as the chat agent saw it. */
export type TurnResult = { tool: string; output: unknown };

/** A composition that holds: its components and the data model pruned to what they show. */
export type Grounded = { ok: true; components: ComposedComponent[]; dataModel: Record<string, unknown> };

/** A composition refused, with every reason the model needs to fix it. */
export type Ungrounded = { ok: false; problems: string[] };

type Scope = { base: string | null; items: string[] };
type Sources = { model: Record<string, unknown>; numbers: Set<string>; strings: Set<string>; text: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBinding(value: unknown): value is { path: string } {
  return isRecord(value) && typeof value.path === "string" && Object.keys(value).length === 1;
}

function isTemplate(value: unknown): value is { componentId: string; path: string } {
  return isRecord(value) && typeof value.componentId === "string" && typeof value.path === "string";
}

function normalizedNumber(token: string): string {
  return token.replaceAll(",", "").replace(/\.0+$/, "");
}

function collectStrings(value: unknown, into: Set<string>): void {
  if (typeof value === "string") into.add(value);
  else if (typeof value === "number") into.add(String(value));
  else if (Array.isArray(value)) value.forEach((item) => collectStrings(item, into));
  else if (isRecord(value)) Object.values(value).forEach((item) => collectStrings(item, into));
}

function sourcesOf(results: readonly TurnResult[]): Sources {
  const model: Record<string, unknown> = {};
  const seen = new Map<string, number>();
  for (const result of results) {
    if (UNCOMPOSABLE_TOOLS.includes(result.tool)) continue;
    const count = (seen.get(result.tool) ?? 0) + 1;
    seen.set(result.tool, count);
    const key = count === 1 ? result.tool : `${result.tool}${TOOL_KEY_ORDINAL}${count}`;
    model[key] = result.output;
  }
  const strings = new Set<string>();
  collectStrings(model, strings);
  const text = [...strings].join("\n");
  const numbers = new Set((text.match(NUMBER_TOKEN) ?? []).map(normalizedNumber));
  return { model, numbers, strings, text };
}

function segmentsOf(path: string): string[] {
  return path.split("/").filter(Boolean);
}

function valueAt(model: unknown, path: string): unknown {
  let current = model;
  for (const segment of segmentsOf(path)) {
    if (Array.isArray(current)) current = current[Number(segment)];
    else if (isRecord(current)) current = current[segment];
    else return undefined;
  }
  return current;
}

function copyAt(source: unknown, target: Record<string, unknown>, path: string): void {
  const segments = segmentsOf(path);
  let from = source;
  let into: Record<string, unknown> | unknown[] = target;
  segments.forEach((segment, index) => {
    const next = Array.isArray(from) ? from[Number(segment)] : isRecord(from) ? from[segment] : undefined;
    const last = index === segments.length - 1;
    const slot = Array.isArray(into) ? Number(segment) : segment;
    const container = into as Record<string | number, unknown>;
    if (last) container[slot] = next;
    else container[slot] ??= Array.isArray(next) ? [] : {};
    from = next;
    into = container[slot] as Record<string, unknown> | unknown[];
  });
}

function absolute(path: string, base: string): string {
  return path.startsWith("/") ? path : `${base}/${path}`;
}

function concretePaths(path: string, scope: Scope): string[] | null {
  if (path.startsWith("/")) return [path];
  if (!scope.base) return null;
  return scope.items.map((item) => absolute(path, item));
}

function unwrap(schema: z.ZodTypeAny): z.ZodTypeAny {
  let current = schema;
  while (current._def.typeName === "ZodOptional" || current._def.typeName === "ZodNullable") current = current._def.innerType;
  return current;
}

function isTextProp(name: ComponentName, prop: string): boolean {
  const shape = COMPOSE_CATALOG[name].props.shape as Record<string, z.ZodTypeAny>;
  const schema = shape[prop];
  if (!schema) return false;
  const options = unwrap(schema)._def.options as z.ZodTypeAny[] | undefined;
  return Array.isArray(options) && options.some((option) => option._def.typeName === "ZodString");
}

class Grounding {
  readonly problems: string[] = [];
  readonly used = new Set<string>();

  constructor(private readonly sources: Sources) {}

  literal(text: string, where: string, isPicture: boolean): void {
    if (isPicture && text && !this.sources.strings.has(text)) this.problems.push(`${where}: picture "${text}" is not in this turn's tool results; bind it with { path }`);
    for (const token of text.match(NUMBER_TOKEN) ?? []) {
      if (!this.sources.numbers.has(normalizedNumber(token))) this.problems.push(`${where}: number "${token}" in "${text}" is not in this turn's tool results; bind it with { path } or leave it out`);
    }
    for (const name of text.match(NAME_TOKEN) ?? []) {
      if (!this.sources.text.includes(name)) this.problems.push(`${where}: name "${name}" is not in this turn's tool results; bind it with { path }`);
    }
  }

  bound(path: string, scope: Scope, where: string, wantsText: boolean): void {
    const paths = concretePaths(path, scope);
    if (!paths) {
      this.problems.push(`${where}: relative path "${path}" is only allowed inside a template item; start it with /<tool name>/`);
      return;
    }
    for (const concrete of paths) {
      const value = valueAt(this.sources.model, concrete);
      if (value === undefined || value === null) {
        this.problems.push(`${where}: path "${concrete}" is not in this turn's tool results (keys: ${Object.keys(this.sources.model).join(", ") || "none"})`);
        return;
      }
      if (wantsText && typeof value !== "string" && typeof value !== "number") {
        this.problems.push(`${where}: path "${concrete}" is not text; point it at a text field`);
        return;
      }
      this.used.add(concrete);
    }
  }

  value(value: unknown, scope: Scope, where: string, wantsText: boolean, isPicture: boolean): void {
    if (typeof value === "string") return this.literal(value, where, isPicture);
    if (isBinding(value)) return this.bound(value.path, scope, where, wantsText);
    if (Array.isArray(value)) return value.forEach((item, index) => this.value(item, scope, `${where}[${index}]`, false, false));
    if (isRecord(value)) for (const [key, inner] of Object.entries(value)) this.value(inner, scope, `${where}.${key}`, false, PICTURE_PROPS.has(key));
  }

  action(value: unknown, scope: Scope, where: string): void {
    const event = isRecord(value) && isRecord(value.event) ? value.event : null;
    if (!event || typeof event.name !== "string" || !ACTION_EVENTS.has(event.name)) {
      this.problems.push(`${where}: action must be { event: { name: ${[...ACTION_EVENTS].map((name) => `"${name}"`).join(" | ")}, context } }`);
      return;
    }
    this.value(event.context ?? {}, scope, `${where}.context`, false, false);
  }
}

function parsedComponents(raw: readonly unknown[], problems: string[]): Map<string, ComposedComponent> {
  const byId = new Map<string, ComposedComponent>();
  raw.forEach((entry, index) => {
    if (!isRecord(entry) || typeof entry.id !== "string" || !COMPONENT_NAMES.includes(entry.component as ComponentName)) {
      problems.push(`components[${index}]: needs a string id and component one of ${COMPONENT_NAMES.join(", ")}`);
      return;
    }
    const { id, component, ...props } = entry as ComposedComponent;
    const parsed = COMPOSE_CATALOG[component].props.safeParse(props);
    if (!parsed.success) {
      problems.push(...parsed.error.issues.map((issue) => `${id} (${component}).${issue.path.join(".")}: ${issue.message}`));
      return;
    }
    if (byId.has(id)) problems.push(`${id}: duplicate id`);
    byId.set(id, { id, component, ...(parsed.data as Record<string, unknown>) });
  });
  return byId;
}

function childrenOf(component: ComposedComponent): { ids: string[]; template: { componentId: string; path: string } | null } {
  const children = component.children;
  if (Array.isArray(children)) return { ids: children.filter((child): child is string => typeof child === "string"), template: null };
  if (isTemplate(children)) return { ids: [children.componentId], template: children };
  return { ids: [], template: null };
}

function templateScope(template: { path: string }, scope: Scope, grounding: Grounding, sources: Sources, where: string): Scope | null {
  const base = template.path.startsWith("/") ? template.path : scope.items[0] ? absolute(template.path, scope.items[0]) : null;
  const list = base ? valueAt(sources.model, base) : undefined;
  if (!base || !Array.isArray(list)) {
    grounding.problems.push(`${where}: template path "${template.path}" is not a list in this turn's tool results`);
    return null;
  }
  return { base, items: list.map((_, index) => `${base}/${index}`) };
}

function walk(id: string, scope: Scope, byId: Map<string, ComposedComponent>, grounding: Grounding, sources: Sources, trail: string[]): void {
  const component = byId.get(id);
  if (!component) {
    grounding.problems.push(`${trail.at(-1) ?? ROOT_ID}: child "${id}" is not among the components`);
    return;
  }
  if (trail.includes(id)) {
    grounding.problems.push(`${id}: is its own ancestor`);
    return;
  }
  for (const [prop, value] of Object.entries(component)) {
    if (prop === "id" || prop === "component" || prop === "children") continue;
    const where = `${id}.${prop}`;
    if (prop === "action") grounding.action(value, scope, where);
    else if (component.component === "Table" && prop === "columns") continue;
    else if (component.component === "RankList" && prop !== "items") continue;
    else grounding.value(value, scope, where, isTextProp(component.component, prop), PICTURE_PROPS.has(prop));
  }
  const { ids, template } = childrenOf(component);
  const childScope = template ? templateScope(template, scope, grounding, sources, `${id}.children`) : scope;
  if (!childScope) return;
  if (template) grounding.used.add(childScope.base ?? "");
  for (const child of ids) walk(child, childScope, byId, grounding, sources, [...trail, id]);
}

function prunedModel(used: ReadonlySet<string>, model: Record<string, unknown>): Record<string, unknown> {
  const pruned: Record<string, unknown> = {};
  const leaves = [...used].filter((path) => !Array.isArray(valueAt(model, path)));
  for (const path of leaves) copyAt(model, pruned, path);
  for (const path of used) if (valueAt(pruned, path) === undefined) copyAt(model, pruned, path);
  return pruned;
}

/** Checks a composition against this turn's read results: valid catalog components reachable from a Card root, every `{ path }` pointing at a value a tool returned, and no literal text carrying a number, a person's name or a picture that no tool returned. Returns the data model pruned to what the card shows. */
export function groundComposition(raw: readonly unknown[], results: readonly TurnResult[]): Grounded | Ungrounded {
  const problems: string[] = [];
  const byId = parsedComponents(raw, problems);
  const root = byId.get(ROOT_ID);
  if (!root || root.component !== "Card") problems.push(`the root component must have id "${ROOT_ID}" and be a Card`);
  if (problems.length > 0) return { ok: false, problems };
  const sources = sourcesOf(results);
  const grounding = new Grounding(sources);
  walk(ROOT_ID, { base: null, items: [] }, byId, grounding, sources, []);
  if (grounding.problems.length > 0) return { ok: false, problems: grounding.problems };
  return { ok: true, components: [...byId.values()], dataModel: prunedModel(grounding.used, sources.model) };
}
