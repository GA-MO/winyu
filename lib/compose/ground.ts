import type { z } from "zod/v3";
import { ASK_EVENT, COMPOSE_ACTION_TOOLS, COMPOSE_CATALOG, type ComponentName, type ComposedComponent } from "./catalog";

/** Tools whose results keep their own bound card (DataCard and friends); a composed card may not show them. */
export const UNCOMPOSABLE_TOOLS: readonly string[] = ["query_metric", "get_alerts", "get_forecast", "explain_gap"];

const NUMBER_TOKEN = /\d[\d,]*(?:\.\d+)?/g;
const NAME_TOKEN = /คุณ[^\s·,()]+/g;
const PICTURE_PROPS = new Set(["src"]);
const TOOL_KEY_ORDINAL = "_";
const ACTION_EVENTS: ReadonlySet<string> = new Set([ASK_EVENT, ...COMPOSE_ACTION_TOOLS]);

/** One read tool's result from this turn, as the chat agent saw it. */
export type TurnResult = { tool: string; output: unknown };

/** Where a component's relative paths point: nowhere at the card's top level, or each item of the list a template repeats it over. */
export type Scope = { base: string | null; items: string[] };

/** The scope of the card's root and every component outside a template. */
export const TOP_SCOPE: Scope = { base: null, items: [] };

/** This turn's composable results as the card's data model, with every text and number in them for the literal guard. */
export type Sources = { model: Record<string, unknown>; numbers: Set<string>; strings: Set<string>; text: string };

/** One prop checked against the turn's results: what is wrong with it and the paths it reads. */
export type PropCheck = { problems: string[]; used: string[] };

/** A template's children: one component repeated for every item of a list in the data model. */
export type Template = { componentId: string; path: string };

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBinding(value: unknown): value is { path: string } {
  return isRecord(value) && typeof value.path === "string" && Object.keys(value).length === 1;
}

/** Whether a children prop is a template rather than a list of ids. */
export function isTemplate(value: unknown): value is Template {
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

/** The turn's composable results keyed by tool name in call order (a repeat call of a tool is `<tool>_2`), with every text and number they hold. */
export function sourcesOf(results: readonly TurnResult[]): Sources {
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

function isPresent(value: unknown): boolean {
  return value !== undefined && value !== null;
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
    const present = paths.filter((concrete) => isPresent(valueAt(this.sources.model, concrete)));
    if (present.length === 0) {
      this.problems.push(`${where}: path "${paths[0] ?? path}" is not in this turn's tool results (keys: ${Object.keys(this.sources.model).join(", ") || "none"})`);
      return;
    }
    const notText = present.find((concrete) => !["string", "number"].includes(typeof valueAt(this.sources.model, concrete)));
    if (wantsText && notText) {
      this.problems.push(`${where}: path "${notText}" is not text; point it at a text field`);
      return;
    }
    present.forEach((concrete) => this.used.add(concrete));
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

/** Checks one prop of a component against the turn's results: every `{ path }` points at a value a tool returned (in at least one item of a template), and no literal carries a number, a person's name or a picture no tool returned. */
export function checkProp(component: ComposedComponent, prop: string, scope: Scope, sources: Sources): PropCheck {
  const grounding = new Grounding(sources);
  const where = `${component.id}.${prop}`;
  const value = component[prop];
  const isLayout = (component.component === "Table" && prop === "columns") || (component.component === "RankList" && prop !== "items");
  if (prop === "action") grounding.action(value, scope, where);
  else if (!isLayout) grounding.value(value, scope, where, isTextProp(component.component, prop), PICTURE_PROPS.has(prop));
  return { problems: grounding.problems, used: [...grounding.used] };
}

/** The scope a template's item is checked in: one entry per item of the list it repeats over, or why there is no such list. */
export function templateScope(template: Template, scope: Scope, sources: Sources): Scope | string {
  const base = template.path.startsWith("/") ? template.path : scope.items[0] ? absolute(template.path, scope.items[0]) : null;
  const list = base ? valueAt(sources.model, base) : undefined;
  if (!base || !Array.isArray(list)) return `template path "${template.path}" is not a list in this turn's tool results`;
  return { base, items: list.map((_, index) => `${base}/${index}`) };
}

/** The data model cut down to the paths a card reads, so the client receives only what the card shows. */
export function prunedModel(used: ReadonlySet<string>, model: Record<string, unknown>): Record<string, unknown> {
  const pruned: Record<string, unknown> = {};
  const leaves = [...used].filter((path) => !Array.isArray(valueAt(model, path)));
  for (const path of leaves) copyAt(model, pruned, path);
  for (const path of used) if (valueAt(pruned, path) === undefined) copyAt(model, pruned, path);
  return pruned;
}
