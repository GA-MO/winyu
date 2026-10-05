import type { z } from "zod/v3";
import { COMPONENT_NAMES, COMPOSE_CATALOG, ROOT_ID, type ComponentName, type ComposedComponent } from "./catalog";
import { checkProp, isRecord, isTemplate, prunedModel, sourcesOf, templateScope, TOP_SCOPE, type Scope, type Sources, type Template, type TurnResult } from "./ground";

const CONTAINERS: ReadonlySet<ComponentName> = new Set(["Card", "Section", "Grid", "Carousel"]);
const MIN_DRAWN_COMPONENTS = 2;

/** What a composed card shows at one moment: its components from the root down, children cut to those that hold, and the data model cut to what they read. */
export type CardSurface = { components: ComposedComponent[]; dataModel: Record<string, unknown> };

/** A finished card block: the card to draw (null when nothing beyond the root held), how many lines held and how many were dropped, and why. */
export type CardOutcome = { surface: CardSurface | null; accepted: number; rejected: number; problems: string[] };

type Placed = { component: ComposedComponent; used: readonly string[] };
type Children = { ids: string[]; template: Template | null };

function childrenOf(component: ComposedComponent): Children {
  const children = component.children;
  if (Array.isArray(children)) return { ids: children.filter((child): child is string => typeof child === "string"), template: null };
  if (isTemplate(children)) return { ids: [children.componentId], template: children };
  return { ids: [], template: null };
}

function withChildList(props: Record<string, unknown>): Record<string, unknown> {
  const { child, ...rest } = props;
  const single = typeof rest.children === "string" ? rest.children : typeof child === "string" && rest.children === undefined ? child : null;
  return single === null ? rest : { ...rest, children: [single] };
}

function isOptionalProp(name: ComponentName, prop: string): boolean {
  const shape = COMPOSE_CATALOG[name].props.shape as Record<string, z.ZodTypeAny>;
  return shape[prop]?.isOptional() ?? true;
}

function hasChildren(component: ComposedComponent): boolean {
  const { ids } = childrenOf(component);
  return ids.length > 0;
}

/** Builds a composed card one block line at a time, checking each line against the turn's results the moment its place in the card is known: a line that fails is dropped and its siblings stay, an optional prop that fails is dropped from its line, and a line whose parent has not arrived waits for it. */
export class CardComposer {
  private readonly sources: Sources;
  private rootId: string | null = null;
  private readonly placed = new Map<string, Placed>();
  private readonly parked = new Map<string, ComposedComponent>();
  private readonly awaited = new Map<string, Scope>();
  private readonly seen = new Set<string>();
  private readonly problems: string[] = [];
  private rejected = 0;
  private lines = 0;

  constructor(results: readonly TurnResult[]) {
    this.sources = sourcesOf(results);
  }

  /** Reads one block line; returns whether a component took its place in the card. */
  read(line: string): boolean {
    const text = line.trim();
    if (!text) return false;
    this.lines += 1;
    const component = this.parsed(text, `line ${this.lines}`);
    if (!component) return false;
    if (this.seen.has(component.id)) return this.reject(`${component.id}: duplicate id`);
    this.seen.add(component.id);
    if (this.rootId === null && component.component === "Card") {
      const placed = this.place(component, TOP_SCOPE);
      if (placed) this.rootId = component.id;
      return placed;
    }
    const scope = this.awaited.get(component.id);
    if (!scope) {
      this.parked.set(component.id, component);
      return false;
    }
    this.awaited.delete(component.id);
    return this.place(component, scope);
  }

  /** The card as it stands: the root sent as `root`, then every component that holds and hangs under it; a group whose children have not arrived or did not hold is left out. */
  surface(): CardSurface | null {
    if (this.rootId === null) return null;
    const used = new Set<string>();
    const components = this.subtree(this.rootId, new Set(), used) ?? [];
    return { components, dataModel: prunedModel(used, this.sources.model) };
  }

  /** Ends the block: lines that never found a place under the card are dropped. */
  finish(): CardOutcome {
    for (const id of this.parked.keys()) this.reject(`${id}: never placed under the card`);
    this.parked.clear();
    for (const id of this.awaited.keys()) this.problems.push(`${id}: named as a child but never written`);
    this.awaited.clear();
    const surface = this.surface();
    const drawable = surface && surface.components.length >= MIN_DRAWN_COMPONENTS ? surface : null;
    return { surface: drawable, accepted: this.placed.size, rejected: this.rejected, problems: [...this.problems] };
  }

  private reject(problem: string | null): false {
    if (problem) this.problems.push(problem);
    this.rejected += 1;
    return false;
  }

  private parsed(text: string, where: string): ComposedComponent | null {
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      this.reject(`${where}: not a JSON object`);
      return null;
    }
    if (!isRecord(raw) || typeof raw.id !== "string" || !COMPONENT_NAMES.includes(raw.component as ComponentName)) {
      this.reject(`${where}: needs a string id and component one of ${COMPONENT_NAMES.join(", ")}`);
      return null;
    }
    const { id, component, ...props } = raw as ComposedComponent;
    const schema = COMPOSE_CATALOG[component].props;
    const candidate = withChildList(props);
    let parsed = schema.safeParse(candidate);
    if (!parsed.success) {
      const issues = parsed.error.issues;
      const broken = new Set(issues.map((issue) => String(issue.path[0] ?? "")));
      if ([...broken].every((prop) => prop && isOptionalProp(component, prop))) {
        this.problems.push(...issues.map((issue) => `${id}.${issue.path.join(".")}: ${issue.message} (dropped)`));
        parsed = schema.safeParse(Object.fromEntries(Object.entries(candidate).filter(([prop]) => !broken.has(prop))));
      }
    }
    if (!parsed.success) {
      this.reject(parsed.error.issues.map((issue) => `${id} (${component}).${issue.path.join(".")}: ${issue.message}`).join("; "));
      return null;
    }
    return { id, component, ...(parsed.data as Record<string, unknown>) };
  }

  private place(component: ComposedComponent, scope: Scope): boolean {
    const kept: ComposedComponent = { ...component };
    const used: string[] = [];
    for (const prop of Object.keys(component)) {
      if (prop === "id" || prop === "component" || prop === "children") continue;
      const check = checkProp(component, prop, scope, this.sources);
      if (check.problems.length === 0) {
        used.push(...check.used);
        continue;
      }
      if (!isOptionalProp(component.component, prop)) return this.reject(check.problems.join("; "));
      this.problems.push(...check.problems.map((problem) => `${problem} (dropped)`));
      delete kept[prop];
    }
    const { ids, template } = childrenOf(component);
    let childScope = scope;
    if (template) {
      const resolved = templateScope(template, scope, this.sources);
      if (typeof resolved === "string") return this.reject(`${component.id}.children: ${resolved}`);
      childScope = resolved;
      if (resolved.base) used.push(resolved.base);
    }
    this.placed.set(component.id, { component: kept, used });
    for (const id of ids) this.reach(id, childScope);
    return true;
  }

  private reach(id: string, scope: Scope): void {
    if (this.placed.has(id) || this.awaited.has(id)) return;
    const parked = this.parked.get(id);
    if (!parked) {
      if (!this.seen.has(id)) this.awaited.set(id, scope);
      return;
    }
    this.parked.delete(id);
    this.place(parked, scope);
  }

  private subtree(id: string, visited: Set<string>, used: Set<string>): ComposedComponent[] | null {
    const placed = this.placed.get(id);
    const isRoot = id === this.rootId;
    if (!placed || visited.has(id) || (!isRoot && id === ROOT_ID)) return null;
    visited.add(id);
    const { component } = placed;
    const { ids, template } = childrenOf(component);
    const below: ComposedComponent[] = [];
    const drawnIds = ids.filter((childId) => {
      const part = this.subtree(childId, visited, used);
      if (part) below.push(...part);
      return part !== null;
    });
    const children = template ? (drawnIds.length > 0 ? template : []) : drawnIds;
    const drawn: ComposedComponent = CONTAINERS.has(component.component) ? { ...component, children: children } : component;
    if (!isRoot && CONTAINERS.has(component.component) && !hasChildren(drawn)) return null;
    placed.used.forEach((path) => used.add(path));
    return [isRoot ? { ...drawn, id: ROOT_ID } : drawn, ...below];
  }
}
