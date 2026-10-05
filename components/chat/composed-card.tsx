"use client";

import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { A2UIProvider, A2UIRenderer, createCatalog, useA2UIActions, type CatalogDefinitions, type CatalogRenderers, type RendererProps } from "@copilotkit/a2ui-renderer";
import { askAction, useRunAction, type CardAction } from "@/components/cards/card-actions";
import { RowGrid } from "@/components/cards/entity/frame";
import { Carousel } from "@/components/ui/carousel";
import { Avatar, Badge, Button, Callout, Card, Image, KeyValue, ListItem, Metric, RankList, Table, type ListItemBadge } from "@/components/ui/primitives";
import { ASK_EVENT, COMPOSE_ACTION_TOOLS, COMPOSE_CATALOG, COMPOSE_CATALOG_ID, type A2uiMessage, type ComposedCard } from "@/lib/compose/catalog";
import { TH } from "@/lib/i18n/th";

type Child = string | { id: string; basePath: string };
type BuildChild = (id: string, basePath?: string) => ReactNode;
type Resolved = Record<string, unknown>;
type UserAction = { userAction?: { name?: unknown; context?: unknown } };
type Pair = { label: string; value: string };

const ACTION_TOOLS: ReadonlySet<string> = new Set(COMPOSE_ACTION_TOOLS);

function textOf(value: unknown): string | null {
  if (typeof value === "string") return value || null;
  if (typeof value === "number") return String(value);
  return null;
}

function listOf<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function pressOf(value: unknown): (() => void) | null {
  return typeof value === "function" ? (value as () => void) : null;
}

function ChildNodes({ list, build }: { list: unknown; build: BuildChild }) {
  return listOf<Child>(list).map((child, index) =>
    typeof child === "string" ? <div key={`${child}-${index}`} className="contents">{build(child)}</div> : <div key={`${child.basePath}-${index}`} className="contents">{build(child.id, child.basePath)}</div>,
  );
}

function pairsOf(props: Resolved): Pair[] {
  const rows = [...listOf<{ label?: unknown; value?: unknown }>(props.pairs), ...listOf<{ label?: unknown; value?: unknown }>(props.from)];
  return rows.flatMap((row) => {
    const label = textOf(row.label);
    const value = textOf(row.value);
    return label && value ? [{ label, value }] : [];
  });
}

function badgesOf(value: unknown): ListItemBadge[] {
  return listOf<{ label?: unknown; tone?: unknown }>(value).flatMap((badge) => {
    const label = textOf(badge.label);
    return label ? [{ label, tone: (textOf(badge.tone) as ListItemBadge["tone"]) ?? "neutral" }] : [];
  });
}

function rankItemsOf(props: Resolved) {
  const label = textOf(props.label) ?? "";
  const value = textOf(props.value) ?? "";
  const note = textOf(props.note);
  return listOf<Resolved>(props.items).map((item) => ({ label: textOf(item[label]) ?? "", value: textOf(item[value]) ?? "", note: note ? textOf(item[note]) : null }));
}

function tableRowsOf(props: Resolved): Array<Record<string, string>> {
  return listOf<Resolved>(props.rows).map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, textOf(value) ?? ""])));
}

type Renderer = (args: RendererProps<Resolved>) => ReactNode;

const RENDERERS: Record<keyof typeof COMPOSE_CATALOG, Renderer> = {
  Card: ({ props, children }) => (
    <Card props={{ title: textOf(props.title), meta: textOf(props.meta), footnote: textOf(props.footnote) }}>
      <ChildNodes list={props.children} build={children as BuildChild} />
    </Card>
  ),
  Section: ({ props, children }) => (
    <section className="flex flex-col gap-2">
      <h4 className="flex items-center gap-3 text-[11px] font-medium text-muted-foreground before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border">{textOf(props.label)}</h4>
      <ChildNodes list={props.children} build={children as BuildChild} />
    </section>
  ),
  Grid: ({ props, children }) => (
    <RowGrid>
      <ChildNodes list={props.children} build={children as BuildChild} />
    </RowGrid>
  ),
  Carousel: ({ props, children }) => (
    <Carousel>
      {listOf<Child>(props.children).map((child, index) => (
        <div key={index}>{typeof child === "string" ? (children as BuildChild)(child) : (children as BuildChild)(child.id, child.basePath)}</div>
      ))}
    </Carousel>
  ),
  ListItem: ({ props }) => (
    <ListItem
      props={{
        title: textOf(props.title) ?? "",
        subtitle: textOf(props.subtitle),
        detail: textOf(props.detail),
        src: textOf(props.src),
        media: (textOf(props.media) as "avatar" | "thumb" | "none" | null) ?? (textOf(props.src) ? "avatar" : "none"),
        badges: badgesOf(props.badges),
        trailing: textOf(props.trailing),
      }}
      onPress={pressOf(props.action)}
    />
  ),
  Person: ({ props }) => <Avatar props={{ name: textOf(props.name) ?? "", role: textOf(props.role), src: textOf(props.src), size: "lg" }} />,
  KeyValue: ({ props }) => <KeyValue props={{ pairs: pairsOf(props) }} />,
  Metric: ({ props }) => <Metric props={{ label: textOf(props.label) ?? "", value: textOf(props.value) ?? "", detail: textOf(props.detail), size: "md" }} />,
  Badge: ({ props }) => <Badge props={{ label: textOf(props.label) ?? "", tone: (textOf(props.tone) as ListItemBadge["tone"]) ?? "neutral" }} />,
  Callout: ({ props }) => <Callout props={{ title: textOf(props.title) ?? "", body: textOf(props.body) ?? "", tone: (textOf(props.tone) as "info" | "success" | "warning" | "danger" | null) ?? "info" }} />,
  Image: ({ props }) => {
    const src = textOf(props.src);
    return src ? <Image props={{ src, alt: textOf(props.alt) ?? "" }} /> : null;
  },
  Table: ({ props }) => <Table props={{ columns: listOf<{ key: string; label: string }>(props.columns), rows: tableRowsOf(props) }} />,
  RankList: ({ props }) => <RankList props={{ items: rankItemsOf(props) }} />,
  Button: ({ props }) => (
    <div className="flex">
      <Button props={{ label: textOf(props.label) ?? "", variant: (textOf(props.variant) as "primary" | "secondary" | null) ?? "secondary" }} onPress={pressOf(props.action) ?? undefined} />
    </div>
  ),
};

const CATALOG = createCatalog(COMPOSE_CATALOG as unknown as CatalogDefinitions, RENDERERS as unknown as CatalogRenderers<CatalogDefinitions>, { catalogId: COMPOSE_CATALOG_ID });

function contextOf(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

/** The chat request a composed button stands for: a question to ask, or a write tool to run behind its approval card. */
export function cardActionOf(message: UserAction): CardAction | null {
  const name = message.userAction?.name;
  const context = contextOf(message.userAction?.context);
  if (name === ASK_EVENT) {
    const prompt = [textOf(context.prompt), textOf(context.about)].filter(Boolean).join(" ");
    return prompt ? askAction(prompt) : null;
  }
  if (typeof name === "string" && ACTION_TOOLS.has(name)) return { id: `${name}-${JSON.stringify(context)}`, kind: "form", label: name, tool: name as "enroll_course", input: context };
  return null;
}

/** Whether a tool result is a card the model composed and the server grounded. */
export function isComposedCard(result: unknown): result is ComposedCard {
  return typeof result === "object" && result !== null && (result as { ok?: unknown }).ok === true && Array.isArray((result as { a2ui_operations?: unknown }).a2ui_operations);
}

function surfaceIdOf(operations: readonly A2uiMessage[]): string | null {
  for (const operation of operations) if ("createSurface" in operation) return operation.createSurface.surfaceId;
  return null;
}

function Surface({ operations }: { operations: A2uiMessage[] }) {
  const { processMessages } = useA2UIActions();
  const fed = useRef(false);
  const surfaceId = useMemo(() => surfaceIdOf(operations), [operations]);
  useEffect(() => {
    if (fed.current) return;
    fed.current = true;
    processMessages(operations as never);
  }, [operations, processMessages]);
  return surfaceId ? <A2UIRenderer surfaceId={surfaceId} className="w-full" /> : null;
}

/** A card the model composed from this turn's tool results, drawn by CopilotKit's A2UI renderer with mascop's own components; a button press goes to the chat like any card button. */
export function ComposedCardView({ result }: { result: unknown }) {
  const run = useRunAction();
  if (!isComposedCard(result)) return <p className="text-sm text-muted-foreground">{TH.cards.unreadable}</p>;
  const onAction = (message: UserAction) => {
    const action = cardActionOf(message);
    if (action) run(action);
  };
  return (
    <A2UIProvider catalog={CATALOG} onAction={onAction as never}>
      <Surface operations={result.a2ui_operations} />
    </A2UIProvider>
  );
}
